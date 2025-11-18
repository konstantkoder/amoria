$ErrorActionPreference = "Stop"
Write-Host "== Sanity: Deck =="
if (-not (Test-Path "src/screens/DeckScreen.tsx")) { throw "DeckScreen.tsx not found" }
$nav = Get-Content "src/navigation/AppNavigator.tsx" -Raw
if ($nav -notmatch 'name="Deck"') { throw "Tab 'Deck' is not registered" }
$svc = Get-Content "src/services/firebase.ts" -Raw
if ($svc -notmatch "export async function sendSpark") { throw "sendSpark() missing in firebase.ts" }
if ($svc -notmatch "export function listenMyMatches") { Write-Warning "listenMyMatches() not found (optional for phase 1)" }
Write-Host "OK: Deck wiring looks good"
