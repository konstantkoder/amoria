# Media Render Fix 01

Updated: 2026-05-25

## Scope

This block verifies real image rendering for public avatar/profile media and Admin Media Moderation previews. It does not approve media automatically, fake image success, expose locked gallery media, or use Firebase/local-only fallbacks.

## Public Media Contract

- Allowed public media is served from `GET /media/public/:mediaId`.
- Allowed `avatar`, `profile_avatar`, and public `profile_photo` responses must return HTTP 200 with an image content type such as `image/webp`.
- Locked gallery `profile_photo` media must not be served from the public route.
- Closed-test pending-review avatar/public profile media remains visible so the release team can test real upload and moderation flows. If policy changes later, profile/admin UI must stop showing broken images and explain the hidden moderation state.

## Admin Media

- Media Moderation thumbnails use the safe public `/media/public/:mediaId` path for avatar/public visibility.
- Locked media has no public preview URL.
- The detail panel uses the authenticated audited admin content route for preview.
- If a thumbnail fails, Admin Web shows `Не удалось открыть изображение`, media id, moderation status, MIME, and a safe HTTP probe result.
- `Проверить URL` probes the public route without exposing signed URLs or secrets.

## Mobile Peer Profile

- Peer avatar and public photos are normalized to the current backend origin before rendering.
- On image failure, Client Errors include safe `mediaId`, `urlKind`, `httpStatus`, `contentType`, `hasAvatarUrl`, `photoCount`, visibility, and moderation status when available.
- Client Errors must not include raw full URLs, signed URLs, tokens, local file paths, or locked-gallery media payloads.

## Smoke

1. Open Admin Media Moderation.
2. Confirm thumbnails render.
3. Click `Открыть фото` and confirm the browser opens an actual image.
4. Click `Проверить URL` and confirm HTTP 200 plus an image content type.
5. Open a peer profile from Together or DM.
6. Confirm avatar and public photos render.
7. If rendering fails, inspect Client Errors for `mediaId`, `urlKind`, `httpStatus`, and `contentType`.
8. Confirm locked gallery media is not public.
