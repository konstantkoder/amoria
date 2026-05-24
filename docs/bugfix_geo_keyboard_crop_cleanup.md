# BUGFIX-GEO-KEYBOARD-CROP-CLEANUP-01

Updated: 2026-05-24

## Together Geo / Retry

- Default Together radius is `25 km`.
- Every radius mode, including no-limit, requests foreground location before queue join.
- No-limit sends real coordinates with `radiusKm:null`; it means no distance cap, not no geolocation.
- If location permission is denied, the app does not join queue and shows the required-location privacy message.
- If location read fails after permission, the app reports a sanitized client error with radius, permission status, and `hasCoordinates: false`.
- Repeated retry cancels the current queue entry before joining again.
- Delayed search offers `Расширить радиус` or `Остановить поиск`; expanding cancels the current entry and re-queues with the next radius.
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
