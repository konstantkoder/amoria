# Admin Queue UI 01

Updated: 2026-05-29 for Together cancel and age diagnostics.

`GET /admin/together/queue` remains owner/ops-only and writes `admin.togetherQueue.read`.

Admin Web now has a Together Queue page that displays:

- created/expires timestamps;
- safe user identity: userId, Amoria ID, display name;
- waiting age;
- activity;
- status;
- radiusKm;
- hasCoordinates;
- geoMode;
- userAgeGroup;
- preferredAgeRange;
- waitingReason;
- cancelSource;
- cancelReason;
- cancelledAt;
- lastAction;
- lastClientPollAt;
- matchedSessionId.

The response and UI intentionally omit latitude, longitude, exact location, exact birth date, tokens, and secrets.

Helper text now states the release and diagnostic rule directly:

> New Together requests must have coordinates. Exact coordinates are not shown. No limit means no distance cap, not no geolocation.

> Причина ожидания показывает, почему не найден кандидат. Источник отмены показывает, кто остановил запись очереди.

> Возрастная группа используется только для подбора. Точная дата рождения не показывается.

The page filters by status, activity, radius, `geoMode`, `hasCoordinates`, `ageGroup`, and `waitingReason`, and has Load/Refresh actions. `matchedSessionId` links to the Together Sessions page filtered to that session. If the session endpoint does not return that id, Admin Web shows a clear diagnostic error instead of a silent empty page.

`geoMode` values:

- `finite_with_location`
- `no_limit_with_location`
- `missing_location_invalid_old_entry`

The invalid old-row label is `Старая запись без геолокации`. Waiting old rows can be cancelled with the existing audited cancel action.

`waitingReason` is not the true cancellation source. It remains a matching diagnostic such as `candidate_cancelled`. The cancellation lifecycle is read from `cancelSource`, `cancelReason`, and `cancelledAt`.

Suspicious cancel sources are highlighted:

- `screen_cleanup`
- `navigation_blur`
- `unknown`

Expected explicit sources include `user_stop`, `user_back`, `retry_restart`, `radius_expansion`, and `admin_cancel`.

`waitingReason` values are safe derived diagnostics:

- `no_candidate`
- `activity_mismatch`
- `radius_distance_too_far`
- `missing_coordinates_old_entry`
- `same_user_excluded`
- `candidate_expired`
- `candidate_cancelled`
- `location_required`
- `age_mismatch`
- `missing_user_age`
- `missing_age_preference`
- `unknown`

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

This is not a hard delete. It sets the queue row to `cancelled`, sets `cancelSource=admin_cancel`, stores the required reason, reloads the table, and writes audit action `admin.togetherQueue.cancel` with safe metadata only. Latitude and longitude are not exposed.

The helper text calls out common reasons two clients do not match: activity mismatch, old missing-location rows, finite radius too small, expired/cancelled rows, or different active activities.
