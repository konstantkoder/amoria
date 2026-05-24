# Bugfix: Together Start Reliability and Peer Media Diagnostics

Updated: 2026-05-24

## Together Waiting UX

- Search no longer falls to no-match/retry after 2-3 seconds.
- Mobile waits about 90 seconds before delayed guidance appears.
- Polling continues while backend returns `waiting`.
- Temporary poll failures show a connection retrying message and do not cancel the queue row.
- Destructive restart is labeled `Остановить и начать заново`.
- Active waiting primary action is stop search, not blind retry.

The first user can start and wait. The second user can join 10-30 seconds later and still match when activity and geo are compatible.

## Location Failure UX

If permission is granted but the device/emulator does not return coordinates, the app blocks queue join and says:

`Устройство не отдаёт координаты. Проверьте GPS/геолокацию. В эмуляторе BlueStacks установите местоположение и откройте Google Maps для проверки.`

Client Error metadata stays safe: radius, permission status, `hasCoordinates=false`, platform/device model, no exact coordinates.

## Peer Media Diagnostics

Peer avatar/public photo failures now include safe diagnostics:

- media id when it can be derived from `/media/public/:mediaId`;
- `urlKind`: `relative`, `currentOrigin`, `rewritten`, `external`, `devExternal`, or `invalid`;
- `hasAvatarUrl`;
- `photoCount`.

The report does not include full raw URLs, signed URLs, tokens, local paths, or locked-gallery media.
