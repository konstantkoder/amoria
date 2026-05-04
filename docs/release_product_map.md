# Amoria Release Product Map

## Bottom Tabs

- Together / Вместе
- Nearby / Рядом
- Announcements / Объявления
- Chats / Чаты

## Core / Вместе

- Main scenario: draw with shared creative challenges.
- Release launch activity: `draw`.
- Together queue, sessions, events, reveal, and history use the backend API.
- Realtime drawing events use the app WebSocket client.
- Result opens a specific chat after mutual open.
- Required canvas tools for release: colors, line widths, readable tool labels, eraser, and undo for the user's latest stroke.

## Supporting Flows

- Nearby quick status
- Announcements
- Chats

## Nearby / Рядом

- Nearby is a quick nearby intent/status surface, not a hub for rooms.
- Nearby means quick nearby status with geolocation, not map presence.
- Statuses expire and must not remain visible as live nearby intent forever.
- Another user can open a personal chat from a nearby status when backend identity is available.
- Rooms is not part of the Nearby release UI.
- Map presence is not part of the Nearby release UI.

## Announcements / Объявления

- Announcements is a separate bottom tab for structured user requests.
- Announcement data and responses use backend API services.
- Local-only announcement boards are forbidden in the release path.
- Local device media paths must never be written as shared announcement media.
- Responding to an announcement creates or records a real server-side response and opens the personal conversation in Chats.
- Moderation/report/block is a required release block before public user-generated content is opened broadly.

## Chats / Чаты

- Chats is the single home for all personal conversations.
- The internal `Inbox` route/tab name may remain for code stability, but the user-facing name is always Chats / Чаты.
- Conversation sources:
  - Together / Вместе: personal conversations after a shared drawing.
  - Announcements / Объявления: personal conversations after replying to an announcement.
  - Nearby / Рядом: personal conversations after a real nearby contact is available.
- Connections is not a separate bottom tab.
- Shared stories, drawings, announcement origin, and nearby origin should appear as context inside the chat/conversation.
- Every DM must provide a clear way to open the peer profile from inside the chat.
- Blocked users are hidden from the normal Chats list; directly opened blocked threads remain readable as history with sending disabled.

## Safety / UGC

- All user-generated content surfaces must support real report/block foundations before public release.
- Announcement status values are `active`, `closed`, `deleted`, and `under_review`; release lists only show `active` announcements.
- Explicit paid sexual services, escort/prostitution offers, and compensated sexual meetings are not allowed in announcement copy.
- Announcement, chat, and user reports must feed a real review workflow before public launch.
- Future stronger moderation is required; this block does not add AI moderation, admin tools, automatic bans, or fake local-only safety state.

## Profile & Media

- Email/password is authentication only. Email must not be used as a public display name in cards, chats, announcements, Nearby, Together results, or peer profiles.
- Profile basics for release: `uid`, `displayName`, `amoriaId`, optional `avatarUrl`, `createdAt`, and `updatedAt`.
- `displayName` is the public human name. It is trimmed, 2-30 characters, and not unique.
- `amoriaId` is an app-generated unique public identifier such as `AM-7K42P`; users do not choose unique usernames like `Anna123`.
- Future search/contact flows may use Amoria ID, but this release block does not add ID search, friend requests, followers, or a public feed.
- User-facing cards should prefer `profile.displayName`, then a stored real display-name snapshot, then the neutral Amoria user fallback. They must not show email or generated `nick.*` values as the primary identity.
- Shared profile media must use backend-hosted HTTPS URLs.
- Chats, DM context, Announcements, and Nearby should render `avatarUrl` when present and use a neutral initials placeholder when not.
- Peer profiles show displayName, avatar, Amoria ID, source context, and shared history only when a real source session is available.

## Removed From Release UI

- Rooms
- map presence / people-on-map UI
- Settings people-on-map toggles
- Connections as bottom tab
- internal Nearby segments
- legacy `daily_prompt`, `chain_draw`, and `color_mood` launch paths

## Device-Pass Checklist

- Verify only four bottom tabs are visible: Together / Вместе, Nearby / Рядом, Announcements / Объявления, Chats / Чаты.
- Verify Rooms is not registered as an active release navigation route and no CTA opens Rooms from Together, Nearby, Announcements, Chats, or the drawer.
- Verify Settings exposes only the Nearby location toggle and no map people / show-me-on-map controls.
- Verify Connections is not visible as a bottom tab or main release section.
- Verify Chats / Чаты is the user-facing label for the personal conversations tab; Inbox remains an internal route name only.
- Verify Together launch paths are limited to `draw`.
- Verify empty/error states route only to release tabs: Together, Nearby, Announcements, and Chats.

## Important Release Honesty Notes

- No demo/stub/QA/seed paths in product UI.
- Announcements must use the backend as the release source of truth. AsyncStorage must not be used as the product announcement board.
- Chats must be the single place for conversations from Together, Announcements, and Nearby.
- Chats surface connection/story context inside each conversation when the real source data is available.
- Nearby quick status should open chats when real nearby user identity is available.
- Rooms is not part of the current release UI. Before returning Rooms later, reintroduce separate Rooms UX, privacy copy, navigation entry points, and backend contracts intentionally.
