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
  - release launch activities: `draw`, `color_mood`
  - not release pillars and not launchable from release UI: `daily_prompt`, `chain_draw`
  - no demos / no fake sessions
  - Together queue waits up to 90 seconds; users do not need to press the start button at the same time.
  - Matching uses a queue TTL (`expiresAt`) plus stale cleanup, so delayed second-device entry can find the first waiting user.
  - Release matching supports only `draw` and `color_mood`; legacy `daily_prompt` and `chain_draw` data can still render as saved history but must not start new release matches.
- Draw release UX requirements:
  - PlayLobby presents draw as the primary entry, with color_mood as the softer secondary path.
  - PlayMatch explains that the app is looking for another person to create one shared drawing/moment, not just loading a game.
  - Draw flow is: challenge preview with visual inspiration examples -> fullscreen/near-fullscreen canvas -> result -> chat/history.
  - Stroke coordinates must be stored as normalized coordinates or in a stable virtual coordinate system, then scaled to the current canvas size on render so the same drawing looks consistent across phone and emulator.
  - The challenge preview may show 1-3 small local inspiration examples, but they are only ideas, never templates, never tracing references, and never a canvas background.
  - Inspiration examples must match the specific draw challenge. Bad unrelated romantic/background images must not be used for animal, bicycle, rain, mood, or other concrete prompts.
  - Inspiration examples are shown before drawing only. The active drawing canvas starts clean and does not show examples behind or beside the drawing surface.
  - The active phone drawing canvas must not be a small card inside a scrolling page. It should use a fullscreen/near-fullscreen no-scroll layout with only the compact challenge above and drawing tools below, and the canvas should take most of the phone screen during drawing.
  - The draw challenge must be visible in Canvas, Result, History, SessionDetail, and DM source context when available.
  - Result must prioritize the shared artifact/replay and the next decision about chat/history over drawing metrics.
  - Result screen opens a specific chat after mutual open. It must not use Chats / Чаты as an action button, because Chats is the bottom tab for the full conversation list.
  - Result CTAs use one term for the concrete conversation: Open chat / Открыть чат, Keep as story / Оставить как историю, and Open shared story / Открыть общую историю when the saved source session is available.
  - Required minimum canvas tools for release: 6-8 colors, 3 line widths, readable tool labels, and a layout that does not cover the canvas.
  - Must-have core polish before release: real eraser and undo for the user's latest stroke. The current draw event model is append-only stroke batches, so these must not be faked with local-only UI.
  - Local inspiration examples should be added or reviewed for each draw challenge before release; remote URLs must not be used for draw challenge examples.

## Supporting Flows

- Nearby quick status
- Announcements
- Chats

## Nearby / Рядом

- Nearby is a quick nearby intent/status surface, not a hub for Announcements or Rooms.
- Nearby means quick nearby status with geolocation, not map presence.
- Nearby statuses are shared Firestore documents under `nearbyPosts/{postId}`.
- Demo, seed, local-only, and fake nearby statuses are forbidden in the release path.
- A nearby status has a real author uid, location region/geohash, mood/intent, `status`, `createdAt`, and `expiresAt`.
- Statuses expire and must not remain visible as live nearby intent forever.
- Another user can open a personal chat from a nearby status; the DM source context is `nearby`.
- Chats show this source as “From Nearby” / “Из Рядом”.
- Blocked users are filtered out of the normal nearby status list.
- Rooms is not part of the Nearby release UI.
- Map presence is not part of the Nearby release UI.

## Announcements / Объявления

