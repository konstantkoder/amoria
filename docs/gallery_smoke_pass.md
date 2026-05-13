# Gallery Smoke Pass

## Run Metadata

| Field | Value |
| --- | --- |
| Test date/time | 2026-05-13 20:37:42 CEST |
| Backend URL | `https://revelation-claire-filter-losing.trycloudflare.com` detected in local mobile/server env; confirm before manual run |
| Media public URL/base | `https://revelation-claire-filter-losing.trycloudflare.com/media` detected in local server env; confirm before manual run |
| Mobile build/dev client | NOT TESTED |
| Device A | NOT TESTED |
| Device B | NOT TESTED |
| Account A identifier | NOT TESTED |
| Account B identifier | NOT TESTED |

## Scenario Checklist

| ID | Scenario | Result | Manual checks |
| --- | --- | --- | --- |
| A | Avatar upload | NOT TESTED | Login account A, open Profile, choose JPEG/PNG/WebP avatar, upload, verify new avatar appears, restart app, verify avatar persists from backend, open public profile, verify URL is backend/public HTTPS and not `file://`. |
| B | Profile photo upload | NOT TESTED | Open PhotoManager, upload JPEG/PNG/WebP profile photo, verify it appears in public gallery, restart app, verify it persists, login peer account, verify peer can see public photo, verify URL is backend/public HTTPS. |
| C | Unsupported format | NOT TESTED | Try HEIC/HEIF or unsupported image if device provides it, verify app rejects before upload, no backend media is created, clear error is shown. |
| D | Move public to locked | NOT TESTED | Account A has enough visible public images, set locked gallery password if needed, move one photo to locked, verify public profile no longer exposes that photo URL, owner sees it in locked section, peer sees only locked count/state. |
| E | Min visible rule | NOT TESTED | Try moving too many photos to locked, verify backend rejects minimum-visible violation, UI shows clear error, and no fake local move remains after failed mutation. |
| F | Locked unlock success | NOT TESTED | Account B opens account A public profile, sees locked gallery summary/count, enters correct folder password, backend unlock succeeds, locked photos display, refresh/reopen behavior is clear and safe. |
| G | Wrong password | NOT TESTED | Account B enters wrong locked gallery password, backend denies, no locked URLs display, no cached locked photos show, clear error is shown. |
| H | Password set/reset | NOT TESTED | Owner sets locked gallery password with current account password, wrong account password fails, reset requires current account password, old folder password no longer unlocks after reset. |
| I | Blocked peer | NOT TESTED | Account A blocks account B, account B tries public profile and locked unlock, backend denies according to product rule, UI does not show locked photos or broken state. |
| J | Delete photo | NOT TESTED | Owner deletes public photo, backend deletes/updates gallery, photo disappears after refresh/restart, peer no longer sees deleted photo, delete cannot break min visible rule silently. |
| K | Object storage / CDN | NOT TESTED | Uploaded avatar/profile photo URLs open from mobile, use expected public media URL, no localhost/private/internal MinIO URL in production-like config, no object key/private path leakage. |

## Code Audit Before Device Pass

| Check | Result | Notes |
| --- | --- | --- |
| Locked photo URL before unlock | PASS | Public user mapping uses backend public profile photos only; locked gallery summary contains count/state only. |
| Unlock local-only success | PASS | Peer unlock calls `unlockUserLockedGallery`; locked photos render only from backend response. |
| Password local storage/logging | PASS | Locked gallery passwords are kept in component state only; no AsyncStorage/SecureStore persistence or console logging was found in gallery/profile flows. |
| Upload success without backend refresh | PASS | Profile photo upload calls backend upload/complete and refreshes owner gallery before success UI. |
| Delete/move success without backend state | PASS | Delete refreshes owner gallery after backend delete; move uses backend response as next gallery state. |
| Stale local photo state after failed mutation | FIXED | Avatar/profile upload previews are cleared after failed backend mutation so local preview cannot linger as apparent success. |

## Found Bugs

| ID | Screen | Steps | Expected | Actual before fix | Status |
| --- | --- | --- | --- | --- | --- |
| G02-1 | `PhotoManagerScreen` | Select a valid-looking image, then force backend upload/complete failure. | Local preview clears and gallery remains backend-sourced. | Pending local photo preview could remain after failure. | FIXED |
| G02-2 | `ProfileScreen` | Select avatar, then force avatar backend upload/profile update failure. | Avatar preview clears and existing backend avatar remains authoritative. | Local avatar preview could remain after failure. | FIXED |

## Final Status

Gallery ready for next release area: NO.

Reason: this document prepares the real smoke pass and closes code-audit blockers found without devices, but scenarios A-K are still NOT TESTED on two signed-in clients against the real backend/media storage.
