# Firebase Release Rules

This document records the local Firebase rules baseline for the current Amoria release shape. These files must be deployed and checked in Firebase Console before public testing.

## Firestore Collections

- `users/{uid}`
- `amoriaIds/{amoriaId}`
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
- User profiles include release identity fields: `displayName` and app-generated `amoriaId`. Email is auth-only and must not be used as a public identity field.
- `amoriaIds/{amoriaId}` reserves unique public Amoria IDs. Authenticated users can read a direct reservation document, create only their own reservation, and cannot update or delete reservations from the client.
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

- `playQueue` allows authenticated reads of queue entries and lets the matching client narrowly mark a waiting candidate as `matched` only when the transaction also creates a participant `playSessions/{sessionId}` document. Queue writes are limited to release activities `draw` and `color_mood`, include a 90-second `expiresAt` lease, and use `waiting`, `matched`, `cancelled`, or `expired` status.
- Current Together matching is still client-side. Rules can constrain the candidate transition and session participant shape, but they cannot provide the same trust boundary as a server-side matcher; move matching to trusted server-side logic before broad public launch if abuse resistance becomes a release gate.
- `playSessions` lets participants update shared session state because drawing, color mood, reveal, and legacy turn state are currently client-driven. A stricter field-level/session-state validator should replace this if matching moves server-side.
- Authenticated users can read basic user profiles because Chats, Announcements, and Nearby need display names and avatars.
- Authenticated users can read Amoria ID reservations by direct id so the client transaction can avoid collisions while creating a user profile.
- DM thread participants can update thread metadata used by the existing client transaction. A stricter field-level contract can be added after the DM payload stabilizes.
- Chat source context uses existing DM thread fields (`source`, `sourceSessionId`, `artworkSummary`) and reads existing `playSessions`, `announcements`, or `nearbyPosts` documents for previews. No new collection or rule path is introduced by the Chats contact-center layer.

## Firestore Indexes Required Before Device-Pass / Release

The release baseline includes `firestore.indexes.json`; deploy or create these indexes before a real device-pass. A runtime `failed-precondition` Firestore error usually means a missing composite index. Keep the full Firebase error/link in developer logs and show a neutral temporary setup error in the app UI.

Deploy with:

```bash
firebase deploy --only firestore:indexes
```

Manual Firebase Console creation is also acceptable for emergency device-pass fixes, but the checked-in `firestore.indexes.json` must stay the source of truth.

Current composite indexes:

- `playQueue`: `activity ASC`, `status ASC`, `expiresAt ASC`, `createdAt ASC`, `__name__ ASC`.
  - Used by Together matching: `activity ==`, `status == waiting`, `expiresAt > now`, `orderBy(expiresAt asc)`, `orderBy(createdAt asc)`, `limit(20)`.
  - This index must be deployed before device-pass for the 90-second queue lease flow; otherwise Firestore returns `failed-precondition` and the app shows the queue setup message while logging the missing-index detail for developers.
- `nearbyPosts`: `region ASC`, `status ASC`, `createdAt DESC`.
  - Used by Nearby quick status: `region ==`, `status == active`, `orderBy(createdAt desc)`, `limit(200)`.

Current release queries that do not need composite indexes yet:

- `announcements`: current list query is `status == active`; it sorts by `createdAt` on the client. If this moves to server ordering, add `status ASC, createdAt DESC`. If category filtering moves server-side, add `category ASC, status ASC, createdAt DESC`.
- `dmThreads`: current Chats query is `memberIds array-contains uid`; it sorts by `lastMessageAt/updatedAt/createdAt` on the client. If server ordering is introduced, add `memberIds ARRAY_CONTAINS, updatedAt DESC` or the exact timestamp field used by the query.
- `playSessions`: current history/profile queries are `participantIds array-contains uid`; filtering and ordering are client-side. If server ordering/status filtering is introduced, add indexes for the exact `participantIds/status/createdAt` or `participantIds/updatedAt` query.
- `reports` and `users/{uid}/blockedUsers`: current client flows create direct report documents or list the current user's blocked-user subcollection without compound filters.
- `playSessions/{sessionId}/events`, `dmThreads/{threadId}/messages`, and legacy `rooms` subcollections use single-field `orderBy` queries only.

## Rooms And Map-Presence Exclusion

- Rooms are excluded from the current release UI. The active app navigator does not register `RoomsScreen`, and current device-pass should not test Rooms.
- Rooms rules are legacy/non-release deny rules. They must not be relaxed until a separate Rooms UX, membership model, and Firestore contract are intentionally reintroduced.
- Map-presence is excluded from the current release UI. Settings no longer exposes people-on-map or show-me-on-map toggles.
- Before returning Rooms or map-presence later, add separate rules, product UX, privacy copy, and device-pass coverage deliberately instead of reusing the old permissive paths.

## Firebase Console Checklist

- Deploy `firestore.rules`.
- Deploy `firestore.indexes.json` with `firebase deploy --only firestore:indexes`, or verify the same composite indexes manually in Firebase Console.
- Deploy `storage.rules`.
- Confirm Email/password auth is enabled for the release environment.
- Confirm Firestore database exists in `eur3`.
- Confirm Firebase Storage bucket is enabled.
- Create or verify required Firestore indexes for current queries.
- Review report handling: client rules create reports, but public launch still needs an operational moderation process.
- Re-test profile photo upload, announcement photo upload, announcement responses, Nearby status publish/delete/chat handoff, DM send/read, and Together matching against deployed rules.
