$ErrorActionPreference = "Stop"

Write-Host "== Sanity: reanimated plugin =="
$babel = Get-Content "babel.config.js" -Raw
if ($babel -notmatch "react-native-reanimated/plugin") { throw "Missing reanimated plugin in babel.config.js" }
Write-Host "OK: plugin is present"

Write-Host "== Sanity: GestureHandlerRootView =="
$app = Get-Content "App.tsx" -Raw
if ($app -notmatch "GestureHandlerRootView") { throw "App.tsx is not wrapped into GestureHandlerRootView" }
Write-Host "OK: App.tsx wrapped"

Write-Host "== Sanity: SwipeScreen =="
if (-not (Test-Path "src/screens/SwipeScreen.tsx")) { throw "SwipeScreen.tsx not found" }
$sw = Get-Content "src/screens/SwipeScreen.tsx" -Raw
if ($sw -notmatch "react-native-reanimated") { throw "SwipeScreen does not import reanimated" }
Write-Host "OK: SwipeScreen imports reanimated"

Write-Host "== Sanity: Tab icons =="
$nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
if ($nav -notmatch "@expo/vector-icons") { throw "Tab icons: @expo/vector-icons not found in AppNavigator" }
Write-Host "OK: Tab icons wired"
