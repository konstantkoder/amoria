# Admin/Ops Architecture

Updated: 2026-05-16

This is the plan for a full Admin/Ops release module. It is not a temporary mini-admin and must not rely on mock/stub/fake data, Firebase fallback, or local-only success.

## Goals

- Give operators a real backend-backed control center for user support, abuse handling, moderation, media safety, and operational health.
- Make user lookup and support actions reliable through Amoria ID and internal `userId`.
- Provide a durable audit trail for all admin actions.
- Surface release-critical errors and infrastructure health without exposing secrets.

## Admin access model

- Admin access is authenticated against the backend.
- Admin authorization is role-based and checked on every admin endpoint.
- Admin sessions use secure server-issued tokens with short lifetimes and refresh/revocation support.
- Admin UI cannot infer privileges locally; backend decisions are the source of truth.

## Admin roles / admin users

- `owner`: full operational access, role management, and sensitive audit review.
- `support`: user lookup, support notes, non-destructive account support actions.
- `moderator`: reports, complaints, moderation queue, media review, block/abuse views.
- `ops`: health, rate limit visibility, error reporting, service diagnostics.

Admin users must be stored separately from public profile data or explicitly flagged in a protected admin membership table. Public app users do not gain admin powers through client state.

## Client error reporting

- Mobile client reports real runtime/API/upload errors to backend.
- Reports include timestamp, app version/build, platform, route/screen context, authenticated `userId` when available, request correlation ID when available, safe error code/message, and redacted metadata.
- Reports must not include passwords, auth tokens, refresh tokens, private keys, raw `.env`, or full request bodies that may contain secrets.
- Admin UI supports search/filter by user, screen, error code, time window, and release build.

## Users search by Amoria ID

- Primary support lookup is Amoria ID.
- Admin can also search by internal `userId` and email for auth/support cases.
- Public-facing user identity in admin results shows `displayName` plus Amoria ID.
- Duplicate display names are expected and must not be treated as conflicts.

## Reports / complaints

- Users can report profiles, media, announcements, chats/messages, and other abuse contexts.
- Reports keep reporter, target, reason, free text, source object, status, assigned admin, and timestamps.
- Admin actions include triage, assign, request more info, warn, dismiss, restrict, suspend, or escalate.

## Moderation queue

- Queue is backend-backed and status-driven.
- Supports priority, assignment, SLA/time aging, reason filters, and source filters.
- Queue entries link to the affected user/content and the full audit trail.

## Media/photo moderation

- Admins can review avatar, public profile photos, and locked-gallery photo metadata/previews under strict privacy rules.
- Media review tracks source, owner, visibility, upload status, moderation status, reviewer, and decision reason.
- Destructive actions require explicit reason and audit log entry.

## Locked gallery safety visibility

- Locked gallery content is private user content and requires elevated moderation access.
- Admin UI should show safety metadata and counts by default.
- Viewing locked media requires an allowed moderation reason, elevated role, and audit log entry.
- No locked-gallery password or secret is ever exposed.

## Blocks / abuse view

- Admin can inspect block relationships relevant to a report or safety case.
- View supports reporter-target context, reciprocal block status, timestamps, and related complaints.
- Admin UI must not expose private chat content unless a report/admin policy grants that specific review path.

## Admin audit log

- Every admin action writes an immutable audit entry.
- Audit entries include admin user, role, action, target type/id, reason, request ID, IP/user agent where available, before/after safe metadata, and timestamp.
- Audit log supports search by admin, target, action, and time range.

## Operational health

- Admin/Ops UI shows backend health, database connectivity, object storage health, media upload prepare/complete rates, error volume, queue depths, and WebSocket status.
- Health data comes from backend endpoints and metrics, not client guesses.
- Secrets, passwords, tokens, connection strings, and raw environment values are never displayed.

## Rate limit / anti-spam visibility

- Admin/Ops can see rate limit counters and anti-spam decisions by user/IP/action bucket.
- UI supports identifying high-error upload loops, auth abuse, report abuse, and message spam patterns.
- Admins can clear or adjust limits only through audited backend actions.

## Required DB tables

- `admin_users`: backend admin identity, linked user/admin account, status.
- `admin_roles`: role definitions.
- `admin_user_roles`: admin-role assignments.
- `admin_sessions` or protected auth session storage.
- `admin_audit_log`: immutable admin action trail.
- `client_error_reports`: mobile/client error ingestion.
- `admin_support_notes`: support notes tied to user/content.
- `reports`: user reports/complaints.
- `moderation_queue_items`: queue state and assignment.
- `moderation_actions`: decisions and enforcement actions.
- `media_moderation_reviews`: media review state.
- `rate_limit_events` or aggregated rate-limit counters.
- `ops_health_events` or metrics snapshots, if not handled by the metrics system.

## Required backend endpoints

- `POST /admin/auth/login`
- `POST /admin/auth/refresh`
- `POST /admin/auth/logout`
- `GET /admin/me`
- `GET /admin/users?amoriaId=...`
- `GET /admin/users/:userId`
- `GET /admin/users/:userId/support-context`
- `GET /admin/reports`
- `GET /admin/reports/:reportId`
- `POST /admin/reports/:reportId/actions`
- `GET /admin/moderation/queue`
- `POST /admin/moderation/queue/:itemId/assign`
- `POST /admin/moderation/queue/:itemId/decision`
- `GET /admin/media`
- `GET /admin/media/:mediaId`
- `POST /admin/media/:mediaId/decision`
- `GET /admin/audit-log`
- `GET /admin/ops/health`
- `GET /admin/ops/rate-limits`
- `POST /client/error-reports`

## Required admin UI screens

- Admin login.
- Admin dashboard.
- User search by Amoria ID.
- User detail/support context.
- Reports list.
- Report detail/action panel.
- Moderation queue.
- Media moderation.
- Locked gallery safety view with elevated access.
- Blocks/abuse view.
- Client error reports.
- Ops health.
- Rate limit/anti-spam visibility.
- Admin audit log.
- Admin users/roles management.

## Security/privacy rules

- Backend authorizes every admin endpoint.
- Admin UI never trusts local role state without backend confirmation.
- Least privilege by role.
- Elevated privacy views require reason capture and audit logging.
- Public users never see admin-only fields.
- Admin routes are separate from public app routes.
- Admin actions are idempotent where possible and require explicit target IDs.
- No password/token/secret exposure.
- No raw `.env`, connection string, JWT secret, S3 access key, S3 secret key, refresh token, or auth bearer token exposure.

## Implementation blocks

- `ADMIN-OPS-01` admin access + roles + audit log.
- `ADMIN-OPS-02` client error reporting backend + mobile integration.
- `ADMIN-OPS-03` real admin web panel shell + user search.
- `ADMIN-OPS-04` reports/moderation.
- `ADMIN-OPS-05` media moderation.
- `ADMIN-OPS-06` ops health/rate limits.
- `ADMIN-OPS-07` admin smoke pass.
