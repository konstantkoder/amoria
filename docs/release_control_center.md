# Amoria Release Control Center

Updated: 2026-05-25

## Release Rules

- No mock, stub, fake, Firebase fallback, or local-only success path counts as release evidence.
- Together, Admin Web, media moderation, reports, audit, and ops health must use real backend endpoints.
- Do not touch local launch/archive files from release commits.
- Nearby and Announcements are out of scope for this Together/Admin pass.

## Branches

- Server branch: `backend/standalone-foundation`
- Mobile branch: `migration/remove-firebase-foundation`

## Together Geo Contract

- Together requires foreground location for every queue request.
- Default user flow radius is `25 km`.
- Valid finite radiuses are `5`, `25`, `100`, and `250` km.
- No-limit sends real coordinates with `radiusKm:null`; it means no distance cap, not no geolocation.
- Exact coordinates are never returned to peers, admin queue/session responses, DM, public profile, or client error reports.
- Old waiting rows without coordinates are release-invalid and should expire or be cancelled through Admin Queue.
- Search should remain waiting for late peer joins; users do not need to press start simultaneously.
- PlayMatch must not cancel queue from cleanup, remount, focus/blur, route changes, or temporary backgrounding.
- Queue cancellation must carry `cancelSource`; Admin Queue distinguishes `waitingReason` from true cancellation source.
- Device/emulator GPS failures must explain that coordinates are unavailable and must not start queue.

## Together Draw Tools

- Draw eraser is backend-backed through `stroke_batch` events with `tool:"erase"`.
- Brush strokes use `tool:"draw"`; legacy strokes without `tool` remain valid as draw strokes.
- Story Sparks sessions reject draw stroke events.
- Replay/history/detail must rebuild brush and eraser effects from backend events.
- Mobile zoom/pan/reset is viewport-only and must not alter saved stroke coordinates.
- Fullscreen/focus mode must keep exit fullscreen and leave-session controls available.

## Admin Web Release Surface

Owner/ops/moderator/support roles should use Admin Web for release diagnostics:

- Dashboard
- Users
- Admin Users
- Client Errors
- Reports
- Media Moderation
- Together Queue
- Together Sessions
- Audit Log
- Ops Health
- Bootstrap

Together Queue is the smoke-test control surface for waiting/matched/expired/cancelled queue rows, `radiusKm`, `hasCoordinates`, `geoMode`, `waitingReason`, `cancelSource`, `cancelReason`, `cancelledAt`, `lastAction`, waiting age, stale state, and audited waiting-row cancellation.

Together Sessions is the smoke-test control surface for created, active, finished, abandoned, cancelled, and recently ended sessions, including zero-event sessions, stale heartbeat, participant counts, event counts, story choice counts, reveal summaries, and exit state.

## Manual Smoke Required

Automated checks cannot replace the real two-client pass:

1. Both test users grant location.
2. Both start with `25 km`.
3. Start one user first, wait 10-30 seconds, then start the second user.
4. Repeat with `5`, `100`, `250`, and no-limit.
5. Inspect Admin Queue before match.
6. Inspect Admin Sessions after match, exit, freeze, or abandon.
7. Confirm peer avatar/photos render or emit safe media diagnostics.
8. Confirm no exact coordinates appear in mobile UI, Admin Web, client errors, DM, history, or public profile.
9. Confirm Client Errors include enough app/build/release metadata to identify the running build.
10. In draw, smoke brush, eraser, zoom in/out/reset, Move pan mode, fullscreen on/off, finish, and history/detail replay.

## Build Verification

- Clear Metro cache before smoke: `npx expo start -c`.
- Set `EXPO_PUBLIC_RELEASE_VERSION` for the smoke build when an exact Git SHA is not injected automatically.
- Native `app.json` changes, including Android `usesCleartextTraffic`, require a rebuilt/reinstalled dev/native build, not only JS reload.

## Future Age Filter

Together age filter is planned after Together start reliability is stable. `FlirtSettingsScreen` is not the Together age filter. Future block: `TOGETHER-AGE-FILTER-01`.

## Public Beta Blockers

- Complete real phone/emulator Together smoke against the release backend.
- Verify Admin Web role access in browser for owner, ops, moderator, and support.
- Connect a real media moderation provider or staff manual moderation before public beta.
- Add a real non-mutating object storage health check; current status must remain honest if not checked.
