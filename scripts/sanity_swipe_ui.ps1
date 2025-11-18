$ErrorActionPreference = "Stop"
$must = @(
  "src/utils/compat.ts",
  "src/components/ProfileCard.tsx",
  "src/components/VerifiedBadge.tsx",
  "src/components/CompatibilityChip.tsx",
  "src/screens/SwipeScreen.tsx"
)
foreach ($f in $must) {
  if (-not (Test-Path $f)) {
    throw "Missing $f"
  }
}
Write-Host "OK: all swipe UI files present."
