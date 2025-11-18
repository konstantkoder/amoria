$ErrorActionPreference = "Stop"
$pkg = Get-Content "package.json" -Raw
if ($pkg -notmatch '"expo-device"') { throw "expo-device is not in package.json" }
if ($pkg -notmatch '"expo-notifications"') { throw "expo-notifications is not in package.json" }
$mod = Get-Content "src/services/notifications.ts" -Raw
if ($mod -notmatch "import \* as Device from 'expo-device'") { throw "Wrong expo-device import" }
if ($mod -notmatch "import \* as Notifications from 'expo-notifications'") { throw "Wrong expo-notifications import" }
Write-Host "OK: notifications wiring looks good."
