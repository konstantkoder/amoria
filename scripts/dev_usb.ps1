$ErrorActionPreference = "Stop"

Write-Host "== Amoria: DEV USB start =="

# Проверка adb
try {
  $adb = (Get-Command adb -ErrorAction Stop).Source
} catch {
  Write-Host "ADB not found. Install Android Platform Tools and add adb to PATH."
  exit 1
}

# Проверка устройства
$devices = & adb devices
Write-Host $devices

if ($devices -notmatch "device`r?`n") {
  Write-Host "No Android device detected. Enable USB debugging and accept the RSA prompt."
  exit 1
}

# Проброс портов (порт Expo/Metro + стандартные Expo порты на всякий случай)
$ports = @(8092, 19000, 19001, 19002, 8081)
foreach ($p in $ports) {
  try {
    & adb reverse "tcp:$p" "tcp:$p" | Out-Null
  } catch {
    # не критично
  }
}

Write-Host "ADB reverse done. Starting Expo (localhost)..."
& npx expo start --dev-client -c --port 8092 --localhost
