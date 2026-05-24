# BUGFIX-GEO-KEYBOARD-CROP-CLEANUP-01 Server Notes

Updated: 2026-05-24

## Together Queue

- `POST /together/queue` now cancels any existing `waiting` row for the same user before inserting a new attempt.
- Expired waiting rows are still expired before matching.
- The partial unique waiting constraint can no longer trap a retry behind an invisible old row.
- No-limit mode is represented by coordinates plus `radiusKm: null`; omitting `location` is no longer valid for Together queue.

## Geo Rule

- no-limit + no-limit can match only when both rows have coordinates.
- finite + finite must be within both users' radiuses.
- no-limit with coordinates + finite respects the finite user's radius.
- old no-limit rows without coordinates are invalid for release matching and should expire/cancel without exposing coordinates.

## Observability

`GET /admin/together/queue` is available to `owner` and `ops` admins. It writes `admin.togetherQueue.read` to the admin audit log and returns only:

```text
entryId, userId, activity, status, radiusKm, hasCoordinates, createdAt, expiresAt, matchedSessionId
```

Exact latitude/longitude are not returned.

`ADMIN-OPS-05` exposes this endpoint in Admin Web as a read-only Together Queue page with filters for status, activity, radius, and `hasCoordinates`.

## Media Moderation Follow-up

`ADMIN-OPS-05` adds the release moderation foundation:

- new avatar/profile photo uploads create an initial manual-review moderation record;
- `NOT_CONFIGURED` automated moderation never fake-approves media;
- Admin Web media moderation shows image preview for safe public media and authenticated audited preview for locked media;
- locked gallery media is not exposed through `/media/public/:mediaId`.
