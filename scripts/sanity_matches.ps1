$ErrorActionPreference = "Stop"
Write-Host "== Sanity: services/firebase.ts =="
$svc = Get-Content "src/services/firebase.ts" -Raw
if ($svc -notmatch "submitSwipe") { throw "submitSwipe not found" }
if ($svc -notmatch "fetchMatches") { throw "fetchMatches not found" }
Write-Host "OK: service functions"

Write-Host "== Sanity: SwipeScreen uses submitSwipe =="
$sw = Get-Content "src/screens/SwipeScreen.tsx" -Raw
if ($sw -notmatch "submitSwipe") { throw "SwipeScreen does not call submitSwipe" }
Write-Host "OK: SwipeScreen wired"

Write-Host "== Sanity: Matches tab =="
$nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
if ($nav -notmatch "MatchesScreen") { throw "MatchesScreen is not added to tabs" }
Write-Host "OK: tab present"
