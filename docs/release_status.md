# Amoria Release Status

## Active product surface

- Tabs: `Together`, `Nearby`, `Announcements`, `Inbox` user-facing as `Chats`
- Nearby: quick shared nearby statuses only
- Product screens: `CreateAnnouncement`, `AnnouncementDetail`, `PlayMatch`, `PlayCanvas`, `PlayResult`, `PlayHistory`, `PlaySessionDetail`, `DMChat`, `Profile`, `Settings`, `PrivacyPolicy`, `LocationInfo`
- Removed pre-release screen: `PlayColorMood` is no longer routeable.
- Profile subflow includes editing screens that support the live profile path: `EditProfile`, `PhotoManager`

## Removed or isolated from the release path

- Demo / stub / QA entry points from earlier reset work remain removed from active UI
- Rooms has been removed from the mobile code path and is not part of the current release UI
- Legacy mobile DM storage has been removed; the app now uses backend chat APIs and WebSocket updates
- Dead files removed from the active codebase:
  - `src/services/icebreakers.ts`
  - `src/components/VoiceIntroModal.tsx`
  - `src/components/NeonBorder.tsx`
- Dead `icebreaker.*` and `voiceIntro.*` locale keys were removed from the whole project locale set
- Unused `DMChat` back target `together` is removed from route params

## Current problem zones before a full device pass

- Backend-backed live flows still depend on real auth, API availability, and production-safe server behavior
- Together replay for completed draw sessions is now backend-persistent through the server `GET /together/sessions/:id/events` API; `PlaySessionDetail` restores replay from backend events after app restart
- Together `color_mood` was removed before public release: backend rejects new queue requests and mobile shows unsupported fallback for forced old local/dev rows.
- Together lifecycle is hardened for `draw` and `story_sparks`: backend guards membership/status for session, events, finish/leave/heartbeat/reveal/history; mutual `open/open` reuses one direct chat context; skip, blocked, abandoned, and cancelled states do not open chat; mobile result/detail screens recover pending reveal state through backend refresh if WebSocket updates are missed
- Profile media and locked gallery are backend-first for the release path: avatar/profile uploads go through backend media APIs, public profile responses expose public photos only, locked gallery unlock requires backend password verification, and owner gallery management uses backend state.
- Final native identifiers are still not settled in Expo config: Android package is placeholder-like, and iOS bundle identifier is not declared here
- Secondary locales still need a final product-language review, but dead keys from removed features no longer stay in the locale set
- The standalone legacy `18+` / `Flirt` toggle has been removed from active release UI. Real age handling is backend-first through private `birthDate`, safe `ageGroup`, and Together age preferences.
- `mystery mode` remains a live profile setting.

## Gallery / locked gallery status

- Locked photos are not exposed by public profile responses; only a locked-gallery summary count is returned when a password is set and locked photos exist.
- Locked gallery unlock remains password protected through backend verification; wrong passwords return safe errors without photo URLs.
- Block-aware visibility is enforced for public profile access and locked gallery unlock.
- Owner gallery management remains backend-backed for upload, public/locked moves, password set/reset, and delete.
- Profile upload completion now requires a checksum when a checksum was declared during prepare; another user's prepared upload cannot be completed by the caller.
- Mobile profile/gallery image uploads now reject unsupported shared-profile formats before starting backend upload; no local-only success path was added.

## Remaining Gallery blockers

- A real signed-in device pass for avatar upload, profile photo upload/delete/move, and locked gallery unlock is still required before release sign-off.
- Production object storage/CDN configuration must be verified against the same build used for release.

## Remaining Together blockers

- No remaining blocker is known for backend-persistent draw replay in this block.
- No remaining blocker is known for the removed `color_mood` guard in this block.
- No remaining blocker is known for Together lifecycle hardening in this block.
- A full two-device signed-in smoke pass against the real backend is still required before release sign-off.

## Next 3–5 tasks before honest release testing

1. Run a full signed-in device pass through auth, Together, Nearby, Announcements, Chats, and DM.
2. Validate backend production behavior for Together, Nearby, Announcements, Chats, reports, blocks, and media.
3. Lock final Android / iOS app identifiers and do one clean EAS build sanity pass.
4. Review profile/settings scope and decide whether any remaining non-core toggles should stay in the first release.
5. Sweep active crash/error logging on device so the next fixes target real release failures only.
