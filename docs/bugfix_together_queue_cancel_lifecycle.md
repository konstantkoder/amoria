# BUGFIX-TOGETHER-QUEUE-CANCEL-LIFECYCLE-06

Updated: 2026-05-25

## Root Cause

`PlayMatchScreen` was cancelling a valid Together `waiting` row from ordinary navigation/component lifecycle paths. The release fix removes queue cancellation from cleanup and navigation listeners. A waiting row now survives harmless re-render, remount, focus/blur, temporary app backgrounding, and poll transitions.

## Mobile Rules

Mobile sends queue cancellation only for explicit user intent:

- `user_stop`: user taps Stop search.
- `user_back`: user explicitly returns from the match screen.
- `retry_restart`: user taps Stop and start again.
- `radius_expansion`: user confirms radius expansion.

Polling failures do not cancel queue. One failed poll shows a retrying connection message; Client Errors are reported only after repeated failures.

The delayed guidance appears after about 90 seconds and polling continues. The active waiting primary action is Stop search, not blind retry.

## Build Diagnostics

Client Errors include safe build metadata:

- `appVersion`
- `buildNumber`
- `releaseChannel` when `EXPO_PUBLIC_RELEASE_CHANNEL` is set
- `gitSha` when `EXPO_PUBLIC_GIT_SHA` is set
- `releaseVersion` from `EXPO_PUBLIC_RELEASE_VERSION`, falling back to git SHA or app version/build

Exact coordinates are redacted from Client Error metadata.

## Staggered Start Smoke

1. Device A starts Together with granted location.
2. Wait 10-30 seconds.
3. Device B starts a compatible search.
4. Both should match without simultaneous tapping.
5. If the row cancels, inspect Admin Queue `cancelSource`, not only `waitingReason`.

## Historical Age Filter Note

Age filtering was intentionally not part of this historical block. The later release architecture uses private `birthDate`, safe `ageGroup`, and Together `preferredAgeRange`; the legacy `FlirtSettingsScreen` was removed from active release UI.
