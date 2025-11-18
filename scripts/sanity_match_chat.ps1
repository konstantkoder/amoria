$ErrorActionPreference = "Stop"
Write-Host "== Sanity: swipe service =="
if (-not (Test-Path "src/services/swipe.ts")) { throw "src/services/swipe.ts not found" }
Write-Host "OK"

Write-Host "== Sanity: Chat screen registered =="
$nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
if ($nav -notmatch "name=`"Chat`"") { throw "Chat screen isn't registered in AppNavigator" }
Write-Host "OK"

Write-Host "== Sanity: Swipe overlay =="
$sw = Get-Content "src/screens/SwipeScreen.tsx" -Raw
if ($sw -notmatch "LIKE") { throw "LIKE overlay not found" }
if ($sw -notmatch "passUser") { throw "passUser call not found" }
if ($sw -notmatch "likeUser") { throw "likeUser call not found" }
Write-Host "OK"
