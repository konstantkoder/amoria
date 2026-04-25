# Amoria Release Status

## Active product surface

- Tabs: `Together`, `Nearby`, `Announcements`, `Inbox` user-facing as `Chats`
- Nearby: quick shared nearby statuses only
- Product screens: `CreateAnnouncement`, `AnnouncementDetail`, `PlayMatch`, `PlayCanvas`, `PlayColorMood`, `PlayResult`, `PlayHistory`, `PlaySessionDetail`, `DMChat`, `Profile`, `Settings`, `PrivacyPolicy`, `LocationInfo`
- Profile subflow still includes editing screens that support the live profile path: `EditProfile`, `PhotoManager`, `FlirtSettings`

## Removed or isolated from the release path

- Demo / stub / QA entry points from earlier reset work remain removed from active UI
- Rooms remains technical code only and is not part of the current release UI
- Legacy DM mirror write into the old `dm/.../messages` collection is removed; the app now uses only `dmThreads/.../messages`
- Dead files removed from the active codebase:
  - `src/services/icebreakers.ts`
  - `src/components/VoiceIntroModal.tsx`
  - `src/components/NeonBorder.tsx`
- Dead `icebreaker.*` and `voiceIntro.*` locale keys were removed from the whole project locale set
- Unused `DMChat` back target `together` is removed from route params

## Current problem zones before a full device pass

- Firebase-backed live flows still depend on real auth, Firestore availability, and production-safe rules
- Final native identifiers are still not settled in Expo config: Android package is placeholder-like, and iOS bundle identifier is not declared here
- Secondary locales still need a final product-language review, but dead keys from removed features no longer stay in the locale set
- Settings / profile still carry older option groups like `18+` and `mystery mode`; they are live product settings, but they still need a stricter product decision if scope is reduced further

## Next 3–5 tasks before honest release testing

1. Run a full signed-in device pass through auth, Together, Nearby, Announcements, Chats, and DM.
2. Validate Firestore rules and production behavior for `nearbyPosts`, `playQueue`, `playSessions`, `dmThreads`, and `rooms`.
3. Lock final Android / iOS app identifiers and do one clean EAS build sanity pass.
4. Review profile/settings scope and decide whether any remaining non-core toggles should stay in the first release.
5. Sweep active crash/error logging on device so the next fixes target real release failures only.
