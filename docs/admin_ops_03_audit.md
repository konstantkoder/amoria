# ADMIN-OPS-03-FULL Audit

Updated: 2026-05-16

## Summary

`ADMIN-OPS-03-FULL` adds the full backend-first Admin/Ops Control Center foundation:

- real owner admin account creation script
- real React/Vite admin web console
- user search UI
- client error feed UI
- audit log UI
- reports/complaints admin API and UI
- media moderation admin API and UI
- ops health API and UI

No fake users, fake errors, fake reports, fake media, mock charts, Firebase fallback, or local-only success were added.

## Endpoints Added

Owner bootstrap script:

- `npm run admin:create-owner`

Admin API:

- `GET /admin/ops/health`
- `GET /admin/reports?status=&targetType=&reporterAmoriaId=&targetOwnerAmoriaId=&limit=`
- `GET /admin/reports/:id`
- `POST /admin/reports/:id/actions`
- `GET /admin/media?ownerAmoriaId=&type=&limit=`
- `GET /admin/media/:mediaId?reason=`
- `POST /admin/media/:mediaId/decision`

Existing endpoints consumed by admin web:

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /admin/me`
- `GET /admin/health`
- `GET /admin/users`
- `GET /admin/client-errors`
- `GET /admin/audit-log`

## Screens Implemented

Admin web path:

```text
F:\Dev\AmoriaServer\admin-web
```

Screens:

- Login
- Dashboard
- Users
- Client Errors
- Reports / Complaints
- Media Moderation
- Audit Log
- Ops Health
- Bootstrap / First Owner Guide
- Forbidden / Not Authorized

All data is loaded from backend endpoints. Empty views represent empty backend results.

## Roles

- `owner`: all current admin web/API capabilities.
- `support`: user search, client errors, report read, support notes, media metadata read, ops health.
- `moderator`: reports moderation and media moderation.
- `ops`: client errors and ops health.

Server-side role checks remain authoritative. Admin web role display is informational only.

## Bootstrap Owner Method

Command:

```text
npm run admin:create-owner
```

Env:

- `ADMIN_OWNER_EMAIL`
- `ADMIN_OWNER_PASSWORD`
- `ADMIN_OWNER_DISPLAY_NAME`

If no password is provided, a strong local password is generated and saved outside the repo:

```text
F:\Dev\AmoriaAdminSecrets\owner-admin-YYYY-MM-DD_HH-mm-ss.txt
```

The script creates or reuses a normal backend `users` row, keeps login compatible with `/auth/login`, ensures `admin_users` is active, and assigns `owner`.

## Security Model

- Admin web login must pass `/auth/login`.
- Admin web entry must pass `/admin/me`.
- Every `/admin/*` endpoint remains protected by backend auth plus active admin guard.
- Role policy is enforced server-side.
- Report actions and media decisions write `admin_audit_log`.
- Report/media list and detail reads write audit entries.
- Locked gallery media detail requires owner/moderator plus reason and writes `admin.media.locked.view`.
- No password hashes, refresh tokens, access tokens, S3 secrets, raw env, locked gallery passwords, or full signed upload URLs are returned.

## DB / Migrations

Server migration:

- `src/db/migrations/0013_admin_ops_console_foundation.sql`

Changes:

- adds `safety_reports.status`
- adds `safety_reports.updated_at`
- adds `report_review_actions`
- adds `media_moderation_reviews`
- adds report/media moderation indexes and check constraints

## Tests Added

Backend test file:

- `tests/admin-ops-console.test.ts`

Coverage:

- owner bootstrap creates a real password-backed user
- bootstrap does not duplicate an existing user
- created owner credentials use normal auth password hashing and can access `/admin/me`
- non-admin cannot access new admin APIs
- reports role policy
- report action writes review action and audit log
- media role policy
- media decision writes review and audit log
- locked media requires elevated role and reason
- admin endpoints avoid password/hash/token/secret exposure

## Remaining For Final Admin Smoke Pass

- Run `npm run admin:create-owner` against the real local/dev database.
- Start backend and admin web together.
- Log in as the generated owner account.
- Reproduce the profile photo upload bug and confirm it appears in Client Errors.
- Verify Reports and Media screens against real user-generated reports/media.
- Add object storage live health check to `/admin/ops/health`.
- Add rate limit / anti-spam visibility endpoints and UI.
- Add admin users/roles management UI when policy is finalized.
