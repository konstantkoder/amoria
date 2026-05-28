# Gallery Smoke Pass

Updated: 2026-05-28 for `BUGFIX-DRAW-PHOTO-AVATAR-FINAL-06`.

## Run Metadata

| Field | Value |
| --- | --- |
| Test date/time | 2026-05-13 20:37:42 CEST |
| Backend URL | Tester must fill current reachable backend API URL before manual run |
| Media public URL/base | Public media should resolve from current backend origin plus `/media/public/:mediaId`; do not reuse old tunnel URLs |
| Mobile build/dev client | NOT TESTED |
| Device A | NOT TESTED |
| Device B | NOT TESTED |
| Account A identifier | NOT TESTED |
| Account B identifier | NOT TESTED |

## Scenario Checklist

| ID | Scenario | Result | Manual checks |
| --- | --- | --- | --- |
| A | Avatar upload | NOT TESTED | Login account A, open Profile, choose JPEG/PNG/WebP avatar, verify square center-crop preview appears with `Предпросмотр — ещё не сохранено` and visible Cancel / Choose another / Upload avatar actions, tap Upload avatar, verify new avatar appears from backend, restart app, verify avatar persists, open public profile from account B, verify peer sees avatar. |
| B | Profile photo upload | NOT TESTED | Open PhotoManager, choose JPEG/PNG/WebP profile photo, verify in-app preview appears with visible Cancel / Choose another / Upload photo actions, tap Upload photo, verify backend-mediated `POST /media/profile-photo` result appears in public gallery, restart app, verify it persists, login peer account, verify peer can see public photo, verify URL is relative `/media/public/:mediaId` or current backend origin plus that path. |
| B1 | Peer avatar/profile media | NOT TESTED | Account A uploads avatar and public profile photo; account B opens A from Together DM/profile context and sees current backend public media URLs derived from media ids or a clear moderation-waiting explanation if policy changes to approved-only. If an image fails, Admin Client Errors should show `screen=UserProfileScreen`, `action=loadPeerMedia`, safe `mediaId` when known, `urlKind`, `httpStatus`, `contentType`, `hasAvatarUrl`, and `photoCount`, never a raw URL. |
| B2 | Profile photo cancel/change | NOT TESTED | Select a photo, reach preview, tap Cancel and verify no upload/gallery change. Repeat and tap Choose another; verify only the confirmed photo uploads. |
| C | Unsupported format | NOT TESTED | Try HEIC/HEIF or unsupported image if device provides it, verify app rejects before upload, no backend media is created, clear error is shown. |
| D | Move public to locked | NOT TESTED | Account A has enough visible public images, set locked gallery password if needed, move one photo to locked, verify public profile no longer exposes that photo URL, owner sees it in locked section, peer sees only locked count/state. |
| E | Min visible rule | NOT TESTED | Try moving too many photos to locked, verify backend rejects minimum-visible violation, UI shows clear error, and no fake local move remains after failed mutation. |
| F | Locked unlock success | NOT TESTED | Account B opens account A public profile, sees locked gallery summary/count, enters correct folder password, backend unlock succeeds, locked photos display, refresh/reopen behavior is clear and safe. |
| G | Wrong password | NOT TESTED | Account B enters wrong locked gallery password, backend denies, no locked URLs display, no cached locked photos show, clear error is shown. |
| H | Password set/reset | NOT TESTED | Owner sets locked gallery password with current account password, wrong account password fails, reset requires current account password, old folder password no longer unlocks after reset. |
| I | Blocked peer | NOT TESTED | Account A blocks account B, account B tries public profile and locked unlock, backend denies according to product rule, UI does not show locked photos or broken state. |
| J | Delete photo | NOT TESTED | Owner deletes public photo even when public visible count would drop below 3, backend deletes/updates gallery, photo disappears after refresh/restart, peer no longer sees deleted photo, and delete failure never shows the hide-photo text `Нельзя скрыть фото`. |
| J1 | Broken photo cleanup | NOT TESTED | If object storage returns missing for an owned media row/gallery item, owner delete still removes the row through backend and gallery refresh; no manual DB cleanup or local-only deletion. A second delete/refresh after the media row is gone is idempotent. |
| K | Object storage / CDN | NOT TESTED | Uploaded avatar/profile photo URLs open from mobile, use `/media/public/:mediaId` resolved against the current backend origin, no localhost/private/internal MinIO URL in production-like responses, no object key/private path leakage, no `putUpload`/internal object-storage Admin Client Error for profile photo upload. Missing objects return `object_not_found`. |
| L | Admin Media Moderation preview | NOT TESTED | Owner/moderator opens Admin Web Media Moderation, sees uploaded avatar/profile photo as an image preview, clicks `Открыть фото`, clicks `Проверить URL`, and confirms valid new avatar returns HTTP 200 `image/webp`; old missing objects show `object_not_found`; locked media has no public URL. |
| M | Locked media admin review | NOT TESTED | Move a photo to locked, open Admin Web Media Moderation, verify list does not expose a public locked URL, detail requires owner/moderator reason, image preview loads through audited admin access, and `/media/public/:mediaId` does not expose the locked photo. |
| N | Manual moderation actions | NOT TESTED | Approve media, mark under review, then reject/restrict with required reason; verify status changes and audit entries exist. |

