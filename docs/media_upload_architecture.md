# Media Upload Architecture

Updated: 2026-05-23 after `RELEASE-SMOKE-BLOCKERS-03`

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

## Upload Hardening

Avatar and profile photo uploads remain backend-mediated:

- decode and validate input;
- reject unsupported/corrupt/oversized images;
- re-encode to WebP;
- strip metadata;
- store object bytes;
- create media row;
- return only safe media fields.

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
