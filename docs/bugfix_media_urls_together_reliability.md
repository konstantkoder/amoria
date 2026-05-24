# Bugfix: Media URLs and Together Reliability

Updated: 2026-05-23 for `RELEASE-SMOKE-BLOCKERS-03`

## Scope

This block closes smoke blockers found after profile media upload, Media Moderation, and Together no-limit matching tests.

Release constraints remain unchanged:

- no mock/stub/fake data;
- no Firebase fallback;
- no local-only success;
- no hardcoded tunnel URL;
- no stored tunnel URL trusted as a mobile/admin media contract;
- no exact peer coordinates in mobile or admin diagnostics;
- locked gallery media remains hidden from public profile and public media routes.

## Canonical Media URL Policy

The canonical public media route is:

```text
GET /media/public/:mediaId
```

Mobile-visible and admin-visible responses should prefer:

```text
publicPath: /media/public/:mediaId
```

If a legacy response shape still contains `url`, `publicUrl`, or `previewUrl`, that value must be derived from the current request/API origin and the media id. Stored absolute `media_files.url` values are legacy/debug metadata only. They must not be trusted for peer profile media, Admin Media thumbnails, or mobile image rendering.

Rows that still contain old tunnel, localhost, MinIO, or stale S3 public URLs do not require a DB migration for this release. The backend re-materializes the response URL from `mediaId`; mobile and Admin Web resolve relative `/media/public/:mediaId` paths against the current API base.

## Peer Media Visibility

Peer public profile media is expected to work when:

- the avatar media row is owned by the profile user and has purpose `avatar`;
- public gallery photos are owned by the profile user and remain in the public gallery;
- the backend returns `/media/public/:mediaId` rather than an old absolute URL;
- mobile resolves that path against the active backend URL.

If peer media is missing, check:

- the public profile response for `avatarUrl` and `photos[].url`;
- whether those values are relative `/media/public/:mediaId` paths or current-origin URLs;
- whether the media row exists and is owned by the profile user;
- whether a photo was moved to locked gallery, deleted, or blocked by `/media/public/:mediaId`.

Do not fix missing media by exposing locked gallery photos or by storing a new tunnel URL in the database.

## Together Queue Retry UX

No-limit matching should keep waiting until the queue entry expires or a match is found. While a no-limit queue row is still active, the mobile UI should show:

- `Ищем человека` / localized equivalent;
- selected radius;
- a real countdown or active-until time from `expiresAt`;
- no premature "no people nearby" message.

Retry is not the normal no-limit waiting path. Destructive restart/cancel actions are explicit and reported only when repeated or failing.

After this pass, delayed search offers radius expansion. Expanding to no-limit cancels the current queue row and creates a new no-limit row with real coordinates and `radiusKm:null`.

## Admin Diagnostics

Owner/ops can use:

```text
GET /admin/together/queue
GET /admin/together/sessions
```

Use Together Queue before match to check waiting/matched/expired/cancelled rows, radius, coordinates presence, and `matchedSessionId`.

Use Together Sessions after match to check:

- session id, activity, status, created/deadline/end timestamps;
- participant user ids and count;
- participant heartbeat/left timestamps;
- event counts;
- stroke/story-choice counts where available;
- reveal decision summary;
- stale participant indicator.

The diagnostics are read-only. They do not expose exact coordinates, private chat messages, locked gallery data, or raw event payloads.

## What To Check If No Match

- Both clients are on the same activity (`draw` for the active release path).
- Both clients are genuinely waiting, not expired/cancelled.
- Every new queue row has coordinates, including no-limit.
- Finite-radius clients are inside the applicable mutual radius.
- For no-limit, `radiusKm` is empty/null and `hasCoordinates=true`.
- The queue row is not being cancelled by repeated retry taps.
- After a match, inspect Together Sessions for stale heartbeat, no events, or one participant leaving.

## Canvas Observability

Draw/canvas failures are reported as safe Client Errors when the app can catch them:

- canvas WebView load failure;
- canvas WebView message parse failure;
- send stroke failure;
- finish session failure;
- heartbeat failure;
- peer event hydrate failure.

Reports include safe metadata such as session id, activity, event counts, and platform/device. They must not include drawing payloads, tokens, passwords, signed URLs, or private media data.