## Code Audit Before Device Pass

| Check | Result | Notes |
| --- | --- | --- |
| Locked photo URL before unlock | PASS | Public user mapping uses backend public profile photos only; locked gallery summary contains count/state only. |
| Unlock local-only success | PASS | Peer unlock calls `unlockUserLockedGallery`; locked photos render only from backend response. |
| Password local storage/logging | PASS | Locked gallery passwords are kept in component state only; no AsyncStorage/SecureStore persistence or console logging was found in gallery/profile flows. |
| Upload success without backend refresh | PASS | Profile photo upload calls backend-mediated `/media/profile-photo` only after explicit preview confirmation and refreshes owner gallery before success UI. |
| Delete/move success without backend state | PASS | Delete refreshes owner gallery after backend delete; already-removed media rows are idempotent server success; move uses backend response as next gallery state. |
| Stale local photo state after failed mutation | FIXED | Avatar/profile previews are explicit pending states. Failed backend upload does not show success; the preview can be retried, replaced, or cancelled. |
| Locked public route exposure | FIXED | `/media/public/:mediaId` now requires profile photos to be in a public gallery item; locked gallery media is blocked even when `mediaId` is known. |
| Initial moderation status | PASS | New avatar/profile photo uploads create a manual-review moderation record. `NOT_CONFIGURED` automated provider does not fake approval. |
| Closed-test visibility policy | PASS | Pending review public profile media is visible for closed testing; public beta should move to approved-only visibility after real moderation is staffed/configured. |
| Peer media URL diagnostics | PASS | Mobile resolves relative `/media/public/:mediaId` against the current API origin, rewrites old absolute public-media paths to the current origin, rejects invalid URLs safely, probes failed loads, and reports `urlKind`/`mediaId`/`httpStatus`/`contentType` diagnostics without full raw URLs. |
| Owner gallery URL resolution | PASS | Owner gallery uses the same current-origin resolver as peer profile instead of passing relative media paths directly to React Native `Image`. |
| Owner delete diagnostics | PASS | Delete failures report safe `mediaId`, optional `galleryItemId`, HTTP status, error code, visibility, and moderation status without raw URLs or tokens. |
| Broken owner thumbnails | PASS | Owner gallery shows loading/error state and a remove/reupload path instead of silent black placeholders; thumbnail load failures probe `/media/public/:mediaId` safely. |
| Avatar crop action visibility | PASS | Mobile no longer depends on the native cropper action bar; upload waits for visible in-app preview/confirm actions. |

## Found Bugs

| ID | Screen | Steps | Expected | Actual before fix | Status |
| --- | --- | --- | --- | --- | --- |
| G02-1 | `PhotoManagerScreen` | Select a valid-looking image, then force backend upload/complete failure. | Local preview clears and gallery remains backend-sourced. | Pending local photo preview could remain after failure. | FIXED |
| G02-2 | `ProfileScreen` | Select avatar, then force avatar backend upload/profile update failure. | Avatar preview clears and existing backend avatar remains authoritative. | Local avatar preview could remain after failure. | FIXED |
| G03-1 | `UserProfileScreen` | Peer profile returns `hasAvatarUrl=true` and public photos, but Android image load fails. | Client error identifies URL resolution class and media id safely; public media still uses the current backend route. | Client error only showed `hasAvatarUrl=true` and `photoCount`, which did not distinguish stale URL, invalid URL, or Android transport failure. | FIXED |

## Final Status

Gallery ready for next release area: NO.

Reason: this document prepares the real smoke pass and closes code-audit blockers found without devices, but scenarios A-K are still NOT TESTED on two signed-in clients against the real backend/media storage. MEDIA-01 specifically requires a phone upload and peer public profile verification.
