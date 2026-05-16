# Amoria Release Decisions

Updated: 2026-05-16

## Release direction

- Amoria is moving toward release.
- No temporary release-breaking shortcuts are allowed.
- No mock/stub/fake data.
- No Firebase fallback.
- No local-only success.
- Backend-first source of truth.

## Identity

- `displayName` is not unique.
- Two users named Anna can exist at the same time.
- The unique public identifier is Amoria ID.
- Internal `userId` is the main technical ID.
- Email is for auth and admin support only. It is not a public display name.

## Product scope decisions

- Locked gallery remains.
- Nearby remains.
- Announcements need a later decision: keep, hide, or remove.
- Rooms, people-on-map, and map presence are not part of the current release UI.
- Admin/Ops is required for release.
- Admin/Ops owner account must be a separate real backend auth account, not an existing mobile test account.
- Admin web must pass backend `/admin/me`; client-side role checks are not security.

## Local tooling

- Local bat files are development tooling only.
- Local bat files are not product logic.
- Local archive/log files must not be committed to release branches.
