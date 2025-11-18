$ErrorActionPreference = "Stop"
Write-Host "== Sanity: Flirt 18+ & Play safety =="
$files = Get-ChildItem -Recurse -Include *.ts,*.tsx,*.json -Path . | Where-Object {
  $_.FullName -notmatch "node_modules" -and $_.FullName -notmatch "moderation\.ts$"
}
$code = $files | ForEach-Object { Get-Content $_.FullName -Raw }
function MustNotContain($needle) {
  if ($code -match $needle) { throw "Forbidden term present: $needle" }
}
MustNotContain "sex chat"
MustNotContain "hookup"
MustNotContain "escort"
MustNotContain "prostitute"
MustNotContain "sugar"
if (-not (Test-Path "src/screens/settings/FlirtSettingsScreen.tsx")) { throw "FlirtSettingsScreen missing" }
if (-not (Test-Path "src/services/moderation.ts")) { throw "moderation.ts missing" }
Write-Host "OK: Flirt 18+ wiring looks good and wording is safe"
