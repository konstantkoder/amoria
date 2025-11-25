$ErrorActionPreference="Stop"
$t = Get-Content "src/theme/theme.ts" -Raw
if ($t -notmatch "#D71921") { throw "Theme: primary red not applied" }
$nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
if ($nav -notmatch "FeedScreen") { throw "Navigation: FeedScreen not wired" }
if ($nav -notmatch "Adults18") { throw "Navigation: Adults18 tab missing" }
if (-not (Test-Path "src/screens/FeedScreen.tsx")) { throw "FeedScreen.tsx missing" }
if (-not (Test-Path "src/screens/AdultsChatScreen.tsx")) { throw "AdultsChatScreen.tsx missing" }
Write-Host "OK: feed/theme/adults wired"
