$ErrorActionPreference="Stop"
Write-Host "== Sanity: theme red/white =="
if(-not (Get-Content "src/theme/theme.ts" -Raw).Contains("#C8102E")) { throw "Theme red not found" }
Write-Host "OK"

Write-Host "== Sanity: Nearby has Location flow =="
$nb = Get-Content "src/screens/NearbyScreen.tsx" -Raw
if($nb -notmatch "expo-location") { throw "Nearby: expo-location missing" }
if($nb -notmatch "fetchNearbyUsers") { throw "Nearby: fetch call missing" }
Write-Host "OK"

Write-Host "== Sanity: Adults 18+ accept button =="
$ad = Get-Content "src/screens/AdultsChatScreen.tsx" -Raw
if($ad -notmatch "setAccepted\(true\)") { throw "Adults: accept handler missing" }
Write-Host "OK"

Write-Host "== Sanity: QOTD save =="
$qs = Get-Content "src/screens/QuestionScreen.tsx" -Raw
if($qs -notmatch "setDoc") { throw "Question: setDoc missing" }
Write-Host "OK"

Write-Host "== Sanity: DM screen & route =="
$nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
if($nav -notmatch 'name="DM"') { throw "Navigator: DM route missing" }
Write-Host "OK"
