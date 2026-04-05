$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..")).Path
$packRoot = Join-Path $repoRoot ".tmp\\i18n_translation_pack"
$zipPath = Join-Path $repoRoot "i18n_translation_pack.zip"

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
    $destinationParent = Split-Path $destination -Parent
    Ensure-Dir $destinationParent

    if (Test-Path $fullPath -PathType Container) {
      Copy-Item -Path $fullPath -Destination $destination -Recurse -Force
    } else {
      Copy-Item -Path $fullPath -Destination $destination -Force
    }
  }
}

if (Test-Path $packRoot) {
  Remove-Item $packRoot -Recurse -Force
}
Ensure-Dir $packRoot

Copy-PathPreserve (Join-Path $repoRoot "src\\i18n")

$localeContextFiles = Get-ChildItem -Path (Join-Path $repoRoot "src") -Recurse -File -Filter "Locale*Context*" -ErrorAction SilentlyContinue
foreach ($file in $localeContextFiles) {
  Copy-PathPreserve $file.FullName
}

Copy-PathPreserve (Join-Path $repoRoot "src\\navigation")
Copy-PathPreserve (Join-Path $repoRoot "src\\screens\\LoginScreen.tsx")
Copy-PathPreserve (Join-Path $repoRoot "App.tsx")

$i18nScripts = Get-ChildItem -Path (Join-Path $repoRoot "scripts") -File -Filter "i18n-*.ts" -ErrorAction SilentlyContinue
foreach ($file in $i18nScripts) {
  Copy-PathPreserve $file.FullName
}

$lqaFiles = Get-ChildItem -Path $repoRoot -File -Filter "lqa*.txt" -ErrorAction SilentlyContinue
foreach ($file in $lqaFiles) {
  Copy-PathPreserve $file.FullName
}

Copy-PathPreserve (Join-Path $repoRoot "package.json")

$manifestPath = Join-Path $packRoot "manifest.json"
$packageJsonPath = Join-Path $repoRoot "package.json"
$repoName = ""
if (Test-Path $packageJsonPath) {
  $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
  if ($packageJson.name) {
    $repoName = $packageJson.name
  }
}
if (-not $repoName) {
  $repoName = Split-Path $repoRoot -Leaf
}

function Get-CommandValue {
  param([string]$Exe, [string[]]$Args)
  try {
    $output = & $Exe @Args 2>$null
    if ($LASTEXITCODE -ne 0) {
      return "unknown"
    }
    $value = ($output | Select-Object -First 1).Trim()
    if (-not $value) {
      return "unknown"
    }
    return $value
  } catch {
    return "unknown"
  }
}

$branch = Get-CommandValue "git" @("-C", $repoRoot, "rev-parse", "--abbrev-ref", "HEAD")
$commit = Get-CommandValue "git" @("-C", $repoRoot, "rev-parse", "HEAD")
$nodeVersion = Get-CommandValue "node" @("-v")
$npmVersion = Get-CommandValue "npm" @("-v")

$manifest = @{
  repo = $repoName
  branch = $branch
  commit = $commit
  date = (Get-Date -Format o)
  node = $nodeVersion
  npm = $npmVersion
}

$manifest | ConvertTo-Json -Depth 4 | Set-Content -Path $manifestPath

$keyUsagePath = Join-Path $packRoot "key_usage.txt"
$rg = Get-Command rg -ErrorAction SilentlyContinue
$srcPath = Join-Path $repoRoot "src"

if ($rg) {
  $rgPattern = 't\([''"][^''"]+[''"]\)'
  & rg -n $rgPattern $srcPath | Set-Content -Path $keyUsagePath
} else {
  $pattern = 't\([''"]'
  $files = Get-ChildItem -Path $srcPath -Recurse -File -ErrorAction SilentlyContinue
  $matches = Select-String -Path $files.FullName -Pattern $pattern -ErrorAction SilentlyContinue
  if ($matches) {
    $lines = $matches | ForEach-Object { "$($_.Path):$($_.LineNumber):$($_.Line)" }
    $lines | Set-Content -Path $keyUsagePath
  } else {
    Set-Content -Path $keyUsagePath -Value ""
  }
}

if (Test-Path $zipPath) {
  Remove-Item $zipPath -Force
}

Compress-Archive -Path (Join-Path $packRoot "*") -DestinationPath $zipPath -Force

Write-Host "Created i18n_translation_pack.zip at $zipPath"
