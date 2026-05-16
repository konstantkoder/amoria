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
- After `ADMIN-OPS-02`, reproduce the bug again and inspect `GET /admin/client-errors`. The profile upload report should show `screen=PhotoManagerScreen`, `action=uploadProfilePhoto`, and a step such as `putUpload` if the direct object storage upload fails before complete.

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

## Admin/Ops status

`ADMIN-OPS-01` server foundation has been implemented on `backend/standalone-foundation`:

- Admin users are linked to existing real users through `admin_users.user_id`.
- Required roles are `owner`, `support`, `moderator`, and `ops`.
- `/admin/*` routes require normal backend auth plus active admin membership.
- Server-side role policy protects admin user search and audit-log reads.
- Audit log records admin user search and audit-log read actions with sanitized metadata.
- Explicit bootstrap command: `npm run admin:bootstrap`, using `ADMIN_BOOTSTRAP_AMORIA_IDS` or `ADMIN_BOOTSTRAP_USER_IDS`.

No fake admin users, fake admin UI, or mock release data were added.

`ADMIN-OPS-02` client error reporting foundation has been implemented:

- `POST /client/error-reports` accepts real mobile error reports with optional auth.
- `client_error_reports` stores safe redacted error reports.
- `GET /admin/client-errors` exposes the protected admin error feed to owner/support/ops.
- Admin reads write audit action `admin.clientErrors.read`.
- Mobile profile photo and avatar upload failures now report step-level diagnostics without tokens, full local paths, or full signed upload URLs.

## Next big epic

Continue the full `ADMIN/OPS` release module.

## Remaining blockers before ADMIN-OPS-03

- Resolve the current profile photo upload failure between prepare and complete, including direct object storage `PUT` accessibility from the mobile device.
- Complete a real signed-in 2-device smoke pass; `TOGETHER-04` is checklist-only so far.
- Decide whether dedicated admin auth/session endpoints are needed beyond the existing user auth token plus active admin membership guard.
- Build the real admin web panel shell and user search experience.
- Add admin UI access to `/admin/client-errors`; until then use the protected API directly.
- Keep local tooling and archive files out of release commits.
