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

## Removed From Release UI

- Rooms
- Connections as bottom tab
- internal Nearby segments

## Important Release Honesty Notes

- No demo/stub/QA/seed paths in product UI.
- Announcements must be moved to real shared storage / backend model before release. The current implementation uses local AsyncStorage in `src/services/nearbyAnnouncements.ts`, so it is not yet a shared multi-user release model.
- Chats must become the single place for conversations from Together, Announcements and Nearby.
- Chats should surface connection/story context inside each conversation.
- Rooms is not part of the current release UI.
