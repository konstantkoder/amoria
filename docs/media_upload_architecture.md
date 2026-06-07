# Media Upload Architecture

Updated: 2026-06-07 after `LOCKED-GALLERY-GUEST-MEDIA-FIX-02`

## Public Media Route

The backend public media route is:

```text
GET /media/public/:mediaId
```

It streams objects by `media_files.path` and returns the stored MIME type. For `profile_photo`, the route now requires the media to be in a public gallery item. Locked-gallery media is not exposed even if a `mediaId` is known.

Mobile/admin-visible URLs are derived from the media id at response time. Prefer returning the relative path:

```text
/media/public/:mediaId
```

Stored absolute `media_files.url` values are legacy/debug metadata only. They may contain an old tunnel, localhost, MinIO, or stale public-base URL and must not be trusted by public profile, mobile, or Admin Web responses.

Mobile resolves `/media/public/:mediaId` against the current API origin. If an old absolute URL still points at `/media/public/:mediaId`, mobile rewrites it to the current API origin and records only safe diagnostics (`urlKind`, media id) if Android image loading fails.

## Locked Gallery Guest Access

Public profile reads may expose only a locked gallery summary: whether the locked gallery exists and the safe locked-photo count. They must not expose locked media URLs, object keys, storage paths, signed URLs, password hashes, exact coordinates, or exact birth dates.

Guest access uses `POST /users/:id/locked-gallery/unlock` with an authenticated viewer. A correct password returns `/media/locked/:mediaId` paths plus a short-lived viewer-specific and target-specific unlock token. Locked media is then streamed from `GET /media/locked/:mediaId` only when both the viewer access token and `x-amoria-locked-gallery-token` are valid. Responses are private and no-store.

Wrong attempts are rate-limited per viewer plus target user. Unlock success/failure is audited with safe metadata and never includes the password, password hash, raw storage URL, object key, or signed URL.

Mobile renders guest-unlocked locked media with per-photo loading and failure states. If React Native `Image` cannot render the authenticated URL, mobile downloads the same `/media/locked/:mediaId` route with the viewer access token and unlock token, verifies 2xx plus `image/*`, writes a temporary cache file, and renders that local URI for the short session. Unlock tokens and locked cache files are cleared on profile/user change, token expiry, logout/session invalidation, and screen unmount.

Locked guest media Client Errors use `UserProfileScreen/loadLockedGalleryMedia` with steps `unlockResponseEmpty`, `lockedPhotoLoadFailed`, `lockedPhotoFetchFailed`, or `lockedPhotoInvalidUrl`. Diagnostics may include only target/media IDs, safe counts, HTTP status, content type, probe error code, and `tokenExpiresSoon`; raw URLs, passwords, tokens, object keys, signed URLs, exact DOB, and coordinates remain forbidden.

## Upload Hardening

Avatar and profile photo uploads remain backend-mediated:

- decode and validate input;
- reject unsupported/corrupt/oversized images;
- re-encode to WebP;
- strip metadata;
- store object bytes;
- create media row;
- return only safe media fields.

## Object Storage Health

Admin/Ops Health checks object storage with a non-mutating bucket metadata check. This health check does not upload, delete, or create test objects, and it does not change media upload behavior.

The health response uses these statuses:

- `ok`: object storage is configured and reachable.
- `not_configured`: required object storage config is missing.
- `error`: config exists, but the safe read-only check failed with a sanitized error code.
- `not_checked`: the SDK/provider cannot perform the safe check.

The response must not expose bucket names, object keys, endpoints, internal MinIO paths, access keys, secrets, tokens, or signed URLs.

## Moderation Foundation

After a new avatar or profile photo media row is created, the backend creates an initial `media_moderation_reviews` row.

The automated moderation provider is currently `NOT_CONFIGURED`. That is not a successful scan and not an approval. The media remains under manual review with metadata that records:

- `automatedStatus`;
- `automatedProvider`;
- `automatedCheckedAt`;
- automated labels/signals when a real provider exists;
- `needsHumanReview`.

Closed-test policy: pending review avatar/public profile media can remain visible so the team can verify upload, peer profile, and moderation workflows without fake approval. Public beta should move peer-visible public media to approved-only once a real provider or staffed manual review process is active.

## Admin Preview

Admin Web uses current derived public URLs for avatar/public media. Locked media preview uses authenticated Admin/Ops content access with owner/moderator role, reason capture, and audit logging.