- Announcements is a separate bottom tab for structured user requests.
- Announcement data must live in Firestore under `announcements/{announcementId}`.
- Demo announcements and local-only announcement boards are forbidden in the release path.
- Announcement photos must use Firebase Storage when a photo is selected; text-only announcements remain valid.
- Announcement photo selection shows a local preview first, then uploads to `announcements/{authorUid}/{announcementId}/cover.jpg`; Firestore stores only the resulting HTTPS `photoUrl`.
- Local device `photoUri` values must never be written as shared announcement media.
- Android crop/editing is disabled for announcement photo selection in the release path.
- Responding to an announcement creates/records a real server-side response and opens the personal conversation in Chats.
- Chat source context for this path: “After an announcement” / “После объявления”.
- Moderation/report/block is a required release block before public user-generated content is opened broadly.
- Firestore rules must keep release lists to active announcements and restrict create/update to authenticated authors, with responder-owned response documents.

## Chats / Чаты

- Chats is the single home for all personal conversations.
- The internal `Inbox` route/tab name may remain for code stability, but the user-facing name is always Chats / Чаты.
- Chats / Чаты means the bottom tab with all personal conversations. A specific conversation with one person is a chat.
- Conversation sources:
  - Together / Вместе: personal conversations after a shared drawing or mood palette.
  - Announcements / Объявления: personal conversations after replying to an announcement.
  - Nearby / Рядом: personal conversations after a real nearby contact is available.
- Connections is not a separate bottom tab.
- Shared stories, drawings, palettes, announcement origin, and nearby origin should appear as context inside the chat/conversation, not as a separate release surface.
- Chat cards show the peer avatar/displayName, latest message, stable source label, and source preview when the thread has a real readable source id.
- Every DM must provide a clear way to open the peer profile from inside the chat.
- The peer profile shows the real profile avatar/displayName, Amoria ID, the source context that opened the chat, and the shared story block only when a real shared session id is available.
- If `displayName` is missing for a legacy account, the UI uses a neutral Amoria user fallback and asks the user to complete the profile instead of showing email or a generated nickname.
- Source details open only when the source is real and routeable:
  - Together sources open `PlaySessionDetail` when `sourceSessionId` points to an existing play session.
  - Announcement sources open `AnnouncementDetail` when `sourceSessionId` points to an existing announcement.
  - Nearby sources show the status text as context; there is no fake nearby detail screen.
- Blocked users are hidden from the normal Chats list; directly opened blocked threads remain readable as history with sending disabled.
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
- Email/password is authentication only. Email must not be used as a public display name in cards, chats, announcements, Nearby, Together results, or peer profiles.
- Profile basics for release: `uid`, `displayName`, `amoriaId`, optional `avatarUrl`, `createdAt`, and `updatedAt`.
- `displayName` is the public human name. It is trimmed, 2-30 characters, and not unique.
- `amoriaId` is an app-generated unique public identifier such as `AM-7K42P`; users do not choose unique usernames like `Anna123`.
- Future search/contact flows may use Amoria ID, but this release block does not add ID search, friend requests, followers, or a public feed.
- User-facing cards should prefer `profile.displayName`, then a stored real display-name snapshot, then the neutral Amoria user fallback. They must not show email or generated `nick.*` values as the primary identity.
- Profile photos must upload to Firebase Storage; local device `photoUri` values must not be used as shared profile media.
- The release avatar upload path is `users/{uid}/profile/avatar.jpg` and the Firestore profile stores the resulting HTTPS `avatarUrl`.
- Avatar selection shows a local preview before upload; Android crop/editing is disabled for release stability on BlueStacks and physical Android devices.
- Chats, DM context, Announcements, and Nearby should render `avatarUrl` when present and use a neutral initials placeholder when not.
- Peer profiles show displayName, avatar, Amoria ID, source context, and shared history only when a real source session is available.
- Announcement cover photos and user profile photos are separate media fields and must not be mixed.
- Firebase Storage rules for profile photos and announcement photos must be reviewed before public release.
- Storage rules must require authenticated image uploads by the owning user and deny unknown shared-media paths.

## Firebase Release Requirements

