Write-Host "== Sanity: files exist? ==" -ForegroundColor Cyan
$ok = $true

# 1.1 FinishScreen.tsx существует
if (!(Test-Path -Path "src\screens\onboarding\FinishScreen.tsx")) {
  Write-Host "Missing: src\screens\onboarding\FinishScreen.tsx" -ForegroundColor Red; $ok=$false
} else {
  Write-Host "OK: FinishScreen.tsx found." -ForegroundColor Green
}

# 1.2 Внутри FinishScreen — запись onboarded и reset на MainTabs
$fs = "src\screens\onboarding\FinishScreen.tsx"
$hasOnboarded = Select-String -Path $fs -Pattern "AsyncStorage\.setItem\(['\"']onboarded['\"'],\s*['\"']1['\"']\)" -SimpleMatch:$false
$hasResetMainTabs = Select-String -Path $fs -Pattern "navigation\.reset\(\s*\{\s*index:\s*0,\s*routes:\s*\[\s*\{\s*name:\s*['\"']MainTabs['\"']" -SimpleMatch:$false
if (!$hasOnboarded) { Write-Host "Missing: setItem('onboarded','1')" -ForegroundColor Red; $ok=$false } else { Write-Host "OK: onboarded flag set." -ForegroundColor Green }
if (!$hasResetMainTabs) { Write-Host "Missing: navigation.reset(... name: 'MainTabs' ...)" -ForegroundColor Red; $ok=$false } else { Write-Host "OK: navigation.reset to MainTabs." -ForegroundColor Green }

# 1.3 В AppNavigator — чтение onboarded и экран MainTabs
$nav = "src\navigation\AppNavigator.tsx"
if (!(Test-Path $nav)) { Write-Host "Missing: $nav" -ForegroundColor Red; $ok=$false }
else {
  $hasReadFlag = Select-String -Path $nav -Pattern "AsyncStorage\.getItem\(['\"']onboarded['\"']\)" -SimpleMatch:$false
  $hasMainTabs = Select-String -Path $nav -Pattern "name=['\"']MainTabs['\"']" -SimpleMatch:$false
  if (!$hasReadFlag) { Write-Host "Missing in AppNavigator: AsyncStorage.getItem('onboarded')" -ForegroundColor Yellow } else { Write-Host "OK: reads onboarded flag." -ForegroundColor Green }
  if (!$hasMainTabs) { Write-Host "Missing in AppNavigator: <Stack.Screen name=\"MainTabs\" ..." -ForegroundColor Red; $ok=$false } else { Write-Host "OK: MainTabs screen present." -ForegroundColor Green }
}

if (-not $ok) { Write-Host "Static checks failed. Stop." -ForegroundColor Red; exit 1 }
