# Bugfix: Together Geo Required Matching

Updated: 2026-05-24

## Mobile Behavior

- Together starts only after foreground location permission is granted and a real location read succeeds.
- This applies to `5`, `25`, `100`, `250` km, and no-limit.
- Default radius is `25 km`.
- No-limit sends coordinates with `radiusKm:null`; it means no distance cap, not no geolocation.
- Permission denial blocks queue join and explains that exact position is not shown to other people.
- Location read failure blocks queue join and reports a safe Client Error with radius, permission status, and `hasCoordinates:false`.
- Client Errors never include exact latitude/longitude.

## User Guidance

- Radius copy tells users to search nearby first and expand if nobody is available.
- Privacy copy states that exact geolocation is not shown to other people.
- Delayed no-match state offers `Расширить радиус` and `Остановить поиск`, not repeated retry first.

## Smoke Test

1. Both users grant location.
2. Both use `25 km`.
3. Repeat with `5`, `100`, `250`, and no-limit.
4. Confirm no-limit sends coordinates with `radiusKm:null`.
5. Deny permission and confirm no queue join.
6. Confirm no exact coordinates in UI, logs, client errors, DM, history, or profile.
