# BUGFIX-TOGETHER-QUEUE-CANCEL-LIFECYCLE-06

Updated: 2026-05-25

## Root Cause

The mobile `PlayMatchScreen` cancelled a valid waiting queue row from ordinary lifecycle paths: navigation `beforeRemove` and component cleanup. When the screen remounted, blurred, or was replaced during normal navigation, the first tester's row could move from `waiting` to `cancelled` after roughly 12-26 seconds. That made matching look like both devices had to tap start almost simultaneously.

## Queue Cancel Rules

Mobile may cancel a queue row only for explicit user intent or a backend terminal state:

- `user_stop`: user taps Stop search.
- `user_back`: user explicitly returns/back-navigates from the match screen.
- `retry_restart`: user explicitly stops and starts over.
- `radius_expansion`: user confirms radius expansion and a new search.
- `matched`: backend matched the row; mobile does not send a cancel.
- `server_expired`: backend expiry results in status `expired`, not `cancelled`.

Ordinary cleanup, re-render, route param churn, focus/blur, temporary background/foreground, and polling transitions must not cancel a `waiting` row.

## Diagnostics

Together queue rows now carry safe diagnostics:

- `cancelledAt`
- `cancelSource`
- `cancelReason`
- `lastAction`
- `lastActionAt`
- `lastClientPollAt`

Admin Queue shows `waitingReason` separately from cancel metadata. `waitingReason` explains why no candidate matched yet. `cancelSource` explains who or what stopped a queue row.

Suspicious mobile lifecycle sources are highlighted:

- `screen_cleanup`
- `navigation_blur`
- `unknown`

Exact latitude/longitude remain hidden from mobile responses, admin responses, client errors, docs evidence, and UI.

## Staggered Start Smoke

1. Device A starts Together with real location.
2. Verify Admin Queue shows A as `waiting`, `hasCoordinates=true`, and the expected `geoMode`.
3. Wait 10-30 seconds.
4. Device B starts the same compatible activity/radius.
5. Both users should match without simultaneous tapping.
6. If A becomes `cancelled`, inspect `cancelSource`, `cancelReason`, and `lastAction` before guessing from `waitingReason`.

## Sessions Visibility

If a queue row cancels before a match, no Together session should exist. If `matchedSessionId` is present, Admin Sessions should load the session newest-first, including zero-event sessions, stale heartbeat, participant `leftAt`, and `endedReason`.

## Peer Media

Peer media diagnostics remain a secondary check in this block. Client Errors should use safe `mediaId`, `urlKind`, `hasAvatarUrl`, and `photoCount` metadata, with no raw media URLs.

## Historical Age Filter Note

Together age filtering was intentionally not part of this historical block. The later release architecture uses private `birthDate`, safe `ageGroup`, and Together `preferredAgeRange`; the legacy `FlirtSettingsScreen` was removed from active release UI.
