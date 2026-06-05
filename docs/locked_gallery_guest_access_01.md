# Locked Gallery Guest Access 01

Updated: 2026-06-05

## Scope

`LOCKED-GALLERY-GUEST-ACCESS-01` hardens guest access for locked profile gallery media before public beta. It changes only the server locked-gallery access path and the mobile peer profile unlock UI. It does not change Nearby, Together, billing, local launch files, database schema, or media hard-delete behavior.

## Public Summary

Authenticated public profile reads may show a locked gallery summary:

- locked gallery exists: `lockedGallery.enabled`;
- locked gallery count when available: `lockedGallery.count`;
- no locked photo URLs;
- no object keys, storage paths, signed URLs, password hashes, exact coordinates, or exact birth dates.

Public profile photos and avatars continue to use `/media/public/:mediaId`. Locked profile gallery media is rejected by the public media route even if a media ID is known.

## Owner Password Management

Owners manage their own locked-gallery password through the existing `/me/profile/gallery/locked-password` routes. The server stores only the password hash and never returns the hash or plain password. A user cannot manage another user's locked gallery password through these owner routes.

## Guest Unlock

Guest unlock uses:

```text
POST /users/:id/locked-gallery/unlock
```

The endpoint requires an authenticated viewer. Blocked user pairs cannot unlock. A correct password returns:

- locked photo records whose `url` values are safe `/media/locked/:mediaId` paths;
- a short-lived unlock token;
- `unlockExpiresAt`.

Wrong passwords return a safe error without photos. Passwords are not logged, audited, or returned.

## Rate Limit

Wrong unlock attempts are rate-limited per viewer user ID plus target user ID:

- first wrong attempts return `forbidden`;
- the fifth wrong attempt in the 10-minute window returns `locked_gallery_rate_limited`;
- further attempts stay blocked for 15 minutes.

The current beta implementation stores this rate-limit state in the backend process. If the API is horizontally scaled, move the bucket to a shared store before relying on it as a global abuse limit.

## Unlock Session

Unlock sessions use a JWT unlock token:

- target-specific;
- viewer-specific;
- typed as `locked_gallery_unlock`;
- expires after 10 minutes;
- invalid, expired, missing, wrong-viewer, or wrong-target tokens do not serve locked media.

Locked media is fetched through:

```text
GET /media/locked/:mediaId
Authorization: Bearer <viewer access token>
x-amoria-locked-gallery-token: <unlock token>
```

The response uses `Cache-Control: private, no-store`. The route verifies the media is a locked profile gallery item, verifies the unlock token for the viewer and owner, checks block state again, and streams the object without exposing object keys or signed URLs.

## Mobile Behavior

The peer profile screen shows a locked album card when the public profile summary says the locked gallery exists. The RU release copy is:

- `Закрытый альбом`;
- `Введите пароль`.

Correct password unlocks the locked photos and loads them with authenticated headers against `/media/locked/:mediaId`. Wrong password, too many attempts, and expired unlock sessions show explicit errors and ask the user to enter the password again. Nearby cards still use only public media URL normalization and do not show locked gallery content.

## Audit

Unlock success and failure write admin audit rows with safe metadata:

- `viewerUserId`;
- `targetUserId`;
- `success`;
- `reasonCode`;
- `timestamp`.

Audit rows do not include the password, password hash, raw media URLs, object keys, signed URLs, exact coordinates, or exact birth dates.

## Verification

Commands run:

- Server `npm run typecheck`: pass.
- Server `npm test`: pass, `215/215`.
- Mobile `npx tsc --noEmit`: pass.

The server test run still emits the existing AWS SDK Node 18 support warning. It did not fail the suite.

Tests cover:

- public profile summary hides locked media URLs;
- correct password unlocks;
- wrong password fails;
- too many wrong attempts are rate-limited;
- expired unlock token is rejected;
- blocked viewer cannot unlock;
- wrong owner cannot manage another user's locked gallery password;
- locked media route requires authenticated valid unlock token;
- password/hash are not returned;
- unlock audit is written without password.

## Build Impact

- EAS rebuild: no, no native configuration changed.
- Backend restart: yes, server route/service behavior changed.
- DB migration: no.
- Admin build: no.
- Metro cache clear: yes, to make sure the peer profile bundle and i18n copy reload during smoke.
