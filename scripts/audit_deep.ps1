$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path audit | Out-Null

Write-Host "== 1) Дерево проекта (укороченное) =="
Get-ChildItem -Recurse -Force `
  | Where-Object { $_.FullName -notmatch "node_modules|\.git|android|ios|\.expo|\.cache" } `
  | Select-Object FullName `
  | ForEach-Object { $_.FullName.Replace((Get-Location).Path + "\", "") } `
  | Out-File audit/tree.txt -Encoding utf8

Write-Host "== 2) package.json / app.json / babel / tsconfig =="
Get-Content package.json -Raw | Out-File audit/package.json.txt -Encoding utf8
if (Test-Path app.json)       { Get-Content app.json -Raw       | Out-File audit/app.json.txt -Encoding utf8 }
if (Test-Path babel.config.js){ Get-Content babel.config.js -Raw| Out-File audit/babel.config.js.txt -Encoding utf8 }
if (Test-Path tsconfig.json)  { Get-Content tsconfig.json -Raw  | Out-File audit/tsconfig.json.txt -Encoding utf8 }

Write-Host "== 3) Навигация и Onboarding =="
Get-ChildItem -Recurse -Include App.tsx,AppNavigator.tsx,**\*FinishScreen.tsx | `
  ForEach-Object {
    Add-Content audit/navigation_scan.txt "`n--- $($_.FullName) ---`n"
    Get-Content $_.FullName -Raw | Add-Content audit/navigation_scan.txt
  }

Write-Host "== 4) Поиск запрещённой лексики (Play безопасн.) =="
$code = Get-ChildItem -Recurse -Include *.ts,*.tsx,*.md,*.json `
  | Where-Object { $_.FullName -notmatch "node_modules|\.git|audit" } `
  | ForEach-Object { (Get-Content $_.FullName -Raw) }
Set-Content audit/forbidden.txt ""
function Check($word) {
  if ($code -match $word) { Add-Content audit/forbidden.txt "Found: $word" }
}
("sex chat", "hookup", "escort", "prostitute", "sugar", "onlyfans", "nsfw", "porn") | ForEach-Object { Check $_ }

Write-Host "== 5) TypeScript и Expo Doctor =="
try { npx tsc --noEmit | Out-File audit/tsc.txt -Encoding utf8 } catch { $_ | Out-File audit/tsc.txt -Encoding utf8 }
try { npx expo-doctor | Out-File audit/expo-doctor.txt -Encoding utf8 } catch { $_ | Out-File audit/expo-doctor.txt -Encoding utf8 }

Write-Host "== 6) Проверка Reanimated/Gesture/Babel =="
$babel = (Get-Content babel.config.js -Raw)
if ($babel -notmatch "react-native-reanimated/plugin") {
  Add-Content audit/reanimated_check.txt "Missing RN Reanimated plugin"
} else {
  Add-Content audit/reanimated_check.txt "OK: reanimated plugin present"
}
if ($babel -notmatch "module-resolver") {
  Add-Content audit/reanimated_check.txt "WARN: module-resolver alias @ → src не найден"
}

Write-Host "== 7) Проверка EXPO_PUBLIC_* ключей =="
if (Test-Path .env) {
  Get-Content .env -Raw | Out-File audit/env.txt -Encoding utf8
} elseif (Test-Path .env.local) {
  Get-Content .env.local -Raw | Out-File audit/env.txt -Encoding utf8
} else {
  "ENV file not found" | Out-File audit/env.txt -Encoding utf8
}

Write-Host "== 8) Снимок экранов/сервисов =="
Get-ChildItem -Recurse -Include src\screens\*.tsx,src\services\*.ts,src\navigation\*.tsx `
  | ForEach-Object {
    Add-Content audit/src_snapshot.txt "`n--- $($_.FullName) ---`n"
    Get-Content $_.FullName -Raw | Add-Content audit/src_snapshot.txt
  }

Write-Host "== DONE =="
Write-Host "Отчёты в папке ./audit"
