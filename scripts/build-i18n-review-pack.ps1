$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Tmp = Join-Path $Root ".review_pack_tmp"
$ZipPath = Join-Path $Root "i18n_review_pack.zip"

if (Test-Path $Tmp) {
  Remove-Item -Recurse -Force $Tmp
}

New-Item -ItemType Directory -Path $Tmp | Out-Null

try {
  $LocaleSrc = Join-Path $Root "src\\i18n\\locales"
  $LocaleDst = Join-Path $Tmp "src\\i18n\\locales"
  New-Item -ItemType Directory -Path $LocaleDst -Force | Out-Null

  Get-ChildItem -Path $LocaleSrc -Filter "*.json" | ForEach-Object {
    Copy-Item -Path $_.FullName -Destination $LocaleDst -Force
  }

  $ScriptsDst = Join-Path $Tmp "scripts"
  New-Item -ItemType Directory -Path $ScriptsDst -Force | Out-Null

  $AuditSrc = Join-Path $Root "scripts\\i18n-audit.ts"
  if (Test-Path $AuditSrc) {
    Copy-Item -Path $AuditSrc -Destination $ScriptsDst -Force
  }

  $LqaSrc = Join-Path $Root "scripts\\i18n-lqa.ts"
  if (Test-Path $LqaSrc) {
    Copy-Item -Path $LqaSrc -Destination $ScriptsDst -Force
  }

  $LqaFiles = @("lqa.txt", "lqa_after.txt", "lqa_after_auth.txt")
  foreach ($Name in $LqaFiles) {
    $LqaPath = Join-Path $Root $Name
    if (Test-Path $LqaPath) {
      Copy-Item -Path $LqaPath -Destination $Tmp -Force
    }
  }

  $Readme = @"
i18n review pack

Guidelines:
- en.json is the source of truth for meaning.
- Do not change any keys.
- Preserve placeholders like {name} {count} {km} {max}.
- Preserve \\n newlines.
- Serbian (sr) must be Latin, not Cyrillic.
"@
  $ReadmePath = Join-Path $Tmp "REVIEW_README.txt"
  Set-Content -Path $ReadmePath -Value $Readme -Encoding UTF8

  Compress-Archive -Path (Join-Path $Tmp "*") -DestinationPath $ZipPath -Force
}
finally {
  if (Test-Path $Tmp) {
    Remove-Item -Recurse -Force $Tmp
  }
}
