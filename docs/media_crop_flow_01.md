# Media Crop Flow 01

Updated: 2026-05-28

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
3. Mobile opens the in-app crop UI.
4. User sees a square crop frame.
5. User can pan and zoom the image inside the frame.
6. User can tap `Готово`, `Отменить`, or `Выбрать другое`.
7. After `Готово`, mobile shows an unsaved preview.
8. Upload happens only after the user taps `Загрузить` / avatar upload.
9. Mobile sends the original image plus normalized crop metadata.
10. Backend applies the crop and re-encodes WebP.
11. Mobile refreshes avatar/gallery from backend state.

There is no local-only crop success, no local-only avatar success, and no fake media upload success.

## Smoke Checklist

1. Avatar: choose photo, crop square, preview, upload, restart app, avatar persists, peer sees avatar.
2. Profile photo: choose photo, crop square, preview, upload, gallery shows cropped photo, peer sees public photo.
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
