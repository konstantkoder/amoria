# Amoria Release Control Center

Updated: 2026-05-16

## Branches

- Mobile branch: `migration/remove-firebase-foundation`
- Server branch: `backend/standalone-foundation`

## Hard release rule

- No mock/stub/fake data.
- No Firebase fallback.
- No local-only success.
- Backend-first source of truth.

## Main local start bat

- `F:\Dev\START_AMORIA_DEV.bat`

This launcher is local dev tooling only and is not product logic.

## Current known live bug

- Avatar upload works.
- Profile photo upload reaches `POST /media/uploads/prepare` with HTTP 200.
- `POST /media/uploads/:id/complete` is not observed.
- Likely failure is between prepare and complete.
- Likely direct `PUT` to object storage `uploadUrl` / MinIO accessibility issue.

## Completed blocks

- `TOGETHER-01` backend replay.
- `TOGETHER-02` color_mood.
- `TOGETHER-03` lifecycle hardening.
- `TOGETHER-04` smoke checklist only, real 2-device test not done.
- `GALLERY-01` audit/hardening.
- `GALLERY-02` smoke checklist + preview failure fix.

## Identity rule verification

Checked on 2026-05-16:

- Server `users` table has `id`, `email`, `displayName`, and `amoriaId`.
- `amoriaId` is unique.
- `displayName` is not unique.
- Public profile service/schema exposes `displayName` and `amoriaId`, not `email`.
- Mobile API/profile types include `amoriaId`.
- No current mobile UI location was found using `email` as the public display name. Email appears in auth/login flows and self-user/auth DTOs only.

## Local tooling status

See `docs/local_tooling_inventory.md`.

Preserved local log tools:

- `F:\Dev\AMORIA_CLEAR_TEST_LOGS.bat`
- `F:\Dev\AMORIA_COLLECT_TEST_LOGS.bat`
- `F:\Dev\amoria_collect_logs.ps1`

Archived local files:

- `F:\Dev\AmoriaLocalArchive\2026-05-16_13-43-38`

## Next big epic

Full `ADMIN/OPS` release module.

## Remaining blockers before ADMIN-OPS-01

- Resolve the current profile photo upload failure between prepare and complete, including direct object storage `PUT` accessibility from the mobile device.
- Complete a real signed-in 2-device smoke pass; `TOGETHER-04` is checklist-only so far.
- Define and implement admin access, admin roles, and audit logging as backend-first release infrastructure.
- Add real client error reporting before relying on admin/ops diagnostics.
- Keep local tooling and archive files out of release commits.
