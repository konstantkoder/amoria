# Admin Queue UI 01

Updated: 2026-05-24 after `BUGFIX-TOGETHER-GEO-REQUIRED-01`

## Together Queue Page

Admin Web now has an `Очередь Together` / `Together Queue` page for owner and ops roles.

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
- `geoMode`
- `matchedSessionId`

It does not show latitude, longitude, exact user location, tokens, secrets, or credentials.

## Filters

The page filters the loaded queue rows by:

- status
- activity
- radius
- geo mode
- whether coordinates are present

Refresh re-reads the backend endpoint.

`matchedSessionId` opens the Together Sessions page filtered to that session when the session id is present.

## Together Sessions Page

Admin Web now has a read-only `Сессии Together` / `Together Sessions` page for owner and ops roles.

The page reads the real backend endpoint:

```text
GET /admin/together/sessions
```

It shows:

- `sessionId`
- `activity`
- `status`
- `createdAt`
- `deadlineAt`
- `endedAt`
- `endedReason`
- `participantUserIds`
- `participantCount`
- participant `lastHeartbeatAt` / `leftAt`
- `eventCount`
- `strokeEventCount`
- `storyChoiceCount`
- reveal decision summary
- `sourceSessionId`
- stale heartbeat warning

It does not show latitude, longitude, exact user location, private chat messages, locked gallery data, raw event payloads, tokens, secrets, or credentials.

## Session Filters

The sessions page filters loaded rows by:

- status
- activity
- session id

Refresh re-reads the backend endpoint.

## Stale Waiting Action

Owner/ops can cancel a stale `waiting` row from the table. The UI requires confirmation and a non-empty reason.

Backend action:

```text
POST /admin/together/queue/:entryId/actions
```

Body:

```json
{
  "action": "cancel",
  "reason": "stale smoke-test entry"
}
```

This is not a hard delete. It updates the row to `cancelled`, reloads the table, and writes `admin.togetherQueue.cancel` with safe metadata only: activity, radius, `hasCoordinates`, and reason. Latitude and longitude remain hidden.

## Smoke Use

During a Together smoke pass, use the queue page to confirm whether a test account is waiting, matched, expired, or cancelled, and whether every new request has coordinates. For a no-limit attempt, `radiusKm` should be empty/no-limit, `hasCoordinates` should be true, and `geoMode` should be `no_limit_with_location`.

Old waiting rows without coordinates are labeled as `missing_location_invalid_old_entry` / `Старая запись без геолокации`. They are invalid for the release geo contract and can be cancelled with the audited cancel action when still waiting.

After a match, use the sessions page to confirm whether both participants are still active, whether heartbeats/events are arriving, whether a peer left, and whether a stale active session explains a stuck client.

The helper text explains common non-match causes: activity mismatch, old missing-location rows, radius too small, expired/cancelled rows, and different activities. It also states that exact coordinates are not shown and that no-limit means no distance cap, not no geolocation.