- Local rules files are part of the release baseline: `firestore.rules`, `storage.rules`, and `firebase.json`.
- Firestore index config is part of the release baseline: `firestore.indexes.json` must be deployed or created in Firebase Console before device-pass.
- Firebase rules must be deployed before public testing or release; the app must not depend on `allow read, write: if request.auth != null` as the final security posture.
- Device-pass requires deployed Firestore indexes. Missing composite indexes show up as `failed-precondition` query errors at runtime.
- Together, Nearby, Announcements, and Chats rely on Firestore indexes: Together matching and Nearby quick status require checked-in composite indexes, while current Announcements, Chats, play history, reports, and blocks rely on automatic single-field indexes unless their query shapes change.
- Firestore rules use default deny and authenticated access for app data.
- Storage rules use default deny, authenticated reads, owner-only writes, image content types, and size limits for profile/gallery/announcement images.
- `nearbyPosts` rules are required for shared quick statuses and Nearby-to-Chats handoff.
- Current intentional rule relaxations:
  - `playQueue` still supports client-side matching and therefore allows authenticated queue-entry reads plus a narrow candidate update from `waiting` to `matched` when the same transaction creates a participant `playSessions/{sessionId}` document. This is intentionally limited to release activities `draw` and `color_mood`.
  - `playSessions` still supports client-driven collaborative session updates for drawing, color mood, reveal, and legacy turn state.
- Legacy/non-release denied paths:
  - `rooms` and its subcollections are explicitly denied to clients because Rooms are not in the current release UI and the old membership model is not release-ready.
  - `presence` is explicitly denied to clients because map-presence is not part of the current release UI.
- Firebase Console must be checked before public release: Firestore rules deployed, Storage rules deployed, Email/password auth enabled, Firestore database in `eur3`, Storage bucket enabled, and required indexes created.

## Removed From Release UI

- Rooms
- map presence / people-on-map UI
- Settings people-on-map toggles
- Connections as bottom tab
- internal Nearby segments
- `daily_prompt` and `chain_draw` as release launch paths

## Device-Pass Checklist

- Verify only four bottom tabs are visible: Together / Вместе, Nearby / Рядом, Announcements / Объявления, Chats / Чаты.
- Verify Rooms is not registered as an active release navigation route and no CTA opens Rooms from Together, Nearby, Announcements, Chats, or the drawer.
- Verify the old Nearby Rooms promo component is not present in active UI and no `openRooms` helper is exported from release navigation helpers.
- Do not test Rooms in the current device-pass; it is outside the release UI.
- Verify Settings exposes only the Nearby location toggle and no map people / show-me-on-map controls.
- Verify Connections is not visible as a bottom tab or main release section.
- Verify Chats / Чаты is the user-facing label for the personal conversations tab; Inbox remains an internal route name only.
- Verify Together launch paths are limited to `draw` and `color_mood`.
- Verify legacy `daily_prompt` and `chain_draw` sessions, if old data exists, render as saved shared drawing history rather than new release modes.
- Verify empty/error states route only to release tabs: Together, Nearby, Announcements, and Chats.

## Important Release Honesty Notes

- No demo/stub/QA/seed paths in product UI.
- Announcements use Firestore as the release source of truth. AsyncStorage must not be used as the product announcement board.
- Announcement photo upload requires Firebase Storage enabled and verified before release.
- Profile avatar upload requires Firebase Storage enabled and verified before public release.
- Firestore and Storage rules must be deployed from the local baseline before public testing/release.
- Announcement moderation/report/block foundations are backed by Firestore, not AsyncStorage.
- Chats must become the single place for conversations from Together, Announcements and Nearby.
- Chats surface connection/story context inside each conversation when the real source data is available.
- Nearby quick status should open chats when real nearby user identity is available.
- Rooms is not part of the current release UI. The old `RoomsScreen` code can remain isolated, but it must not be registered in active release navigation.
- Before returning Rooms later, reintroduce separate Rooms UX, privacy copy, navigation entry points, and Firestore rules intentionally.
