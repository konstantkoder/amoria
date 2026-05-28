# Bugfix Draw Photo Avatar Final 06

Updated: 2026-05-28

## Scope

- Draw tools drawer no longer exposes visible Move mode or Reset controls to normal users.
- One-finger draw and erase remain backend-backed stroke events.
- Two-finger pan/zoom remains a viewport gesture and does not change stroke event format.
- Owner photo delete is real backend delete, not move-to-locked and not local-only success.
- Avatar flow is choose -> square center-crop preview -> explicit upload -> backend save -> backend refresh.

## Fix Summary

- Removed visible Move/Reset drawer controls from `SharedCanvasWebView`; internal viewport handlers and two-finger pan/zoom remain intact.
- Server delete bypasses the locked-folder minimum-visible guard; the guard still applies to locked-folder move/password flows.
- Mobile delete failure no longer maps `min_visible_required` to the hide-photo copy during delete. It reports safe diagnostics and shows the delete-specific failure text.
- Avatar preview is marked unsaved with `Предпросмотр — ещё не сохранено`.
- Avatar upload compares canonical `/media/public/:mediaId` identity instead of raw absolute-vs-relative URLs after `/media/avatar`.
- Peer avatar uses backend public profile `avatarUrl`; missing objects are filtered server-side or diagnosed by safe Client Errors.
- Admin media diagnostics continue to distinguish HTTP 200 image media, `object_not_found`, locked media, and pending-review closed-test media without exposing locked public URLs.

## Smoke

1. Open Together draw tools drawer and confirm no visible Move/Reset controls.
2. Draw with one finger.
3. Erase with one finger.
4. Pan/zoom with two fingers.
5. Delete an old/broken owned photo from Photo Manager.
6. Confirm gallery refresh removes the deleted item.
7. Choose avatar, confirm square preview and `Предпросмотр — ещё не сохранено`, then upload.
8. Restart app and confirm avatar persists from backend.
9. Open the owner profile from a peer account and confirm avatar is visible.
10. In Admin Media, run `Проверить URL` for the avatar and confirm HTTP 200 with `image/webp`.

## Guardrails

- No fake media success.
- No fake delete.
- No local-only avatar success.
- No locked gallery public exposure.
- No backend draw event format changes.
- No `color_mood` restoration.
- No exact coordinate exposure.
