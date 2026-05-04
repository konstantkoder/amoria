Param(
  [switch]$RunExpo
)

$ErrorActionPreference = "Stop"

# Move to project root (scripts/..)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Resolve-Path (Join-Path $scriptDir "..")
Set-Location $root

$report = "codex_report.txt"
Remove-Item $report -ErrorAction SilentlyContinue
function Log([string]$m) {
  $ts = (Get-Date).ToString("u")
  Add-Content -Path $report -Value "$ts  $m"
  Write-Host $m
}

Log "=== diagnostics start ==="

# .env checks
$envPath = ".\.env"
if (Test-Path $envPath) {
  Log "ENV: .env found at $envPath"
  $kv = @{}
  Get-Content $envPath | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $pair = $line -split "=", 2
    if ($pair.Count -eq 2) {
      $k = $pair[0].Trim()
      $v = $pair[1].Trim()
      $kv[$k] = $v
    }
  }
  $required = @(
    "EXPO_PUBLIC_API_URL",
    "EXPO_PUBLIC_WS_URL"
  )
  $missing = @()
  foreach ($k in $required) {
    if (-not $kv.ContainsKey($k) -or [string]::IsNullOrWhiteSpace($kv[$k])) {
      $missing += $k
    }
  }
  if ($missing.Count -gt 0) {
    Log "ENV: missing keys -> $($missing -join ', ')"
  } else {
    Log "ENV: all required backend keys are present"
  }
} else {
  Log "ENV: .env NOT found"
}

# .gitignore includes .env?
if (Test-Path ".gitignore") {
  $gi = Get-Content ".gitignore"
  if ($gi -match "^\s*\.env\s*$") {
    Log ".gitignore: contains .env  ✅"
  } else {
    Log ".gitignore: does NOT contain '.env'  ❌  (add a line: .env)"
  }
} else {
  Log ".gitignore: NOT found"
}

# babel plugins
$babel = "babel.config.js"
if (Test-Path $babel) {
  $b = Get-Content $babel -Raw
  if ($b -match "module-resolver") {
    Log "babel: module-resolver plugin present  ✅"
  } else {
    Log "babel: module-resolver plugin MISSING  ❌"
  }
  if ($b -match "react-native-reanimated/plugin") {
    Log "babel: reanimated plugin present (must be last)  ✅"
  } else {
    Log "babel: reanimated plugin MISSING  ❌"
  }
} else {
  Log "babel.config.js: NOT found"
}

# Node / npm versions
try { $nodev = (node -v) 2>$null; Log "node: $nodev" } catch { Log "node: not found" }
try { $npmv  = (npm -v)  2>$null; Log "npm:  $npmv" }  catch { Log "npm:  not found" }

# Optional: run Metro
if ($RunExpo) {
  Log "Running: npx expo start --clear"
  npx expo start --clear
}

Log "=== diagnostics done ==="
