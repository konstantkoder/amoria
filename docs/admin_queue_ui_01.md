# Admin Queue UI 01

Updated: 2026-05-23 after `ADMIN-OPS-05`

`GET /admin/together/queue` remains owner/ops-only and writes `admin.togetherQueue.read`.

Admin Web now has a read-only Together Queue page that displays:

- created/expires timestamps;
- userId;
- activity;
- status;
- radiusKm;
- hasCoordinates;
- matchedSessionId.

The response and UI intentionally omit latitude, longitude, exact location, tokens, and secrets.

The page filters client-side by status, activity, radius, and `hasCoordinates`, and has a Refresh action. There is no queue cancel/destructive action in this release block.

