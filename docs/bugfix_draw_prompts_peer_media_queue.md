# Bugfix: Draw Prompts, Peer Media, Queue Actions

Updated: 2026-05-23

## Backend Prompt Contract

Together session DTOs now include `promptKey` alongside `promptText`.

- Mobile should localize draw prompts through `promptKey`.
- `promptText` remains fallback/debug text only.
- Result/history/detail can render the same localized prompt consistently.

## Peer Media Policy

The public profile endpoint returns current backend media URLs:

- `avatarUrl` is normalized to `/media/public/:mediaId` when the avatar belongs to the user.
- `photos[]` contains public profile gallery media only.
- stale local, tunnel, or internal MinIO URLs are not returned.
- locked gallery media stays hidden until the locked-gallery unlock flow.

Closed test policy: pending review media can be visible so testers can verify upload/profile flows. Public beta policy should switch to approved-only visibility once a real moderation provider or staffed manual queue is active.

## Queue Observability

Admin Web can cancel a stale `waiting` Together queue entry with a required reason. The action is audited and does not expose coordinates.
