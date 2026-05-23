# Bugfix: Draw Prompts, Peer Media, Queue

Updated: 2026-05-23

## Draw Prompt Localization

Backend sessions now include `promptKey` for draw prompts. Mobile maps that key to localized strings and uses a small compatibility bridge from known old English `promptText` values to prompt keys.

RU result: the draw flow shows localized Russian prompt text instead of raw English text such as `Draw two characters meeting for the first time.`

Template labels with `{name}` and `{count}` now have real i18n keys so the translation layer interpolates them instead of showing literal placeholders.

## Peer Media Visibility

Peer profile media uses current backend public media URLs:

- avatar: `avatarUrl` from owned avatar media;
- public photos: `photos[]` with `/media/public/:mediaId`;
- locked gallery: summary only before unlock.

Closed test policy keeps pending review public media visible for smoke verification. Public beta should move to approved-only visibility when real moderation is configured/staffed.

`UserProfileScreen` reports avatar/public photo load failures with safe metadata only: whether an avatar URL exists, photo count, and safe `mediaId` where available.

## Together Queue Admin Action

Admin Web now shows stale waiting rows and lets owner/ops cancel a `waiting` entry with a required reason. The backend writes `admin.togetherQueue.cancel` and never exposes coordinates.
