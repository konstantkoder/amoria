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

`ADMIN-OPS-03-FULL` Admin/Ops Control Center foundation has been implemented:

- Real owner admin account creation command: `npm run admin:create-owner`.
- Generated local owner credentials, when needed, are saved outside the repo under `F:\Dev\AmoriaAdminSecrets`.
- Real admin web console lives in `F:\Dev\AmoriaServer\admin-web`.
- Admin web uses `/auth/login`, `/auth/refresh`, `/auth/logout`, and `/admin/me`; it does not bypass backend role checks.
- Implemented screens: Login, Dashboard, Users, Client Errors, Reports, Media Moderation, Audit Log, Ops Health, Bootstrap, and Forbidden.
- Added reports/complaints admin APIs and `report_review_actions`.
- Added media moderation admin APIs and `media_moderation_reviews`.
- Added `GET /admin/ops/health` with real database connectivity status.
- Locked gallery media detail requires owner/moderator plus reason and writes audit.

## Next big epic

Continue Admin/Ops hardening and final smoke pass.

## Remaining blockers before ADMIN-OPS-04 / admin smoke pass

- Resolve the current profile photo upload failure between prepare and complete, including direct object storage `PUT` accessibility from the mobile device.
- Complete a real signed-in 2-device smoke pass; `TOGETHER-04` is checklist-only so far.
- Run `npm run admin:create-owner` against the real local/dev database and keep credentials out of Git.
- Start backend + admin web and complete a real owner login smoke pass.
- Verify Client Errors after reproducing the profile photo upload bug.
- Verify Reports and Media Moderation against real user-generated reports/media.
- Add object storage live health check to `/admin/ops/health`.
- Add rate limit / anti-spam visibility endpoints and UI.
- Decide whether dedicated admin auth/session endpoints are needed beyond the existing user auth token plus active admin membership guard.
- Keep local tooling and archive files out of release commits.
