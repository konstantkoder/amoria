# BUGFIX-GEO-KEYBOARD-CROP-CLEANUP-01

Updated: 2026-05-23

## Together Geo / Retry

- Default Together radius is `Без ограничения` / `No limit` / `Bez ograničenja`.
- No-limit queue starts without foreground location.
- Finite radius (`5/25/100/250 km`) requests foreground location before queue join.
- If location permission/read fails, the app does not start a fake queue and reports a sanitized client error with radius, permission status, and `hasCoordinates: false`.
- Repeated retry cancels the current queue entry before joining again.
- Delayed finite-radius search shows `Пока никого не нашли. Попробуйте без ограничения.` and offers `Попробовать без ограничения`, which cancels the current entry and re-queues with no limit.
- Client error metadata never includes exact coordinates.

## Keyboard

- DM message send dismisses and blurs the composer only after backend send success.
- Edit Profile explicit Save dismisses and blurs profile fields only after backend save success.
- Profile name save and Identity setup name save dismiss after successful backend save.
- Locked gallery password set/reset dismisses password inputs only after successful backend save.
- Failed validation/save leaves inputs available for correction.

## Photo Crop / Preview / Confirm

- Avatar picking uses the native editor with square crop and uploads only after explicit preview confirmation.
- Profile gallery picking uses the native editor with square crop because the current owner/public gallery UI renders fixed square tiles.
- Preview actions are `Загрузить фото`, `Выбрать другое`, and `Отмена`.
- Cancel does not upload. Failed upload keeps the preview retryable and does not show local-only success.
- Backend media validation, WebP re-encode, and metadata stripping remain the source of hardening.

## color_mood

- `color_mood` is no longer an active lobby/new-session path.
- `PlayColorMoodScreen` and palette parsing were removed in `RELEASE-SMOKE-BLOCKERS-02`; old local/dev rows show an unsupported-old-session fallback.
- Story Sparks and draw remain active.
