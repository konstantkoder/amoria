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

## Chats / Чаты

- Chats is the single home for all personal conversations.
- Conversation sources:
  - Together / Вместе: personal conversations after a shared drawing or mood palette.
  - Announcements / Объявления: personal conversations after replying to an announcement.
  - Nearby / Рядом: personal conversations after a real nearby contact is available.
- Connections is not a separate bottom tab.
- Shared stories, drawings, palettes, announcement origin, and nearby origin should appear as context inside the chat/conversation, not as a separate release surface.

## Safety / UGC

- All user-generated content surfaces must support real report/block foundations before public release.
- Reports are stored in Firestore under `reports/{reportId}` with reporter, target, reason, status, and timestamp fields.
- Blocked users are stored per user under `users/{uid}/blockedUsers/{blockedUid}`.
- Announcement status values are `active`, `closed`, `deleted`, and `under_review`; release lists only show `active` announcements.
- Explicit paid sexual services, escort/prostitution offers, and compensated sexual meetings are not allowed in announcement copy.
- Announcement, chat, and user reports must feed a real review workflow before public launch.
- Firestore rules for reports, blocks, announcements, responses, and chats must be reviewed before public launch.
- Future stronger moderation is required; this block does not add AI moderation, admin tools, automatic bans, or fake local-only safety state.

## Removed From Release UI

- Rooms
- Connections as bottom tab
- internal Nearby segments

## Important Release Honesty Notes

- No demo/stub/QA/seed paths in product UI.
- Announcements use Firestore as the release source of truth. AsyncStorage must not be used as the product announcement board.
- Announcement photo upload requires Firebase Storage enabled and verified before release.
- Announcement moderation/report/block foundations are backed by Firestore, not AsyncStorage.
- Chats must become the single place for conversations from Together, Announcements and Nearby.
- Chats should surface connection/story context inside each conversation.
- Nearby quick status should open chats when real nearby user identity is available.
- Rooms is not part of the current release UI.
