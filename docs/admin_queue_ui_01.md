# Admin Queue UI 01

Updated: 2026-05-23 after `ADMIN-OPS-05`

## Together Queue Page

Admin Web now has a read-only `Очередь Together` / `Together Queue` page for owner and ops roles.

The page reads the real backend endpoint:

```text
GET /admin/together/queue
```

It shows:

- `createdAt`
- `expiresAt`
- `userId`
- `activity`
- `status`
- `radiusKm`
- `hasCoordinates`
- `matchedSessionId`

It does not show latitude, longitude, exact user location, tokens, secrets, or credentials.

## Filters

The page filters the loaded queue rows by:

- status
- activity
- radius
- whether coordinates are present

Refresh re-reads the backend endpoint. There is no destructive cancel action in this release block.

## Smoke Use

During a Together smoke pass, use this page to confirm whether a test account is waiting, matched, expired, or cancelled, and whether a finite-radius request actually has coordinates. For a no-limit attempt, `radiusKm` should be empty/no-limit and `hasCoordinates` can be false.

