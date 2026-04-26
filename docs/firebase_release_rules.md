# Firebase Release Rules

This document records the local Firebase rules baseline for the current Amoria release shape. These files must be deployed and checked in Firebase Console before public testing.

## Firestore Collections

- `users/{uid}`
- `users/{uid}/blockedUsers/{blockedUid}`
- `dmThreads/{threadId}`
- `dmThreads/{threadId}/messages/{messageId}`
- `playQueue/{uid}`
- `playSessions/{sessionId}`
- `playSessions/{sessionId}/events/{eventId}`
- `announcements/{announcementId}`
- `announcements/{announcementId}/responses/{uid}`
- `reports/{reportId}`
- `nearbyPosts/{postId}`

Legacy non-release paths remain in the local rules file only to deny client access explicitly:

- `presence/{uid}`
- `rooms/{roomId}`
- `rooms/{roomId}/messages/{messageId}`
- `rooms/{roomId}/members/{uid}`

`locationPrivacy` is local `AsyncStorage` state and does not define a remote Firebase path. The release-facing location preference is only Nearby quick-status consent/enabled state; old map-presence toggles are legacy/internal compatibility state and are not shown in Settings.

## Storage Paths

- `users/{uid}/profile/avatar.{jpg|png|webp}`
- `users/{uid}/photos/{imageId}.{jpg|png|webp}`
- `announcements/{authorUid}/{announcementId}/cover.{jpg|png|webp}`

## Rules Baseline

- Firestore and Storage both deny unknown paths by default.
- The pre-device-pass audit must keep the local rules free of global allow-all rules.
- All app data requires an authenticated Firebase user.
- User profile documents can be read by authenticated users by direct document id and written only by the profile owner.
- Block lists are private to the owning user.
- DM threads and messages are limited to thread members.
- Play sessions and play events are limited to session participants.
- Announcements list only `active` documents; direct detail reads stay authenticated so the client can show closed, deleted, or under-review states honestly.
- Announcement responses use `responses/{uid}` and can be written only by that responder, not by the announcement author.
- Reports are create-only for clients and require `reporterUid == request.auth.uid`.
- Nearby means quick-status with geolocation, not map presence. `nearbyPosts` list only active quick-status documents; creates and updates are limited to the signed-in author, and client lists still filter expired `expiresAt` values.
- `presence` is legacy map-presence storage and is denied to clients in this release.
- `rooms` and its subcollections are legacy/non-release storage and are denied to clients in this release.
- Profile, gallery, and announcement images must be uploaded to Storage as images within size limits.

## Intentionally Relaxed

- `playQueue` allows authenticated reads of queue entries and lets the matching client mark a waiting candidate as `matched`. Current matching is client-side and performs transaction reads after an initial waiting query; this should move to trusted server-side logic before broad public launch.
- `playSessions` lets participants update shared session state because drawing, color mood, reveal, and legacy turn state are currently client-driven. A stricter field-level/session-state validator should replace this if matching moves server-side.
- Authenticated users can read basic user profiles because Chats, Announcements, and Nearby need display names and avatars.
- DM thread participants can update thread metadata used by the existing client transaction. A stricter field-level contract can be added after the DM payload stabilizes.
- Chat source context uses existing DM thread fields (`source`, `sourceSessionId`, `artworkSummary`) and reads existing `playSessions`, `announcements`, or `nearbyPosts` documents for previews. No new collection or rule path is introduced by the Chats contact-center layer.

## Rooms And Map-Presence Exclusion

- Rooms are excluded from the current release UI. The active app navigator does not register `RoomsScreen`, and current device-pass should not test Rooms.
- Rooms rules are legacy/non-release deny rules. They must not be relaxed until a separate Rooms UX, membership model, and Firestore contract are intentionally reintroduced.
- Map-presence is excluded from the current release UI. Settings no longer exposes people-on-map or show-me-on-map toggles.
- Before returning Rooms or map-presence later, add separate rules, product UX, privacy copy, and device-pass coverage deliberately instead of reusing the old permissive paths.

## Firebase Console Checklist

- Deploy `firestore.rules`.
- Deploy `storage.rules`.
- Confirm Email/password auth is enabled for the release environment.
- Confirm Firestore database exists in `eur3`.
- Confirm Firebase Storage bucket is enabled.
- Create or verify required Firestore indexes for current queries.
- Review report handling: client rules create reports, but public launch still needs an operational moderation process.
- Re-test profile photo upload, announcement photo upload, announcement responses, Nearby status publish/delete/chat handoff, DM send/read, and Together matching against deployed rules.
