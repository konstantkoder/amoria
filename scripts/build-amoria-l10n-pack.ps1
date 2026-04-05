$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$packRoot = Join-Path $repoRoot ".amoria_l10n_pack"
$zipPath = Join-Path $repoRoot "amoria_l10n_full_pack.zip"

Set-Location $repoRoot

function Ensure-Dir {
  param([string]$Path)
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-PathPreserve {
  param([string]$SourcePath)
  $resolved = Resolve-Path -LiteralPath $SourcePath -ErrorAction SilentlyContinue
  if (-not $resolved) {
    return
  }

  foreach ($item in $resolved) {
    $fullPath = $item.Path
    $relative = $fullPath.Substring($repoRoot.Length).TrimStart([char[]]"\\/")
    $destination = Join-Path $packRoot $relative
    Ensure-Dir (Split-Path $destination -Parent)

    if (Test-Path $fullPath -PathType Container) {
      Copy-Item -Path $fullPath -Destination $destination -Recurse -Force
    } else {
      Copy-Item -Path $fullPath -Destination $destination -Force
    }
  }
}

function Invoke-Tool {
  param([string]$Exe, [string[]]$ArgumentList)
  & $Exe @ArgumentList
  if (-not $?) {
    throw "Command failed: $Exe $($ArgumentList -join ' ')"
  }
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Command failed: $Exe $($ArgumentList -join ' ')"
  }
}

function Invoke-ToolCapture {
  param([string]$Exe, [string[]]$ArgumentList, [string]$OutputPath)
  $output = & $Exe @ArgumentList 2>&1
  if (-not $?) {
    throw "Command failed: $Exe $($ArgumentList -join ' ')"
  }
  if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
    throw "Command failed: $Exe $($ArgumentList -join ' ')"
  }
  $output | Out-File -Encoding utf8 -FilePath $OutputPath
}

if (Test-Path $packRoot) {
  Remove-Item $packRoot -Recurse -Force
}
Ensure-Dir $packRoot

Invoke-Tool "npx" @("tsx", "scripts/i18n_key_usage.ts")
Invoke-Tool "npx" @("tsx", "scripts/i18n_find_hardcoded_strings.ts")
Invoke-Tool "npx" @("tsx", "scripts/i18n_export_long_csv.ts")
Invoke-Tool "npx" @("tsx", "scripts/i18n_stats.ts")

$lqaPath = Join-Path $repoRoot "lqa_latest.txt"
if (Test-Path (Join-Path $repoRoot "scripts/i18n-lqa.ts")) {
  Invoke-ToolCapture "npx" @("tsx", "scripts/i18n-lqa.ts") $lqaPath
} else {
  "scripts/i18n-lqa.ts not found." | Out-File -Encoding utf8 -FilePath $lqaPath
}

$auditPath = Join-Path $repoRoot "i18n_audit_latest.txt"
if (Test-Path (Join-Path $repoRoot "scripts/i18n-audit.ts")) {
  Invoke-ToolCapture "npx" @("tsx", "scripts/i18n-audit.ts") $auditPath
} else {
  "scripts/i18n-audit.ts not found." | Out-File -Encoding utf8 -FilePath $auditPath
}

$glossaryPath = Join-Path $repoRoot "glossary_template.json"
if (-not (Test-Path $glossaryPath)) {
  $glossary = @{
    terms = @(
      @{ term = "Login"; note = "" },
      @{ term = "Register"; note = "" },
      @{ term = "Profile"; note = "" },
      @{ term = "Settings"; note = "" },
      @{ term = "Language"; note = "" },
      @{ term = "Privacy Policy"; note = "" },
      @{ term = "Feed"; note = "" },
      @{ term = "Now"; note = "" },
      @{ term = "Rooms"; note = "" },
      @{ term = "Chats"; note = "" },
      @{ term = "Ads"; note = "" },
      @{ term = "Nearby"; note = "" },
      @{ term = "Delete account"; note = "" },
      @{ term = "Send message"; note = "" },
      @{ term = "18+ mode"; note = "" }
    )
  }
  $glossary | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 -FilePath $glossaryPath
}

