$ErrorActionPreference = "Stop"
$babel = Get-Content "babel.config.js" -Raw
if ($babel -notmatch "react-native-reanimated/plugin") { throw "Missing reanimated plugin" }
$app = Get-Content "App.tsx" -Raw
if ($app -notmatch "react-native-gesture-handler") { throw "Missing RHG import in App.tsx" }
$nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
if ($nav -notmatch 'name="Onboarding"' -or $nav -notmatch 'name="MainTabs"') { throw "Both routes must be registered" }
$finish = Get-Content "src/screens/onboarding/FinishScreen.tsx" -Raw
if ($finish -notmatch 'getParent\(\)\?\.navigate\(''MainTabs''\)') { throw "FinishScreen should navigate parent to MainTabs" }
Write-Host "OK"
