param(
  [string]$Serial = "emulator-5554",
  [string]$AdbPath = "F:\Android\Sdk\platform-tools\adb.exe",
  [string]$MailpitUrl = "http://localhost:8025",
  [Parameter(Mandatory = $true)][string]$EvidenceDirectory
)

$ErrorActionPreference = "Stop"
$uiRemotePath = "/sdcard/amoria-mobile-auth-ui.xml"
New-Item -ItemType Directory -Force -Path $EvidenceDirectory | Out-Null

function Invoke-Adb([string[]]$Arguments) {
  & $AdbPath -s $Serial @Arguments
  if ($LASTEXITCODE -ne 0) { throw "ADB command failed" }
}

function Get-Ui {
  Invoke-Adb @("shell", "uiautomator", "dump", "--compressed", $uiRemotePath) | Out-Null
  $raw = (Invoke-Adb @("exec-out", "cat", $uiRemotePath)) -join "`n"
  return [xml]$raw
}

function Find-UiNode([xml]$Ui, [string]$Label) {
  $nodes = @($Ui.SelectNodes("//node") | Where-Object {
    ($_.text -eq $Label -or $_.'content-desc' -eq $Label) -and $_.bounds
  })
  $clickable = $nodes | Where-Object { $_.clickable -eq "true" } | Select-Object -First 1
  if ($clickable) { return $clickable }
  return $nodes | Select-Object -First 1
}

function Get-Center($Node) {
  if (-not $Node -or $Node.bounds -notmatch '^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$') {
    throw "UI node has no usable bounds"
  }
  return @(
    [int](([int]$matches[1] + [int]$matches[3]) / 2),
    [int](([int]$matches[2] + [int]$matches[4]) / 2)
  )
}

function Tap-Label([string]$Label) {
  $ui = Get-Ui
  $node = Find-UiNode $ui $Label
  if (-not $node) { throw "Could not find UI label: $Label" }
  $center = Get-Center $node
  Invoke-Adb @("shell", "input", "tap", [string]$center[0], [string]$center[1]) | Out-Null
}

function Has-Label([xml]$Ui, [string]$Label) {
  return [bool](Find-UiNode $Ui $Label)
}

