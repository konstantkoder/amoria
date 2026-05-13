# Gallery Release Audit

## Scope

- Server: avatar upload, prepared uploads, media delete, owner gallery, public profile, locked gallery.
- Mobile: `PhotoManagerScreen`, `ProfileScreen`, `EditProfileScreen`, `UserProfileScreen`, media URL handling.
- Date: 2026-05-13

## Endpoint Checklist

| Area | Endpoint | Result | Notes |
| --- | --- | --- | --- |
| Avatar upload | `POST /media/avatar` | PASS | Auth required; server decodes, resizes, re-encodes, stores object-backed public URL, and does not return object keys or local paths. |
| Prepared upload | `POST /media/uploads/prepare` | PASS | Auth required; purpose, MIME type, size, and optional checksum are validated before a presigned PUT is returned. |
| Complete upload | `POST /media/uploads/:id/complete` | PASS | Completion is owner-scoped; checksum is now required when declared during prepare; profile photos are decoded and re-encoded before media is stored. |
| Delete media | `DELETE /media/:id` | PASS | Delete is owner-scoped and runs profile gallery guards before removing profile photos. |
| Owner gallery | `GET /users/me/profile-gallery` | PASS | Returns public and locked owner photos with release limits, no password hash. |
| Owner gallery update | `PUT /users/me/profile-gallery` | PASS | Enforces public/locked ownership, max counts, locked password requirement, and minimum visible images. |
| Locked password set/reset | `POST /users/me/profile-gallery/locked-password`, `DELETE /users/me/profile-gallery/locked-password` | PASS | Requires current account password; stores hash only. |
| Locked unlock | `POST /users/:id/profile-gallery/unlock` | PASS | Requires folder password; wrong password denies without URLs; blocked viewer is denied. |
| Public profile | `GET /users/:id/public`, `GET /users/by-amoria-id/:amoriaId` | PASS | Public responses hide email/password hash and expose public photos only. |

## Mobile Checklist

| Screen / area | Result | Notes |
| --- | --- | --- |
| `PhotoManagerScreen` | PASS | Upload, delete, public/locked move, password set/reset all use backend APIs and refresh backend state after mutations. |
| `ProfileScreen` | PASS | Avatar upload uses backend avatar API and profile update; unsupported image formats are rejected without pretending success. |
| `EditProfileScreen` | PASS | Profile edits use backend profile APIs; no media-specific local-only state was found. |
| `UserProfileScreen` | PASS | Peer public profile shows public photos only; locked gallery unlock calls backend and wrong password does not reveal photos. |
| Media URL handling | PASS | Shared profile media URLs are normalized through backend/public media URL handling; production mode rejects local/private URLs. |
| Two-device manual pass | NOT TESTED | Needs signed-in device testing against the real backend before release sign-off. |

## Found Bugs

| Bug | Screen / endpoint | Expected | Actual before fix | Fixed |
| --- | --- | --- | --- | --- |
| Prepared upload checksum could be omitted during completion | `POST /media/uploads/:id/complete` | If prepare stored `checksumSha256`, complete must supply the same checksum. | Complete accepted missing checksum and proceeded. | Yes |
| Profile/gallery photo picker could start unsupported HEIC/HEIF shared-profile upload | `PhotoManagerScreen`, `ProfileScreen` | Unsupported shared-profile formats fail before upload with a clear error. | Client could call backend with unsupported MIME and only show a generic failure. | Yes |

## Tests Added / Updated

- `tests/media-profile-photo-upload.test.ts`
  - completing another user's prepared upload is denied
  - checksum is required when prepare included checksum
  - checksum mismatch is denied before storing media
- `tests/profile-locked-gallery.test.ts`
  - deleting another user's media is denied
  - owner can delete own profile photo and public read model syncs

## Remaining Gallery Blockers

- Run a real signed-in device pass for avatar upload, profile photo upload/delete/move, locked gallery password set/reset, peer unlock, wrong password denial, and blocked peer denial.
- Verify release backend object storage/CDN public URL behavior with the production-like environment.

## Final Status

Gallery/Profile Media is ready for the next release audit area after automated checks pass, but not ready for final release sign-off until the real device/backend pass is completed.
