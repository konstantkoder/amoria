# Amoria Release Status

## Active product surface

- Tabs: `Together`, `Nearby`, `Announcements`, `Inbox` user-facing as `Chats`
- Nearby: quick shared nearby statuses only
- Product screens: `CreateAnnouncement`, `AnnouncementDetail`, `PlayMatch`, `PlayCanvas`, `PlayColorMood`, `PlayResult`, `PlayHistory`, `PlaySessionDetail`, `DMChat`, `Profile`, `Settings`, `PrivacyPolicy`, `LocationInfo`
- Profile subflow still includes editing screens that support the live profile path: `EditProfile`, `PhotoManager`, `FlirtSettings`

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
- Together `color_mood` is now a real backend-backed scenario: lobby starts a `color_mood` queue, the session saves `palette` events through Together events, result/reveal/history/detail read backend session/events, and open chat context keeps `activity: color_mood`
- Final native identifiers are still not settled in Expo config: Android package is placeholder-like, and iOS bundle identifier is not declared here
- Secondary locales still need a final product-language review, but dead keys from removed features no longer stay in the locale set
- Settings / profile still carry older option groups like `18+` and `mystery mode`; they are live product settings, but they still need a stricter product decision if scope is reduced further

## Remaining Together blockers

- No remaining blocker is known for backend-persistent draw replay in this block.
- No remaining blocker is known for the backend-backed `color_mood` Together flow in this block.
- A full signed-in device pass against the real backend is still required before release sign-off.

## Next 3–5 tasks before honest release testing

1. Run a full signed-in device pass through auth, Together, Nearby, Announcements, Chats, and DM.
2. Validate backend production behavior for Together, Nearby, Announcements, Chats, reports, blocks, and media.
3. Lock final Android / iOS app identifiers and do one clean EAS build sanity pass.
4. Review profile/settings scope and decide whether any remaining non-core toggles should stay in the first release.
5. Sweep active crash/error logging on device so the next fixes target real release failures only.
