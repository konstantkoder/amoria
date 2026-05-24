# Admin Queue UI 01

Updated: 2026-05-24 for required Together location matching.

`GET /admin/together/queue` remains owner/ops-only and writes `admin.togetherQueue.read`.

Admin Web now has a Together Queue page that displays:

- created/expires timestamps;
- userId;
- activity;
- status;
- radiusKm;
- hasCoordinates;
- geoMode;
- matchedSessionId.

The response and UI intentionally omit latitude, longitude, exact location, tokens, and secrets.

Helper text now states the release rule directly:

> New Together requests must have coordinates. Exact coordinates are not shown. No limit means no distance cap, not no geolocation.

The page filters by status, activity, radius, `geoMode`, and `hasCoordinates`, and has Load/Refresh actions. `matchedSessionId` links to the Together Sessions page filtered to that session.

`geoMode` values:

- `finite_with_location`
- `no_limit_with_location`
- `missing_location_invalid_old_entry`

The invalid old-row label is `Старая запись без геолокации`. Waiting old rows can be cancelled with the existing audited cancel action.

## Together Sessions Page

`GET /admin/together/sessions` is owner/ops-only and writes `admin.togetherSessions.read`.

Admin Web now has a read-only `Сессии Together` / `Together Sessions` page that displays:

- session id;
- activity;
- status;
- created/deadline/end timestamps;
- ended reason;
- participant user ids and count;
- participant heartbeat/left timestamps;
- top-level latest `lastHeartbeatAt` / `leftAt`;
- event count;
- stroke event count;
- story choice count;
- reveal decision summary;
- source session id for Story Sparks continuation;
- stale heartbeat indicator.

The page filters by status, activity, and session id, and has a Refresh action.

The response and UI intentionally omit latitude, longitude, private chat messages, locked gallery data, raw event payloads, tokens, and secrets.

## Stale Waiting Action

Owner/ops can cancel a stale `waiting` row from the table.

The UI requires:

- `status = waiting`;
- confirmation;
- a non-empty reason.

The backend action is:

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

This is not a hard delete. It sets the queue row to `cancelled`, reloads the table, and writes audit action `admin.togetherQueue.cancel` with safe metadata only. Latitude and longitude are not exposed.

The helper text calls out common reasons two clients do not match: activity mismatch, old missing-location rows, finite radius too small, expired/cancelled rows, or different active activities.
