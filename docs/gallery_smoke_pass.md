# Gallery / Peer Media Smoke Pass

Updated: 2026-05-24

## Peer Profile Media

Use a real account with an avatar and at least one public profile photo.

1. Open the peer profile from Together/DM context.
2. Confirm `avatarUrl` points to `/media/public/:mediaId` in backend response.
3. Confirm public photos use `/media/public/:mediaId`.
4. Confirm Android renders avatar and public photos.
5. If loading fails, inspect Client Errors for:
   - `screen=UserProfileScreen`
   - `action=loadPeerMedia`
   - `step=avatarLoadFailed` or `publicPhotoLoadFailed`
   - safe `mediaId`
   - safe `urlKind`
6. Confirm no full raw URL, signed URL, token, local file path, or locked-gallery media is exposed.

## Policy

Closed-test pending-review avatar/public profile media may be visible so the release team can test real upload, profile, and moderation flows without fake approval.

Locked gallery media must not be returned by public profile or `/media/public/:mediaId` unless the user unlocks the locked gallery through the password flow.
