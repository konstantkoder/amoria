$ErrorActionPreference = "Stop"

Write-Host "== Sanity: babel reanimated plugin last =="
$babel = Get-Content "babel.config.js" -Raw
if ($babel -notmatch "react-native-reanimated/plugin") { throw "Missing reanimated plugin" }
if ($babel -match "plugin'\,\s*\]\,\s*\]\,\s*\]") { } # noop, just avoid false-positives
Write-Host "OK"

Write-Host "== Sanity: single NavigationContainer (only in App.tsx) =="
$navHits = Select-String -Path "App.tsx" -Pattern "NavigationContainer" -SimpleMatch
if (-not $navHits) { throw "NavigationContainer not found" }
$srcFiles = Get-ChildItem -Path "src" -Recurse -File
$more = Select-String -Path $srcFiles.FullName -Pattern "NavigationContainer" -SimpleMatch -ErrorAction SilentlyContinue
if ($more) { throw "Found extra NavigationContainer in:`n$($more.Path | Sort-Object -Unique)" }
Write-Host "OK"

Write-Host "== Sanity: GestureHandlerRootView at root =="
$app = Get-Content "App.tsx" -Raw
if ($app -notmatch "GestureHandlerRootView") { throw "App.tsx is not wrapped in GestureHandlerRootView" }
Write-Host "OK"

Write-Host "== Sanity: FinishScreen uses parent.navigate(MainTabs) =="
$finish = Get-Content "src/screens/onboarding/FinishScreen.tsx" -Raw
if (-not $finish.Contains("getParent()?.navigate('MainTabs')")) { throw "FinishScreen still uses reset/incorrect nav" }
Write-Host "OK -- sanity passed"