function Wait-Label([string]$Label, [int]$Attempts = 20) {
  for ($index = 0; $index -lt $Attempts; $index += 1) {
    $ui = Get-Ui
    if (Has-Label $ui $Label) { return $ui }
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for UI label: $Label"
}

function Input-Text([string]$Value) {
  Invoke-Adb @("shell", "input", "text", $Value) | Out-Null
}

function Capture-Screenshot([string]$Name) {
  $remote = "/sdcard/$Name"
  $local = Join-Path $EvidenceDirectory $Name
  Invoke-Adb @("shell", "screencap", "-p", $remote) | Out-Null
  Invoke-Adb @("pull", $remote, $local) | Out-Null
}

function Wait-MailCode([string]$Email, [string]$Subject, [datetime]$NotBefore) {
  for ($index = 0; $index -lt 40; $index += 1) {
    $mailbox = Invoke-RestMethod -Uri "$MailpitUrl/api/v1/messages"
    $summary = @($mailbox.messages | Where-Object {
      $_.Subject -eq $Subject -and
      ([datetime]$_.Created).ToUniversalTime() -ge $NotBefore.ToUniversalTime().AddSeconds(-1)
    } | Sort-Object { [datetime]$_.Created } -Descending | Select-Object -First 1)
    if ($summary.Count -gt 0) {
      $message = Invoke-RestMethod -Uri "$MailpitUrl/api/v1/message/$($summary[0].ID)"
      $isRecipient = @($message.To | Where-Object Address -eq $Email).Count -gt 0
      if ($isRecipient -and [string]$message.Text -match '\b([0-9]{6})\b') {
        return $matches[1]
      }
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Timed out waiting for SMTP message"
}

function Open-Registration {
  $ui = Get-Ui
  if (Has-Label $ui "Get started") {
    Tap-Label "Get started"
    Wait-Label "Your name" | Out-Null
  }
}

function Enter-Registration([string]$Email, [string]$Secret) {
  Tap-Label "Your name"
  Input-Text "MobileQA"
  Tap-Label "Email"
  Input-Text $Email
  Tap-Label "Password"
  Input-Text $Secret
  Invoke-Adb @("shell", "input", "keyevent", "66") | Out-Null
}

function Dismiss-OptionalModal {
  $ui = Get-Ui
  foreach ($label in @("Not now", "Later", "Cancel", "Close")) {
    if (Has-Label $ui $label) {
      Tap-Label $label
      Start-Sleep -Milliseconds 500
      return
    }
  }
}

function Wait-Authenticated {
  for ($index = 0; $index -lt 30; $index += 1) {
    $ui = Get-Ui
    if (Has-Label $ui "Together" -or Has-Label $ui "Nearby") { return $ui }
    Dismiss-OptionalModal
    Start-Sleep -Milliseconds 500
  }
  throw "Timed out waiting for authenticated app"
}

function Logout-Mobile {
  $ui = Get-Ui
  $menuLabel = @("Menu", "Open menu") | Where-Object { Has-Label $ui $_ } | Select-Object -First 1
  if (-not $menuLabel) {
    Invoke-Adb @("shell", "input", "tap", "70", "200") | Out-Null
  } else {
    Tap-Label $menuLabel
  }
  Wait-Label "Logout" | Out-Null
  Tap-Label "Logout"
  Start-Sleep -Milliseconds 500
  $confirm = Get-Ui
  if (Has-Label $confirm "Logout") { Tap-Label "Logout" }
  Wait-Label "Get started" | Out-Null
}

function Open-PasswordReset {
  Tap-Label "Already have an account? Sign in"
  Wait-Label "Forgot password?" | Out-Null
  Tap-Label "Forgot password?"
  Wait-Label "Reset password" | Out-Null
}

$email = "amoria.qa.mobile.$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())@example.com"
$oldPassword = "$([guid]::NewGuid().ToString('N').Substring(0, 14))Aa1"
$newPassword = "$([guid]::NewGuid().ToString('N').Substring(0, 14))Bb2"
$verificationCode = $null
$resetCode = $null

try {
  Open-Registration
  $verificationStarted = [datetime]::UtcNow
  Enter-Registration $email $oldPassword
  Wait-Label "Check your email" | Out-Null
  Capture-Screenshot "mobile-verification-screen.png"
  $verificationCode = Wait-MailCode $email "Verify your Amoria email" $verificationStarted
  Tap-Label "6-digit code"
  Input-Text $verificationCode
  Invoke-Adb @("shell", "input", "keyevent", "66") | Out-Null
  Wait-Authenticated | Out-Null
  Capture-Screenshot "mobile-authenticated-after-verification.png"
  Write-Output "MOBILE_REGISTRATION_TO_VERIFICATION=YES"
  Write-Output "MOBILE_REAL_CODE_VERIFICATION=YES"

  Logout-Mobile
  Write-Output "MOBILE_LOGOUT=YES"

  Open-PasswordReset
  Tap-Label "Email"
  Input-Text $email
  $resetStarted = [datetime]::UtcNow
  Tap-Label "Send reset code"
  Wait-Label "If an account exists for this email, a reset code is on its way." | Out-Null
  Capture-Screenshot "mobile-password-reset-code-screen.png"
  $resetCode = Wait-MailCode $email "Reset your Amoria password" $resetStarted
  Tap-Label "6-digit code"
  Input-Text $resetCode
  Invoke-Adb @("shell", "input", "keyevent", "4") | Out-Null
  Tap-Label "New password"
  Input-Text $newPassword
  Invoke-Adb @("shell", "input", "keyevent", "4") | Out-Null
  Tap-Label "Set new password"
  Wait-Label "Your password has been changed. Sign in with the new password." | Out-Null
  Capture-Screenshot "mobile-password-reset-success.png"
  Tap-Label "Back to sign in"
  Wait-Label "Sign in" | Out-Null
  Tap-Label "Password"
  Input-Text $newPassword
  Invoke-Adb @("shell", "input", "keyevent", "66") | Out-Null
  Wait-Authenticated | Out-Null
  Capture-Screenshot "mobile-login-after-reset.png"
  Write-Output "MOBILE_PASSWORD_RESET=YES"
  Write-Output "MOBILE_LOGIN_WITH_NEW_PASSWORD=YES"
} finally {
  $oldPassword = "[redacted]"
  $newPassword = "[redacted]"
  $verificationCode = "[redacted]"
  $resetCode = "[redacted]"
}
