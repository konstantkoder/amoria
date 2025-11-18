$ErrorActionPreference = "Stop"
Write-Host "== Sanity: FinishScreen =="
$file = "src/screens/onboarding/FinishScreen.tsx"
if (-not (Test-Path $file)) { throw "Missing file $file" }
$txt = Get-Content $file -Raw
if ($txt -notmatch "AsyncStorage\.setItem\('onboarded'") {
  throw "AsyncStorage.setItem('onboarded', ...) not found"
}
if ($txt -notmatch "navigation\.reset\(\{ index: 0, routes: \[\{ name: 'MainTabs' \}\] \}\)") {
  throw "navigation.reset(... MainTabs) not found"
}
Write-Host "OK: FinishScreen writes flag and resets to MainTabs"
