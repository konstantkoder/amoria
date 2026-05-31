# Media Crop Flow 01

Updated: 2026-05-29

## Scope

This block adds mandatory release-safe crop confirmation before avatar and public profile photo upload.

Native image-picker editing is not the release contract because its action buttons can disappear on some devices. Mobile uses an in-app square crop UI, then sends crop metadata to the backend. The backend remains the authority for image decoding, crop validation, WebP re-encoding, metadata stripping, object storage write, and public media read model updates.

## Crop Metadata Contract

Upload endpoints may receive optional crop metadata:

```json
{
  "x": 0,
  "y": 0,
  "width": 1,
  "height": 1
}
```

Values are normalized `0..1` coordinates relative to the oriented source image. `x` and `y` are the top-left origin. `width` and `height` are the selected crop size. Avatar and current profile-photo UI require a square crop after conversion to source pixels.

Backend validation rejects invalid crop metadata:

- `x/y < 0`
- `width/height <= 0`
- crop outside image bounds
- non-square avatar crop
- non-square profile-photo crop

If crop metadata is missing, old clients still work: the backend applies a safe center-square crop before WebP encoding.

## Mobile Flow

1. User taps avatar change or profile photo add.
2. User selects a real local image.
3. Mobile opens the full-screen dark in-app crop UI.
4. User sees the source image behind a clear square crop frame, with the outside area dimmed and a visible 3x3 grid inside the frame.
5. User drags the image with one finger and pinches with two fingers to zoom. Pinch zoom keeps the pinch midpoint stable.
6. The image transform is clamped after each drag or pinch so the crop square always stays filled.
7. Fixed bottom actions remain visible outside the crop square: primary `Готово`, secondary `Отменить` and `Выбрать другое`; `Сбросить` is a small secondary reset action.
8. After `Готово`, mobile shows an unsaved preview generated from the same normalized crop metadata that will be uploaded.
9. Upload happens only after the user taps `Загрузить` / avatar upload.
10. Mobile sends the original image plus normalized crop metadata.
11. Backend applies the crop and re-encodes WebP.
12. Mobile refreshes avatar/gallery from backend state.

There is no local-only crop success, no local-only avatar success, and no fake media upload success.

## Smoke Checklist

1. Avatar: choose photo, crop screen opens, drag face/object under the fixed square, pinch zoom, verify grid and dimmed outside area are visible, verify no `+` / `-` zoom buttons dominate the crop UI, tap `Готово`, verify preview, upload, restart app, avatar persists, peer sees avatar.
2. Profile photo: choose photo, crop screen opens, drag/pinch, verify the crop square stays filled with no black/empty area, tap `Готово`, verify preview, upload, owner gallery refreshes, peer sees public photo.
3. Cancel crop: confirm no upload request happens and gallery/avatar does not change.
4. Choose another: confirm it replaces the selected image before upload.
5. Invalid crop: backend rejects clearly and mobile keeps retry/cancel state.
6. Admin URL probe for uploaded avatar/profile media returns HTTP 200 with `image/webp`.
7. Locked gallery media remains blocked from public routes.

## Diagnostics

Mobile reports safe Client Errors for:

- `cropOpenFailed`
- `cropConfirmFailed`
- `cropInvalid`
- `avatarUploadFailed`
- `profilePhotoUploadFailed`

Allowed metadata is limited to crop source (`avatar` or `profile_photo`), safe MIME/type, and crop ratio. Do not include raw local paths, raw image data, signed URLs, tokens, or secrets.
