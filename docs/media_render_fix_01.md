# Media Render Fix 01

Updated: 2026-05-25

## Scope

This block verifies real media rendering on mobile peer profiles and Admin Media Moderation. It does not approve media automatically, fake image success, expose locked gallery media, or use Firebase/local-only fallbacks.

## Mobile Peer Profile

- Peer avatar and public photos are normalized to the current backend origin before rendering.
- On image failure, Client Errors include safe `mediaId`, `urlKind`, `httpStatus`, `contentType`, `hasAvatarUrl`, `photoCount`, visibility, and moderation status when available.
- Client Errors must not include raw full URLs, signed URLs, tokens, local file paths, or locked-gallery media payloads.

## Public Media Contract

- Allowed public media is served from `GET /media/public/:mediaId`.
- Allowed avatar/profile media should return HTTP 200 and an image content type such as `image/webp`.
- Locked gallery media must not be served from the public route.
- Closed-test pending-review avatar/public profile media remains visible so the release team can test real upload and moderation flows. If policy changes later, profile/admin UI must stop showing broken images and explain the hidden moderation state.

## Smoke

1. Open Admin Media Moderation.
2. Confirm thumbnails render.
3. Click `Открыть фото` and confirm the browser opens an actual image.
4. Open a peer profile from Together or DM.
5. Confirm avatar and public photos render.
6. If rendering fails, inspect Client Errors for `mediaId`, `urlKind`, `httpStatus`, and `contentType`.
7. Confirm no raw URLs or locked-gallery public exposure.
