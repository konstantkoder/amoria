# Admin Queue UI 01

Updated: 2026-05-23 after `RELEASE-SMOKE-BLOCKERS-02`

`GET /admin/together/queue` remains owner/ops-only and writes `admin.togetherQueue.read`.

Admin Web now has a Together Queue page that displays:

- created/expires timestamps;
- userId;
- activity;
- status;
- radiusKm;
- hasCoordinates;
- matchedSessionId.

The response and UI intentionally omit latitude, longitude, exact location, tokens, and secrets.

The page filters client-side by status, activity, radius, and `hasCoordinates`, and has a Refresh action.

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

The helper text calls out common reasons two clients do not match: activity mismatch, no-limit vs finite without coordinates, finite radius too small, expired/cancelled rows, or different active activities.
