$ErrorActionPreference = "Stop"
Write-Host "== app.json has expo-notifications plugin =="
$app = Get-Content "app.json" -Raw
if ($app -notmatch "expo-notifications") { throw "plugin expo-notifications missing" }
Write-Host "OK"
Write-Host "== notifications service exists =="
if (-not (Test-Path "src/services/notifications.ts")) { throw "notifications.ts not found" }
Write-Host "OK"
Write-Host "== swipe service quotas & superlike =="
$sw = Get-Content "src/services/swipe.ts" -Raw
if ($sw -notmatch "DAILY_LIKES") { throw "DAILY_LIKES missing" }
if ($sw -notmatch "superLikeUser") { throw "superLikeUser missing" }
Write-Host "OK"
