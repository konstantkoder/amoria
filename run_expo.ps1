Write-Host "== Kill stray node.exe ==" -ForegroundColor Cyan
try {
  taskkill.exe /F /IM node.exe | Out-Null
} catch {
  # Ignore if node.exe not running
}

Write-Host "== Ensure deps installed ==" -ForegroundColor Cyan
& "$env:ProgramFiles\nodejs\npm.cmd" install

Write-Host "== Start Expo (clean, LAN, port 8082) ==" -ForegroundColor Cyan
$log = Join-Path $env:TEMP 'expo-verify.log'
& "$env:ProgramFiles\nodejs\npx.cmd" expo start -c --lan --port 8082 | Tee-Object -FilePath $log
