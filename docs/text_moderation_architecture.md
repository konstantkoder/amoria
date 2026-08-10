# Text moderation architecture

## Release write-path inventory

The release has two persisted free-form message writers. Both use `messages`, but they previously
had separate repositories and neither had an effective moderation state. All message writers now
call the common `MessageSafetyService` before persistence and publish realtime events only when the
durable effective state is `visible`.

| Source | Route | Service | DB table | Realtime event | Current validation | Block check | Automatic moderation required? | Admin reviewable? | Reportable? |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Direct/private chat (including threads opened from Announcement, Nearby, or Together) | `POST /threads/:id/messages` | `chat.service.sendMessage` | `messages` + `message_moderation_states` | `thread.message` | trim, 1..2000 chars, common text-safety validation | yes, both directions before safety/persistence | yes: abuse guard and local model policy | yes | yes |
| Direct/private chat history | `GET /threads/:id/messages` | `chat.service.getThreadMessages` | same | none | membership | blocked thread excluded; membership required | state is enforced during read | n/a | message IDs are reportable |
| Nearby activity room chat | `POST /nearby/rooms/:roomId/messages` | `nearby-room-chat.service.sendNearbyRoomMessage` | `messages` + `message_moderation_states` | `thread.message` | trim, 1..2000 chars, common text-safety validation | active room membership; blocked senders are filtered per viewer and realtime audience | yes: same abuse guard and local model policy | yes | yes |
| Nearby room history | `GET /nearby/rooms/:roomId/messages` | `nearby-room-chat.service.getNearbyRoomMessages` | same | none | active room membership and safe room/thread link | blocked senders filtered for viewer | state is enforced during read | n/a | message IDs are reportable |
| Together drawing strokes | `POST /together/sessions/:id/events` (`stroke_batch`) | `together.service.createEvent` / turn-based service | `together_events` | `together.event` | bounded JSON plus activity-specific numeric stroke validation | session access and lifecycle block/report policy | no: machine drawing data, not text | operational Together review only | session is reportable |
| Together Story Sparks turn | same route (`story_choice`) | Together turn-based service | `together_events` | `together.event` | server-owned `packId`, `roundId`, `cardId`, and integer index; no client prose | session access and lifecycle block/report policy | **NOT_APPLICABLE**: users select server-authored cards; no free-form text | operational Together review only | session is reportable |
| Together chat after mutual reveal | direct-chat route above with `source=together` | `chat.service.sendMessage` | `messages` + moderation state | `thread.message` | direct-chat policy above | yes | yes, through the direct-chat path | yes | yes |
| Announcement title/description/category/place | `POST /announcements` | `announcements.service.createAnnouncement` | `announcements` | none | field lengths plus common deterministic public-UGC validation | author only; interaction with author checks both-way block | deterministic public-UGC safety; no message model in this release | existing report queue | announcement |
| Nearby legacy status text | `POST /nearby/statuses` | `nearby.service.createStatus` | `nearby_statuses` | none | 1..280 chars plus common deterministic public-UGC validation | viewer feed excludes blocked pairs | deterministic public-UGC safety | existing report queue | Nearby/user report context |
| Nearby profile status | `PUT /nearby/me/visibility`, `PATCH /nearby/me/status` | `nearby.service` | `nearby_profile_visibility` | none | length plus common deterministic public-UGC validation | viewer feed excludes blocked pairs | deterministic public-UGC safety | via user report | user |
| Profile display name/about | `POST /auth/register`, `PATCH /users/me` | `auth.service`, `users.service` | `users` | none | existing lengths plus common deterministic public-UGC validation | public-profile reads enforce block policy | deterministic public-UGC safety | via user report | user |
| Safety report reason/comment | `POST /safety/reports` | `safety.service.createReport` | `safety_reports`; message reports append `message_moderation_reviews` | none | bounded reason/comment plus common private-admin-text validation | reporter must be able to access a reported message and cannot spoof its sender/context | no classifier; never sent to another normal user | yes | n/a |
| Admin Nearby room title/description/type title | `/admin/nearby-rooms*` | admin Nearby services | `nearby_rooms`, `nearby_room_types` | none | schemas; authenticated admin-authored data | admin RBAC | no: trusted administrative copy | audited admin view | no |
| Client error report message | `POST /client/errors` | `client-errors.service` | `client_error_reports` | none | bounded structured diagnostics | authenticated user | no: diagnostic data, not user-to-user content | existing support workflow | no |

Text write path count is **10 logical paths**: direct messages (including context-created and
post-Together chat), Nearby room messages, Together drawing events, Together controlled story
choices, announcements, legacy Nearby status, Nearby profile status, profile display/about,
safety-report text, and client-error report text. Read paths and admin-authored room copy remain in
the matrix because they are important leak/review boundaries, but they are not counted again.

## Required ordering

1. Authenticate and validate membership/source context.
2. Enforce pair/block policy.
3. Resolve an existing `(thread, sender, clientMessageId)` before counting abuse or running ML.
4. Run deterministic validation and the PostgreSQL-backed bounded abuse guard.
5. Run the local model where configured and apply the centralized product policy.
6. Persist the message, effective state, and append-only evidence in one transaction.
7. Publish `thread.message` and inbox invalidation only for a newly created `visible` message.

Retries return the original durable message result and never add another abuse event, model run,
message, history record, or realtime publication.

## Read rules

- Recipients and room peers receive only `visible` messages.
- Senders may see their own `held` or `needs_review` message and its truthful state.
- `restricted` and `removed` bodies are replaced with an empty safe body for the sender and are not
  returned to other normal users.
- Inbox preview and unread count use visible messages only.
- Admin queue endpoints return metadata only. Only owner/moderator detail endpoints return one
  selected message body, and every such read is audited without copying the body into audit data.

## Near-duplicate algorithm and bounds

The guard computes an abuse-only normalized form (Unicode NFKC, zero-width removal, lower-case,
URL placeholders, digit placeholders, collapsed punctuation/whitespace) without changing the
canonical message. An HMAC-SHA-256 exact fingerprint and 64-bit character-trigram SimHash are
stored. At most 24 prior rows for the sender in the last ten minutes are compared; a Hamming
distance of at most 6 is a near duplicate. This is O(24) per attempt, never a global O(N squared)
scan. Abuse rows expire after 48 hours and a bounded cleanup deletes expired rows; moderation and
admin audit history are not part of that cleanup.
