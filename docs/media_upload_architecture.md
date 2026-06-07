# Media Upload Architecture

Updated: 2026-06-07 after `PROFILE-MEDIA-STABILITY-01`

## Release Rule

Mobile-visible media URLs must not depend on stale local, tunnel, or internal object-storage addresses. No mobile response should expose `file://`, `localhost`, `127.0.0.1`, `minio:9000`, or dead tunnel URLs as a profile media URL.

## Root Cause Fixed

Avatar and profile photo uploads wrote absolute URLs into `media_files.url` and `users.avatarUrl`. Those URLs were derived from `S3_PUBLIC_BASE_URL`. When a tunnel changed, peer public profile responses could still return the old absolute URL and another device could not load the avatar/photo.

## Current Decision

- Object bytes remain in S3/MinIO-compatible storage.
- The canonical object key is `media_files.path`.
- The mobile-visible URL is generated from the media id at response time:
  - `/media/public/:mediaId`
- The backend route `GET /media/public/:mediaId` loads the object by `media_files.path` and streams the bytes with the stored MIME type.
- `GET /media/public/:mediaId` streams only public-safe media. Locked gallery profile photos are blocked even if someone guesses a `mediaId`.
- Avatar upload is backend-mediated through `POST /media/avatar`.
- Profile photo upload is backend-mediated through `POST /media/profile-photo`.
- `media_files.url` is legacy/debug metadata only and may contain an old tunnel/local/object-storage address.
- Public profile, admin list/detail, and mobile-facing responses re-materialize avatar and public photo URLs from media IDs, so stale absolute DB URLs are not trusted as the public contract.
- Mobile and Admin Web resolve relative `/media/public/:mediaId` paths against the current API origin.
- Mobile image rendering keeps stable loading/fallback states for avatar, public profile photos, owner gallery thumbnails, and Nearby card media.
- Mobile image rendering keeps safe diagnostics with `screen` set to the current surface and `action` set to `loadAvatar`, `loadPublicPhoto`, or `loadOwnerPhoto`. Metadata is limited to safe fields such as `mediaId`, `urlKind`, `httpStatus`, `contentType`, `hasAvatarUrl`, `photoCount`, and safe `visibility`. Full raw URLs are not sent to Client Errors.

## Locked Gallery Guest Rendering

After a successful guest unlock, locked photos render only from the unlock response and only through:

```text
GET /media/locked/:mediaId
Authorization: Bearer <viewer access token>
x-amoria-locked-gallery-token: <unlock token>
```

Mobile keeps the unlock token and viewer access token in memory only. Locked media is never rewritten to `/media/public/:mediaId`, never added to Nearby cards, and never stored as a public URL.

The peer profile screen shows a per-photo loading state. If React Native `Image` cannot render the authenticated locked URL, mobile performs an authenticated file-system download with the same two headers, verifies a 2xx status and `image/*` content type, writes the bytes to the app cache for the short session, and renders that local cache URI. The cache directory is cleared when the profile/user changes, the unlock token expires, logout/session invalidation occurs, or the screen unmounts.

If the backend returns zero photos after unlock while the public locked-gallery summary reported photos, mobile shows an explicit inconsistency message and reports a safe Client Error with `screen=UserProfileScreen`, `action=loadLockedGalleryMedia`, and `step=unlockResponseEmpty`. Locked media failures use `lockedPhotoLoadFailed`, `lockedPhotoFetchFailed`, or `lockedPhotoInvalidUrl` with only safe metadata such as `targetUserId`, `mediaId`, counts, HTTP status, content type, probe error code, and `tokenExpiresSoon`.

## Backend-Mediated Profile Photo Upload

Mobile profile photos no longer depend on `prepareUpload -> direct PUT -> completeUpload`.

Current profile photo path:

```text
mobile multipart file -> POST /media/profile-photo -> backend validation/process -> object storage write -> media_files row -> public profile gallery item -> /media/public/:mediaId
```

Backend responsibilities:

- accept authenticated multipart upload only;
- support JPEG, PNG, and WebP;
- reject HEIC/HEIF, unsupported media, corrupt images, oversized files, and invalid dimensions;
- decode and validate the image server-side;
- re-encode to WebP and strip metadata;
- write the object from backend to object storage;
- create a `profile_photo` media row;
- add the completed public profile photo to the profile gallery while enforcing existing gallery limits;
- return only:
  - `media.id`
  - `media.url`
  - `media.mimeType`
  - `media.sizeBytes`
  - `media.purpose`

The response must not include object keys, storage paths, signed upload URLs, tokens, `minio`, `localhost`, or `127.0.0.1`.

## Moderation Status

Every new avatar/profile photo upload creates an initial media moderation review. In this release the automated provider is `NOT_CONFIGURED`, so the row is marked for manual review instead of being fake-approved.

The moderation metadata records:

- `automatedStatus`;
- `automatedProvider`;
- `automatedCheckedAt`;
- labels/signals when a real provider exists;
- `needsHumanReview`.

No automated success is claimed until a real provider is configured and tested.

## Admin Preview

Admin Web media moderation uses:

- safe public preview URLs for avatar/public profile media;
- authenticated Admin/Ops content fetch for locked media review;
- owner/moderator role plus reason and audit for locked media detail/content access.

Locked gallery contents are not made public for moderation convenience.

## Mobile Crop / Preview / Confirm

Mobile crop is a UX step, not a security boundary:

- Avatar uses the native image editor with `allowsEditing=true` and `aspect=[1,1]`.
- Profile gallery photos also use `aspect=[1,1]` for this release because the current gallery/profile UI renders fixed square tiles.
- The selected crop is shown locally before upload with explicit actions:
  - `Загрузить фото` / `Upload photo`
  - `Выбрать другое` / `Choose another`
  - `Отмена` / `Cancel`
- Upload starts only after confirm.
- Cancel clears the preview and does not upload.
- Backend upload failure does not show local-only success; the preview stays retryable or can be replaced/cancelled.

The backend still decodes, validates, re-encodes to WebP, strips metadata, and enforces media/gallery limits. The client crop must not be treated as trusted sanitization.

## Public Profile Rules

- `GET /users/:id/public` returns:
  - `avatarUrl` only when the stored avatar points to an owned avatar media row.
  - public profile photos with current `/media/public/:mediaId` URLs.
  - locked gallery summary/count only.
- Locked gallery photos are not included in public profile photos before unlock.
- Stale avatar URLs without a matching media row are hidden instead of being returned to mobile.
- If an old absolute `/media/public/:mediaId` URL reaches mobile, the client rewrites that path to the current API origin instead of loading a stale tunnel/localhost/object-storage host.
- If a peer avatar/photo still fails to load, Client Errors should show whether the URL was `relative`, `currentOrigin`, `rewritten`, `external`, `devExternal`, or `invalid` through the safe media-load actions. Raw URLs, object keys, signed URLs, exact birth dates, coordinates, and locked-gallery tokens must not be reported.

## Moderation Visibility Policy

Closed-test policy: pending review avatar/public profile media can remain visible so the team can verify upload, peer profile, and moderation workflows without fake approval.

Public beta policy: switch peer-visible public media to approved-only once a real automated provider or staffed manual moderation process is active.

Locked gallery media remains hidden from public profile responses regardless of moderation status.

## Environment Rules

- `PUBLIC_API_URL` should point to the reachable backend API origin.
- Public profile/mobile/admin media responses should be relative `/media/public/:mediaId` paths or current-origin equivalents.
- `PUBLIC_MEDIA_URL` is not the durable mobile-visible media contract.
- `S3_ENDPOINT` may remain an internal object-storage endpoint.
- `S3_PUBLIC_BASE_URL` must not be used as the mobile-visible profile media contract.
- Production public URL validation still rejects localhost/private/minio-style public URLs.
- Android/BlueStacks local-dev builds may need cleartext traffic for HTTP backend origins. This is a transport setting only; it must not be used to justify stale media hosts or fake media success.

## Prepared Upload Boundary

Prepared direct upload endpoints still exist for future direct-to-object-storage production mode, but mobile profile photo upload does not depend on internal MinIO/S3 upload URLs. Admin Client Errors should no longer show `PhotoManagerScreen`, `uploadProfilePhoto`, `putUpload`, `uploadUrlHost=minio:9000` for normal profile photo uploads.