$rulesPath = Join-Path $packRoot "TRANSLATION_RULES.md"
@"
# Translation Rules

- Never change keys.
- Preserve placeholders exactly: {name}, {max}, {km}, etc.
- Preserve required \n structure where used (especially legal.* bodies).
- Keep strings short for mobile (prefer <= 28/40/60/80 thresholds).
- Keep style consistent (imperative for buttons, neutral for labels).
- No mixed scripts (e.g., sr should be Latin only if that's the project requirement).
- Prefer natural everyday language, not "machine literal" language.
"@ | Out-File -Encoding utf8 -FilePath $rulesPath

Copy-PathPreserve (Join-Path $repoRoot "src\\i18n")
Copy-PathPreserve (Join-Path $repoRoot "src\\navigation")
Copy-PathPreserve (Join-Path $repoRoot "src\\screens")
Copy-PathPreserve (Join-Path $repoRoot "src\\components")
Copy-PathPreserve (Join-Path $repoRoot "src\\constants")
Copy-PathPreserve (Join-Path $repoRoot "src\\utils")
Copy-PathPreserve (Join-Path $repoRoot "App.tsx")

$contextFiles = Get-ChildItem -Path (Join-Path $repoRoot "src\\contexts") -Recurse -File -Filter "Locale*Context*" -ErrorAction SilentlyContinue
foreach ($file in $contextFiles) {
  Copy-PathPreserve $file.FullName
}

$i18nInitFiles = Get-ChildItem -Path (Join-Path $repoRoot "src") -Recurse -File -Include "*i18n*.ts","*i18n*.tsx","*i18n*.js","*i18n*.jsx" -ErrorAction SilentlyContinue
foreach ($file in $i18nInitFiles) {
  Copy-PathPreserve $file.FullName
}

$sourceFiles = Get-ChildItem -Path (Join-Path $repoRoot "src") -Recurse -File -Include "*.ts","*.tsx","*.js","*.jsx" -ErrorAction SilentlyContinue
$patterns = @("t(", "i18n.t(", "i18next.t(", "useTranslation().t(", "<Text", "placeholder=", "title=", "Alert.alert")
$matchedFiles = Select-String -Path $sourceFiles.FullName -Pattern $patterns -SimpleMatch -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique
foreach ($filePath in $matchedFiles) {
  Copy-PathPreserve $filePath
}

Copy-PathPreserve (Join-Path $repoRoot "scripts")

$configFiles = @(
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "babel.config.js",
  "metro.config.js",
  "app.json",
  "app.config.js",
  "app.config.ts",
  "README.md"
)
foreach ($file in $configFiles) {
  Copy-PathPreserve (Join-Path $repoRoot $file)
}

$tsconfigs = Get-ChildItem -Path $repoRoot -File -Filter "tsconfig*.json" -ErrorAction SilentlyContinue
foreach ($file in $tsconfigs) {
  Copy-PathPreserve $file.FullName
}

$reportFiles = @(
  "i18n_key_usage.json",
  "i18n_hardcoded_strings.json",
  "i18n_export_long.csv",
  "i18n_stats.json",
  "lqa_latest.txt",
  "i18n_audit_latest.txt",
  "glossary_template.json"
)
foreach ($file in $reportFiles) {
  Copy-PathPreserve (Join-Path $repoRoot $file)
}

$lqaFiles = Get-ChildItem -Path $repoRoot -File -Filter "lqa*.txt" -ErrorAction SilentlyContinue
foreach ($file in $lqaFiles) {
  Copy-PathPreserve $file.FullName
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $packRoot "*") -DestinationPath $zipPath -Force

$fileList = Get-ChildItem -Path $packRoot -Recurse -File | ForEach-Object {
  $_.FullName.Substring($packRoot.Length).TrimStart([char[]]"\\/")
}

Write-Host "Included files:"
$fileList | ForEach-Object { Write-Host $_ }

$zipInfo = Get-Item $zipPath
$sizeMb = [math]::Round($zipInfo.Length / 1MB, 2)
Write-Host "ZIP size: $sizeMb MB"
Write-Host "ZIP path: $zipPath"
