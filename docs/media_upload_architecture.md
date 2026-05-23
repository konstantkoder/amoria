# Media Upload Architecture

Updated: 2026-05-23 after `ADMIN-OPS-05`

## Public Media Route

The backend public media route is:

```text
GET /media/public/:mediaId
```

It streams objects by `media_files.path` and returns the stored MIME type. For `profile_photo`, the route now requires the media to be in a public gallery item. Locked-gallery media is not exposed even if a `mediaId` is known.

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

Admin Web uses safe public URLs for avatar/public media. Locked media preview uses authenticated Admin/Ops content access with owner/moderator role, reason capture, and audit logging.
