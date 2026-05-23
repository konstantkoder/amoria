# BUGFIX-UX-01 Audit

Date: 2026-05-20

## What Was Fixed

- Superseded: Together no longer includes `color_mood`; it was removed before public release.
- Active new-session UI starts `draw` and can continue to `story_sparks` after mutual choice.
- DM chat no longer silently does nothing when `peerId` is missing. It attempts to recover the peer through the real inbox thread list by `threadId`.
- If DM peer recovery fails, the user sees a clear error and Admin Client Errors receives a safe report.
- Profile now has clear tappable entrypoints for "About me" and "Mood" that open `EditProfile`.
- `EditProfile` accepts an optional focus param for `about` or `mood` and scrolls/focuses the requested field when safe.
- Client error reporting is fire-and-forget and now covers selected UI dead-action/navigation failures.

## Files Changed

- `src/screens/PlayLobbyScreen.tsx`
- `src/screens/PlayMatchScreen.tsx`
- `src/screens/DMChatScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/EditProfileScreen.tsx`
- `src/navigation/appRoutes.ts`
- `src/services/api/chatApi.ts`
- `src/services/api/clientErrorsApi.ts`
- `src/i18n/locales/ru.json`
- `src/i18n/locales/en.json`
- `src/i18n/locales/hr.json`
- `docs/release_control_center.md`
- `docs/admin_ops_architecture.md`
- `docs/bugfix_ux_01_audit.md`

## Manual Verification

1. Together -> removed color_mood guard
   - Open the Together tab in Russian.
   - Confirm the removed color_mood feature is not visible as an active start CTA.
   - Confirm a forced old local/dev row shows the unsupported-old-session fallback.

2. DMChat -> peer profile
   - Open a DM from Together result/history/inbox and tap the header/avatar/name or peer card.
   - Confirm `UserProfile` opens for the real opponent.
   - Reproduce a missing `peerId` route param with a valid `threadId`.
   - Confirm the app tries inbox hydration and either opens the real peer profile or shows a visible error.

3. Profile -> About me / Mood
   - Open Profile.
   - Tap "О себе"; confirm `EditProfile` opens and focuses/scrolls to the About field.
   - Tap "Настроение"; confirm `EditProfile` opens and scrolls to mood options.
   - Save real backend-backed changes and confirm they remain after refresh/reopen.

4. Admin Client Errors for failed UI actions
   - Trigger invalid Together activity or failed navigation in a controlled dev build.
   - Trigger DM profile open with missing peer data that cannot be hydrated.
   - Confirm Admin Client Errors shows reports with `screen`, `action`, and `step` such as `invalidActivity`, `missingPeerId`, `hydratePeerFailed`, or `failedOpenUserProfile`.

## Remaining Blockers

- MEDIA-01 profile photo upload is fixed in code and now includes crop/preview/confirm; real-device gallery smoke remains required.
- BUGFIX-TOGETHER-PROMPTS-I18N-EXAMPLES.
- Full RU locale cleanup.
- Together/Gallery real smoke pass.
