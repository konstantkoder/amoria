# BUGFIX-UX-02 Media/Nav/Profile Audit

Updated: 2026-05-20

## What Was Fixed

- Peer profile media now uses backend-owned public media URLs instead of stale stored S3/tunnel URLs.
- Public profile avatar URLs are materialized from the current `media_files` row and returned as `PUBLIC_MEDIA_URL/public/:mediaId`.
- Public profile photos use the same stable media route and still exclude locked gallery photos before unlock.
- `UserProfileScreen` shows a visible failed-photo state and reports image load failures to Admin Client Errors.
- Profile goal and mood badges are clickable and open `EditProfileScreen` with `focus="goal"` or `focus="mood"`. Existing "About me" entrypoint remains backend-backed.
- Together active/waiting screens now have an explicit return to the main tab UI:
  - `PlayCanvasScreen`
  - `PlayColorMoodScreen`
  - `PlayMatchScreen`
- Manual Together exit calls the real leave/cancel API when there is an active session/queue, then returns to the Together tab. It does not create fake finish, reveal, or chat success.

## Files Changed

Mobile:

- `src/components/UserAvatar.tsx`
- `src/navigation/appRoutes.ts`
- `src/screens/EditProfileScreen.tsx`
- `src/screens/PlayCanvasScreen.tsx`
- `src/screens/PlayColorMoodScreen.tsx`
- `src/screens/PlayMatchScreen.tsx`
- `src/screens/ProfileScreen.tsx`
- `src/screens/UserProfileScreen.tsx`
- `src/i18n/locales/en.json`
- `src/i18n/locales/hr.json`
- `src/i18n/locales/ru.json`

Server:

- `src/media/media-url.ts`
- `src/media/media.repo.ts`
- `src/media/media.routes.ts`
- `src/media/media.service.ts`
- `src/media/uploads.service.ts`
- `src/users/profile-gallery.service.ts`
- `src/users/users.service.ts`
- media/public-profile tests updated for the new URL contract

Docs:

- `docs/bugfix_ux_02_media_nav_profile.md`
- `docs/media_upload_architecture.md`
- `docs/release_control_center.md`
- `docs/admin_ops_architecture.md`

## Media URL Decision

Root cause: mobile-visible profile media URLs were persisted as absolute URLs derived from `S3_PUBLIC_BASE_URL`. When the public tunnel/domain changed, peer public profiles could still return dead `trycloudflare`, `localhost`, or internal object-storage URLs.

Fix: mobile-visible media now goes through the backend public media route:

- URL shape: `PUBLIC_MEDIA_URL/public/:mediaId`
- bytes source: `media_files.path` in object storage
- avatar/public photos in public profile are returned from current media IDs, not stale absolute DB URLs
- public profile does not expose locked gallery photos before unlock

## Manual Smoke Checklist

1. Together -> Mood palette
   - Open Together.
   - Start `color_mood`.
   - Verify the session runs normally.

2. Peer avatar/public photos
   - Upload a real avatar/public photo on physical phone.
   - Open that user from another device/emulator through chat/profile.
   - Verify avatar/public photos load.
   - Confirm public profile response does not contain `file://`, `localhost`, `127.0.0.1`, `minio:9000`, or stale tunnel URLs.
   - Confirm locked photos are not present before unlock.

3. Profile goal/mood/about editing
   - Open own Profile.
   - Tap the goal badge, including "Goal not set" state.
   - Verify Edit Profile opens focused on goal.
   - Tap the mood badge, including "Mood not set" state.
   - Verify Edit Profile opens focused on mood.
   - Tap "About me" and verify it opens editing.
   - Save changes and verify they remain after refresh/reopen.

4. Together manual exit
   - Start a draw session.
   - Tap "Back to main tabs" / localized equivalent.
   - Verify the app returns to the main tab UI/Together tab and does not open result/chat.
   - Repeat in color_mood.
   - Repeat while PlayMatch is still waiting in queue.

5. Admin Client Errors
   - Force a peer avatar/public photo image load failure and verify:
     - `screen=UserProfileScreen`
     - `action=loadPeerMedia`
     - `step=avatarLoadFailed` or `publicPhotoLoadFailed`
   - Force Together exit leave/cancel/navigation failure and verify:
     - `action=exitTogetherSession`
     - `step=leaveFailed`, `cancelQueueFailed`, or `navigationFailed`

## Checks

- Mobile: `npx tsc --noEmit`
- Server: `npm run typecheck`
- Server: `npm test`

## Remaining Blockers

- MEDIA-01 profile photo upload direct PUT/complete smoke if device object-storage access is still failing.
- BUGFIX-TOGETHER-PROMPTS-I18N-EXAMPLES.
- Full RU locale cleanup.
- Full real-device Together/Gallery smoke pass.
