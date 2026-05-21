# Media Upload Architecture

Updated: 2026-05-21 after `MEDIA-01`

## Release Rule

Mobile-visible media URLs must not depend on stale local, tunnel, or internal object-storage addresses. No mobile response should expose `file://`, `localhost`, `127.0.0.1`, `minio:9000`, or dead tunnel URLs as a profile media URL.

## Root Cause Fixed

Avatar and profile photo uploads wrote absolute URLs into `media_files.url` and `users.avatarUrl`. Those URLs were derived from `S3_PUBLIC_BASE_URL`. When a tunnel changed, peer public profile responses could still return the old absolute URL and another device could not load the avatar/photo.

## Current Decision

- Object bytes remain in S3/MinIO-compatible storage.
- The canonical object key is `media_files.path`.
- The mobile-visible URL is generated from the current backend media base:
  - `PUBLIC_MEDIA_URL/public/:mediaId`
- The backend route `GET /media/public/:mediaId` loads the object by `media_files.path` and streams the bytes with the stored MIME type.
- Avatar upload is backend-mediated through `POST /media/avatar`.
- Profile photo upload is backend-mediated through `POST /media/profile-photo`.
- Avatar upload and completed profile photo upload store the current public media route in `media_files.url`.
- Public profile responses re-materialize avatar and public photo URLs from media IDs, so stale absolute DB URLs are not trusted as the public contract.

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

## Public Profile Rules

- `GET /users/:id/public` returns:
  - `avatarUrl` only when the stored avatar points to an owned avatar media row.
  - public profile photos with current `PUBLIC_MEDIA_URL/public/:mediaId` URLs.
  - locked gallery summary/count only.
- Locked gallery photos are not included in public profile photos before unlock.
- Stale avatar URLs without a matching media row are hidden instead of being returned to mobile.

## Environment Rules

- `PUBLIC_API_URL` should point to the reachable backend API origin.
- `PUBLIC_MEDIA_URL` should point to the reachable public media origin. In the current backend route setup this is normally `${PUBLIC_API_URL}/media`.
- `S3_ENDPOINT` may remain an internal object-storage endpoint.
- `S3_PUBLIC_BASE_URL` must not be used as the mobile-visible profile media contract.
- Production public URL validation still rejects localhost/private/minio-style public URLs.

## Prepared Upload Boundary

Prepared direct upload endpoints still exist for future direct-to-object-storage production mode, but mobile profile photo upload does not depend on internal MinIO/S3 upload URLs. Admin Client Errors should no longer show `PhotoManagerScreen`, `uploadProfilePhoto`, `putUpload`, `uploadUrlHost=minio:9000` for normal profile photo uploads.
