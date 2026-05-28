# Gallery / Peer Media Smoke Pass

Updated: 2026-05-28 for `MEDIA CROP FLOW FINAL 01`

## Peer Profile Media

Use a real account with an avatar and at least one public profile photo.

1. Open the peer profile from Together/DM context.
2. Confirm `avatarUrl` points to `/media/public/:mediaId` in backend response.
3. Confirm public photos use `/media/public/:mediaId`.
4. Confirm Android renders avatar and public photos.
5. If loading fails, inspect Client Errors for:
   - `screen=UserProfileScreen`
   - `action=loadPeerMedia`
   - `step=avatarLoadFailed` or `publicPhotoLoadFailed`
   - safe `mediaId`
   - safe `urlKind`
   - safe `httpStatus`
   - safe `contentType`
6. Confirm no full raw URL, signed URL, token, local file path, or locked-gallery media is exposed.
7. Confirm an avatar uploaded through `/media/avatar` remains visible after app restart and renders for a peer account.

## Admin Media Moderation

1. Open Admin Media Moderation.
2. Confirm avatar/public thumbnails render.
3. Click `Открыть фото` and confirm an actual image opens.
4. Click `Проверить URL` and confirm HTTP 200 with an image content type.
5. If a thumbnail fails, confirm the row shows media id, moderation status, MIME, HTTP status, content type, and backend error code such as `object_not_found`.
6. Confirm locked gallery media has no public thumbnail or public URL.
7. Confirm pending-review avatar/public media remains visible under closed-test policy.

## Owner Gallery Delete

1. Owner gallery photos must resolve `/media/public/:mediaId` against the current backend API origin.
2. Loading/error states must be visible; no silent black placeholders count as pass.
3. Delete a public profile photo and confirm the backend refresh removes it from owner gallery and peer public profile.
4. Delete a `pending_review` profile photo and confirm moderation status does not block owner cleanup.
5. If an image object is missing, owner delete must still remove the owned media row/gallery item without manual DB cleanup.
6. Delete can reduce public visible count below 3; the locked-folder minimum applies to hide/move/password flows, not actual owner delete.
7. Delete failure copy must not say `Нельзя скрыть фото`; use the delete-specific failure message and safe Client Error metadata.

## Avatar Upload

1. Choose avatar in mobile Profile.
2. Confirm the in-app crop UI opens with a visible square frame.
3. Move/zoom inside the square and tap `Готово`.
4. Confirm preview is marked `Предпросмотр — ещё не сохранено`.
5. Tap explicit Upload.
6. Confirm backend save succeeds and profile refreshes from backend.
7. Restart the app and confirm the avatar persists.
8. Open the profile from a peer account and confirm the peer sees the avatar.
9. Confirm relative `/media/public/:mediaId` and absolute current-origin URL for the same media id are treated as the same avatar.
10. Confirm failed upload leaves retry/cancel preview state and does not show saved-looking local success.

## Profile Photo Upload Crop

1. Choose a public profile photo in Photo Manager.
2. Confirm the in-app crop UI opens with a visible square frame.
3. Move/zoom inside the square and tap `Готово`.
4. Confirm preview appears and no upload has happened yet.
5. Tap `Загрузить`.
6. Confirm backend save succeeds, owner gallery refreshes from backend, and the cropped photo appears.
7. Restart the app and confirm the gallery still shows the backend-cropped photo.
8. Open the profile from a peer account and confirm the peer sees the public photo.
9. Cancel crop and confirm no upload happens.
10. Use `Выбрать другое` and confirm only the replacement image can be uploaded.
11. Submit an invalid crop in a controlled test and confirm the backend rejects it clearly.

## Policy

Closed-test pending-review avatar/public profile media may be visible so the release team can test real upload, profile, and moderation flows without fake approval.

Locked gallery media must not be returned by public profile or `/media/public/:mediaId` unless the user unlocks the locked gallery through the password flow.

Missing public media objects should not be returned from public profile as loadable avatar/photos. The public route must answer honestly with `object_not_found` instead of fake success.
