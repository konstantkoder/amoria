# Media Render Delete Fix 03

Updated: 2026-05-26

## Mobile Contract

- Peer avatar and public profile photos use `/media/public/:mediaId` resolved against the current backend API origin.
- Owner gallery uses the same media URL resolver as peer profile.
- Owner gallery must show loading/error states instead of black silent placeholders.
- Delete remains backend-backed through `DELETE /media/:mediaId`; no local-only delete success is valid.
- Delete failure reports a safe Client Error: `screen=PhotoManagerScreen`, `action=deletePhoto`, `step=deleteFailed`, with `mediaId`, optional `galleryItemId`, `httpStatus`, `errorCode`, `visibility`, `moderationStatus`, and no raw URLs/tokens.

## Server Contract For Smoke

- Loadable closed-test `avatar` and public `profile_photo` media may render while `pending_review`.
- Locked gallery media must not render publicly.
- Missing objects must return `object_not_found`; public profile should not return broken avatar/photo URLs.
- Admin Media `Проверить URL` should show `HTTP 200` and `image/webp` for allowed loadable media.

## Manual Pass

1. Admin thumbnail renders.
2. `Открыть фото` opens the image.
3. `Проверить URL` returns `HTTP 200` plus image content type.
4. Owner gallery renders photos or shows a clear broken-photo state.
5. Owner delete removes own public and pending-review photos after backend refresh.
6. Broken/missing media can be removed by owner.
7. Peer profile renders avatar/public photos when returned by backend.
8. Locked gallery media stays protected.
