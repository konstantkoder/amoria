$log = Join-Path $env:TEMP 'expo-verify.log'
Write-Host "== Tail expo log ==" -ForegroundColor Cyan
if (Test-Path $log) {
  Get-Content $log -Tail 80
} else {
  Write-Host "Log file not found at $log" -ForegroundColor Red
}

Write-Host "== If Expo didn't reach 'waiting', show quick hints ==" -ForegroundColor Yellow
Write-Host "- If port in use: add --port 8090" -ForegroundColor Yellow
Write-Host "- If LAN fails on this network: try --tunnel" -ForegroundColor Yellow
