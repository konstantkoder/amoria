# ADMIN-OPS-01 Audit

Updated: 2026-05-16

## Admin access model chosen

Admin/Ops access is backend-first and linked to real existing Amoria users.

- Admin authenticates with the normal backend auth token.
- Backend checks that the authenticated `users.id` has an active `admin_users` row.
- Backend loads roles from `admin_user_roles`.
- Public users without active admin membership cannot access `/admin/*`.
- Role checks are server-side. Client-side checks are never security.

## Tables added

Server migration: `src/db/migrations/0011_admin_ops_foundation.sql`

- `admin_users`
- `admin_roles`
- `admin_user_roles`
- `admin_audit_log`

Required role keys are seeded by migration/bootstrap:

- `owner`
- `support`
- `moderator`
- `ops`

## Endpoints added

- `GET /admin/health`
- `GET /admin/me`
- `GET /admin/users?amoriaId=...&q=...&limit=...`
- `GET /admin/audit-log?limit=...`

All endpoints require backend auth and active admin membership.

## Bootstrap method

Explicit command:

```bash
npm run admin:bootstrap
```

Inputs:

- `ADMIN_BOOTSTRAP_AMORIA_IDS`
- `ADMIN_BOOTSTRAP_USER_IDS`

Both accept comma-separated existing real users. Bootstrap does not create users and fails if the referenced user does not exist. It ensures the required role rows and assigns `owner` to each referenced user.

## Role policy

- `owner`: all current Admin/Ops endpoints, including audit log reads.
- `support`: admin health, admin me, user search.
- `moderator`: admin health, admin me, user search.
- `ops`: admin health and admin me in `ADMIN-OPS-01`; broader ops health/rate-limit visibility is planned for `ADMIN-OPS-06`.
- `GET /admin/audit-log`: `owner` only for now.

## Audit log behavior

Audit entries are written for:

- `admin.users.search`
- `admin.auditLog.read`

Audit metadata is sanitized and truncated. Passwords, tokens, secrets, auth headers, cookies, private keys, access keys, and locked-gallery password-like keys are redacted. Audit log entries must not store access tokens, refresh tokens, passwords, locked-gallery passwords, S3 secrets, JWT secrets, or raw `.env` values.

## Tests added

Server test file:

- `tests/admin-access.test.ts`

Coverage:

- unauthenticated request cannot access `/admin/health`
- normal authenticated user cannot access `/admin/health`
- active admin can access `/admin/health`
- admin roles are returned by `/admin/me`
- admin user search by Amoria ID returns safe user data
- user search does not expose `passwordHash` or refresh tokens
- disabled admin cannot access `/admin/health`
- user search writes audit log
- non-owner cannot access `/admin/audit-log`
- owner can access `/admin/audit-log`

## Remaining blockers for ADMIN-OPS-02

- Add real client error reporting DB/API with redaction.
- Add mobile client integration for runtime/API/upload error reporting.
- Define retention and privacy rules for client error metadata.
- Add admin read endpoints for client error reports after ingestion exists.
- Keep Admin/Ops backend-first; do not add fake admin UI or fake error data.
