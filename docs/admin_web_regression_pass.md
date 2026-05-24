# Admin Web Regression Pass

Updated: 2026-05-24

Canonical Admin Web code lives in the server repo under `admin-web/`; this mobile-side note tracks what mobile testers should verify from the app side during the same release pass.

## Pages To Use During Mobile Smoke

- Client Errors: confirm location-read-failed and canvas/session diagnostics are safe and useful.
- Together Queue: confirm every new queue row has `hasCoordinates=true`, the expected `radiusKm`, and a safe `geoMode`.
- Together Sessions: confirm created sessions appear even when the emulator freezes, one participant exits, or no canvas events arrive.
- Media Moderation: confirm uploaded profile media appears for real manual review.
- Reports and Audit: confirm real actions write real audit entries.
- Ops Health: confirm backend/database/counts are honest and object storage is not shown as fake OK.

## Privacy Rules

Admin Web must not show exact latitude/longitude, private chat, raw draw/story event payloads, locked media without audited review, passwords, tokens, signed URLs, or local file paths.

## Mobile Evidence Needed

- Real two-client Together match with granted location.
- No-limit match with coordinates and `radiusKm:null`.
- Permission-denied queue block.
- App exit from draw/story session marks backend leave state.
- If possible, freeze/kill one client and inspect stale heartbeat/session diagnostics.
