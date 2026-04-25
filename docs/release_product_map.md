# Amoria Release Product Map

## Bottom Tabs

- Together / Вместе
- Nearby / Рядом
- Announcements / Объявления
- Chats / Чаты

## Core / Вместе

- Together / Вместе
  - main scenario: draw with shared creative challenges
  - secondary scenario: color_mood
  - not release pillars: daily_prompt, chain_draw
  - no demos / no fake sessions

## Supporting Flows

- Nearby quick status
- Announcements
- Chats

## Announcements / Объявления

- Announcements is a separate bottom tab for structured user requests.
- Announcement data must live in Firestore under `announcements/{announcementId}`.
- Demo announcements and local-only announcement boards are forbidden in the release path.
- Announcement photos must use Firebase Storage when a photo is selected; text-only announcements remain valid.
- Responding to an announcement creates/records a real server-side response and opens the personal conversation in Chats.
- Chat source context for this path: “After an announcement” / “После объявления”.
- Moderation/report/block is a required release block before public user-generated content is opened broadly.
- Firestore rules must keep release lists to active announcements and restrict create/update to authenticated authors, with responder-owned response documents.

## Chats / Чаты

- Chats is the single home for all personal conversations.
- Conversation sources:
  - Together / Вместе: personal conversations after a shared drawing or mood palette.
  - Announcements / Объявления: personal conversations after replying to an announcement.
  - Nearby / Рядом: personal conversations after a real nearby contact is available.
- Connections is not a separate bottom tab.
- Shared stories, drawings, palettes, announcement origin, and nearby origin should appear as context inside the chat/conversation, not as a separate release surface.
- DM threads and messages require Firestore rules that limit access to thread members.

## Safety / UGC

- All user-generated content surfaces must support real report/block foundations before public release.
- Reports are stored in Firestore under `reports/{reportId}` with reporter, target, reason, status, and timestamp fields.
- Blocked users are stored per user under `users/{uid}/blockedUsers/{blockedUid}`.
- Announcement status values are `active`, `closed`, `deleted`, and `under_review`; release lists only show `active` announcements.
- Explicit paid sexual services, escort/prostitution offers, and compensated sexual meetings are not allowed in announcement copy.
- Announcement, chat, and user reports must feed a real review workflow before public launch.
- Firestore rules for reports, blocks, announcements, responses, and chats must be reviewed before public launch.
- Future stronger moderation is required; this block does not add AI moderation, admin tools, automatic bans, or fake local-only safety state.
- Firestore rules must keep reports client-create-only; client users must not be able to browse or edit the report queue.

## Profile & Media

- User profiles live in Firestore under `users/{uid}`.
- Profile basics for release: `uid`, `displayName`, optional `avatarUrl`, `createdAt`, and `updatedAt`.
- Profile photos must upload to Firebase Storage; local device `photoUri` values must not be used as shared profile media.
- The release avatar upload path is `users/{uid}/profile/avatar.{jpg|png|webp}` and the Firestore profile stores the resulting HTTPS `avatarUrl`.
- Chats, DM context, Announcements, and Nearby should render `avatarUrl` when present and use a neutral initials placeholder when not.
- Announcement cover photos and user profile photos are separate media fields and must not be mixed.
- Firebase Storage rules for profile photos and announcement photos must be reviewed before public release.
- Storage rules must require authenticated image uploads by the owning user and deny unknown shared-media paths.

## Firebase Release Requirements

- Local rules files are part of the release baseline: `firestore.rules`, `storage.rules`, and `firebase.json`.
- Firebase rules must be deployed before public testing or release; the app must not depend on `allow read, write: if request.auth != null` as the final security posture.
- Firestore rules use default deny and authenticated access for app data.
- Storage rules use default deny, authenticated reads, owner-only writes, image content types, and size limits for profile/gallery/announcement images.
- Current intentional rule relaxations:
  - `playQueue` still supports client-side matching and therefore allows authenticated queue-entry reads and candidate match updates.
  - `playSessions` still supports client-driven collaborative session updates for drawing, color mood, reveal, and legacy turn state.
  - `rooms` remains authenticated-only because Rooms are not in the current release UI and the old membership model is not release-ready.
- Firebase Console must be checked before public release: Firestore rules deployed, Storage rules deployed, Email/password auth enabled, Firestore database in `eur3`, Storage bucket enabled, and required indexes created.

## Removed From Release UI

- Rooms
- Connections as bottom tab
- internal Nearby segments

## Important Release Honesty Notes

- No demo/stub/QA/seed paths in product UI.
- Announcements use Firestore as the release source of truth. AsyncStorage must not be used as the product announcement board.
- Announcement photo upload requires Firebase Storage enabled and verified before release.
- Profile avatar upload requires Firebase Storage enabled and verified before public release.
- Firestore and Storage rules must be deployed from the local baseline before public testing/release.
- Announcement moderation/report/block foundations are backed by Firestore, not AsyncStorage.
- Chats must become the single place for conversations from Together, Announcements and Nearby.
- Chats should surface connection/story context inside each conversation.
- Nearby quick status should open chats when real nearby user identity is available.
- Rooms is not part of the current release UI.
