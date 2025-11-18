$ErrorActionPreference = "Stop"

function Invoke-OrSkip {
    param(
        [string]$Path,
        [scriptblock]$Block,
        [string]$Description
    )
    if (-not (Test-Path $Path)) {
        Write-Warning ("Skip {0} - {1} not found" -f $Description, $Path)
        return
    }
    & $Block
}

Write-Host '== Sanity: Babel plugin (reanimated) =='
Invoke-OrSkip -Path "babel.config.js" -Description "babel.config" -Block {
    $babel = Get-Content "babel.config.js" -Raw
    if ($babel -notmatch 'react-native-reanimated/plugin') { throw "Missing 'react-native-reanimated/plugin' in babel.config.js" }
    Write-Host 'OK'
}

Write-Host '== Sanity: App.tsx bootstrap =='
Invoke-OrSkip -Path "App.tsx" -Description "App.tsx" -Block {
    $app = Get-Content "App.tsx" -Raw
    if ($app -notmatch "import 'react-native-gesture-handler'") { Write-Warning "Recommend: import 'react-native-gesture-handler' must be first in App.tsx" }
    if ($app -notmatch 'GestureHandlerRootView') { throw 'App.tsx must wrap UI with <GestureHandlerRootView>' }
    if (($app -split 'NavigationContainer').Length -lt 2) { throw 'NavigationContainer not found' }
    Write-Host 'OK'
}

Write-Host '== Sanity: AppNavigator tabs & icons =='
Invoke-OrSkip -Path "src/navigation/AppNavigator.tsx" -Description "AppNavigator" -Block {
    $nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
    if ($nav -notmatch '@expo/vector-icons') { throw 'AppNavigator: @expo/vector-icons Ionicons not imported' }
    $tabNames = @('Swipe','Nearby','Matches','Question','RandomChat','Profile')
    foreach($n in $tabNames){
        if ($nav -notmatch "name=`"$n`"") { throw "Tab $n is not registered" }
    }
    Write-Host 'OK'
}

Write-Host '== Sanity: Firebase service (swipe/matches) =='
Invoke-OrSkip -Path "src/services/firebase.ts" -Description "firebase service" -Block {
    $svc = Get-Content "src/services/firebase.ts" -Raw
    if ($svc -notmatch 'export async function swipeOn') { throw 'firebase.ts: swipeOn() not found' }
    if ($svc -notmatch 'export function listenMyMatches') { throw 'firebase.ts: listenMyMatches() not found' }
    Write-Host 'OK'
}

Write-Host '== Sanity: SwipeScreen uses new Gesture API =='
Invoke-OrSkip -Path "src/screens/SwipeScreen.tsx" -Description "SwipeScreen" -Block {
    $sw = Get-Content "src/screens/SwipeScreen.tsx" -Raw
    if ($sw -notmatch 'GestureDetector') { throw 'SwipeScreen must use GestureDetector (not PanGestureHandler)' }
    if ($sw -match 'useAnimatedGestureHandler') { throw 'Legacy useAnimatedGestureHandler still present - remove' }
    if ($sw -notmatch 'swipeOn\(') { throw 'SwipeScreen must call swipeOn()' }
    Write-Host 'OK'
}

Write-Host '== Sanity: Matches screen =='
Invoke-OrSkip -Path "src/screens/MatchesScreen.tsx" -Description "MatchesScreen" -Block {
    $ms = Get-Content "src/screens/MatchesScreen.tsx" -Raw
    if ($ms -notmatch 'listenMyMatches') { throw 'MatchesScreen must subscribe via listenMyMatches()' }
    Write-Host 'OK'
}

Write-Host "`nAll sanity checks passed :)"
