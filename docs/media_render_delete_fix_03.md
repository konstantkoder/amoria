# Media Render Delete Fix 03

Updated: 2026-05-26

## Root Cause

Live local trace for `48c9dd0b-d5a2-4cf7-b180-c01510d4ddac`:

- media row exists.
- owner: `AM-7CKKG`.
- type: `avatar`.
- moderation status: `pending_review`.
- stored URL: stale absolute tunnel path under `/media/users/.../avatar.webp`.
- storage path: `users/0cd7a723-bfb2-4b1c-9c5f-741ac906d45c/avatar.webp`.
- object storage head: `404 NotFound`.

The public profile could rematerialize the stale avatar reference as `/media/public/:mediaId`, but the route then tried to read a missing storage object and returned JSON 404. That created the bad state: `hasAvatarUrl=true`, but `/media/public/:mediaId` did not return `image/webp`.

## Fixed Behavior

- `/media/public/:mediaId` returns `200` with `image/webp` for loadable `avatar` media, including `pending_review` closed-test media.
- `/media/public/:mediaId` returns `200` with `image/webp` for loadable public `profile_photo` media, including `pending_review` closed-test media.
- Locked gallery media remains blocked on `/media/public/:mediaId`.
- Missing storage objects now return `404` with `error.code=object_not_found`.
- Public profiles only return avatar/public photo URLs when the corresponding object is expected to load.
- Old absolute stored URLs are ignored; responses materialize current `/media/public/:mediaId` paths.

## Admin Media

- Admin list/detail exposes safe current public paths for avatar/public media.
- Admin Web resolves thumbnails against the backend API origin.
- Failed thumbnails auto-probe the URL and show HTTP status, content type, backend error code, media id, moderation status, and MIME type.
- `Открыть фото` opens the actual public image when the media is loadable.
- `Проверить URL` confirms `HTTP 200` plus image content type for allowed public media.

## Owner Delete

- Owner delete remains backend-backed through `DELETE /media/:mediaId`.
- Missing storage objects no longer block owner cleanup of owned media rows.
- Deleting profile media removes the media row, cascades gallery items, and refreshes the public photo read model.
- Pending review status does not block owner delete.
- Another user's media still returns `404`.

## Locked Gallery Guard

Locked profile photos are never exposed through `/media/public/:mediaId`. Admin locked review remains available only through the audited admin content route with proper permissions and reason.

## Checks

- `node --test --import tsx tests/media-public-route.test.ts tests/profile-locked-gallery.test.ts tests/users-public-profile-access.test.ts`: PASS.
- `npm run typecheck`: PASS.
- `npm run admin:web:build`: PASS.
