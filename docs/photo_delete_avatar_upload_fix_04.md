# Photo Delete And Avatar Upload Fix 04

Updated: 2026-05-27

## Scope

- Owner gallery delete remains backend-backed through `DELETE /media/:mediaId`.
- Missing storage objects are not treated as successful image loads.
- Already removed media rows are safe to refresh past; wrong-owner media still cannot be deleted.
- Avatar/profile photo picking avoids the native cropper action bar that was hidden on the smoke phone.
- Upload still waits for explicit in-app preview confirmation.

## Root Cause

- The owner delete path depended on a live media row and returned `404` for rows already removed, which made refresh look like success while stale UI could remain confusing.
- Owner gallery did not receive moderation status, so delete failure diagnostics could not include it.
- Avatar picker used `expo-image-picker` native editing. On the tested phone the crop rectangle opened without a visible confirm button, so upload never reached the backend.

## Fix

- Server delete now distinguishes three states:
  - own media exists: delete object when present, delete media row, sync public read model;
  - media row is already gone: idempotent `{ ok: true }` and read-model sync;
  - media belongs to another user: `404 not_found`.
- Owner gallery response includes safe `moderationStatus`.
- Owner thumbnail failures show an error state and report safe diagnostics: `mediaId`, `galleryItemId`, `httpStatus`, `errorCode`, `visibility`, and `moderationStatus`.
- Avatar/profile photo flows now use in-app preview/confirm buttons instead of relying on the native cropper confirm UI.

## Smoke Checklist

1. Owner gallery renders photos or shows a clear broken-photo state.
2. Broken owner photo can be deleted.
3. Gallery refresh removes the deleted item.
4. Avatar picker returns to Profile preview with visible action buttons.
5. Avatar upload succeeds only after user confirms.
6. Peer profile shows the new avatar.
7. Public profile photos render through `/media/public/:mediaId`.
8. Locked media remains blocked from public routes.

## Guardrails

- No fake media success.
- No local-only delete or avatar upload.
- No raw URLs, signed URLs, tokens, or object keys in Client Errors.
- Locked gallery media stays protected.
