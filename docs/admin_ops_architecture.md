# Admin/Ops Architecture

Updated: 2026-05-20 after `BUGFIX-UX-02`

This is the plan for a full Admin/Ops release module. It is not a temporary mini-admin and must not rely on mock/stub/fake data, Firebase fallback, or local-only success.

## Goals

- Give operators a real backend-backed control center for user support, abuse handling, moderation, media safety, and operational health.
- Make user lookup and support actions reliable through Amoria ID and internal `userId`.
- Provide a durable audit trail for all admin actions.
- Surface release-critical errors and infrastructure health without exposing secrets.

## Admin access model

- `ADMIN-OPS-01` uses the existing backend auth token, then verifies an active `admin_users` row linked to the authenticated `users.id`.
- Admin authorization is role-based and checked server-side on every protected admin endpoint.
- Public users without an active `admin_users` row cannot access `/admin/*`.
- Admin sessions use secure server-issued user auth tokens with existing expiry/revocation behavior. Future dedicated admin session hardening can build on the same guard.
- Admin UI cannot infer privileges locally; backend decisions are the source of truth.
- `ADMIN-OPS-03-FULL` adds `npm run admin:create-owner`, which creates or reuses a real backend auth user and assigns active owner admin access.

## Admin roles / admin users

- `owner`: full operational access, role management, and sensitive audit review.
- `support`: user lookup, support notes, non-destructive account support actions.
- `moderator`: reports, complaints, moderation queue, media review, block/abuse views.
- `ops`: health, rate limit visibility, error reporting, service diagnostics.

Admin users are stored in `admin_users`, linked to public users by `userId`, with role assignments in `admin_user_roles`. Public app users do not gain admin powers through client state.

The owner admin account is a separate real account, not an existing mobile test account. If no password is supplied, local generated credentials are saved outside the repo under `F:\Dev\AmoriaAdminSecrets`.

`ADMIN-OPS-04` adds owner-only `GET /admin/admin-users` for safe read access to admin users and roles. It writes audit log entries and does not expose password hashes, refresh tokens, or secrets. Role editing remains future work.

## Client error reporting

- Mobile client reports real runtime/API/upload errors to backend through `POST /client/error-reports`.
- Reports include timestamp, app version/build, platform, route/screen context, authenticated `userId` when available, request correlation ID when available, safe error code/message, and redacted metadata.
- Reports must not include passwords, auth tokens, refresh tokens, private keys, raw `.env`, or full request bodies that may contain secrets.
- Admin feed is available through `GET /admin/client-errors` for owner/support/ops roles.
- Admin UI supports search/filter by user, screen, action, error code, status, time window, and release build.
- `ADMIN-OPS-02` integrated upload diagnostics for profile photo and avatar failures. Profile photo failures now include the upload step: `getInfo`, `prepareUpload`, `putUpload`, `completeUpload`, `mapMedia`, or caller-side `refreshGallery`.
- `ADMIN-OPS-04` adds lifecycle statuses `open`, `resolved`, `ignored`, and `archived`, plus audited single-row actions and bulk archive/resolve/ignore for old noisy errors. Production cleanup is archive/resolve, not destructive delete.
- `BUGFIX-UX-01` extends mobile coverage to user-action UX/navigation failures: invalid Together activity, failed color mood navigation, missing DM peer route params, failed peer hydration, failed `UserProfile` navigation, and failed profile edit navigation. Reports are fire-and-forget and include only safe context such as screen/action/step, source type, focus target, and whether route IDs were present.
- `BUGFIX-UX-02` extends coverage to peer profile media load failures and Together manual-exit failures. Reports include `UserProfileScreen/loadPeerMedia/avatarLoadFailed`, `UserProfileScreen/loadPeerMedia/publicPhotoLoadFailed`, and `exitTogetherSession` failures from draw/color_mood/match screens. Reports remain fire-and-forget and sanitized.

## Users search by Amoria ID

- Primary support lookup is Amoria ID.
- Admin can also search by internal `userId` and email for auth/support cases.
- Public-facing user identity in admin results shows `displayName` plus Amoria ID.
- Duplicate display names are expected and must not be treated as conflicts.

## Reports / complaints

- Users can report profiles, media, announcements, chats/messages, and other abuse contexts.
- Reports keep reporter, target, reason, free text, source object, status, assigned admin, and timestamps.
- Admin actions include triage, assign, request more info, warn, dismiss, restrict, suspend, or escalate.
- `ADMIN-OPS-03-FULL` added backend-backed report list/detail/action endpoints and `report_review_actions`.
- Current report statuses are `open`, `under_review`, `resolved`, `dismissed`, and `escalated`.

## Moderation queue

- Queue is backend-backed and status-driven.
- Supports priority, assignment, SLA/time aging, reason filters, and source filters.
- Queue entries link to the affected user/content and the full audit trail.

## Media/photo moderation

- Admins can review avatar, public profile photos, and locked-gallery photo metadata/previews under strict privacy rules.
- Media review tracks source, owner, visibility, upload status, moderation status, reviewer, and decision reason.
- Destructive actions require explicit reason and audit log entry.
- `ADMIN-OPS-03-FULL` added admin media list/detail/decision endpoints and `media_moderation_reviews`.

## Locked gallery safety visibility

- Locked gallery content is private user content and requires elevated moderation access.
- Admin UI should show safety metadata and counts by default.
- Viewing locked media requires an allowed moderation reason, elevated role, and audit log entry.
- No locked-gallery password or secret is ever exposed.
- Locked media detail URLs are not returned from list responses. Detail access requires owner/moderator plus reason.

## Blocks / abuse view

- Admin can inspect block relationships relevant to a report or safety case.
- View supports reporter-target context, reciprocal block status, timestamps, and related complaints.
- Admin UI must not expose private chat content unless a report/admin policy grants that specific review path.

## Admin audit log

- Every admin action writes an immutable audit entry.
- Audit entries include admin user, role, action, target type/id, reason, request ID, IP/user agent where available, before/after safe metadata, and timestamp.
- Audit log supports search by admin, target, action, and time range.
- `ADMIN-OPS-01` writes audit entries for admin user search and admin audit-log reads. Metadata is sanitized/truncated and redacts password/token/secret-like keys.
- `ADMIN-OPS-04` writes audit entries for client error lifecycle actions, bulk client error actions, ops health reads, and owner-only admin user reads.

## Operational health

- Admin/Ops UI shows backend health, database connectivity, object storage health, media upload prepare/complete rates, error volume, queue depths, and WebSocket status.
- Health data comes from backend endpoints and metrics, not client guesses.
- Secrets, passwords, tokens, connection strings, and raw environment values are never displayed.
- `ADMIN-OPS-03-FULL` added `GET /admin/ops/health` with real API/database status.
- `ADMIN-OPS-04` adds real open client error, open report, and pending media moderation counts. Object storage remains explicitly `not_checked` until a safe non-mutating check is wired.

## Rate limit / anti-spam visibility

- Admin/Ops can see rate limit counters and anti-spam decisions by user/IP/action bucket.
- UI supports identifying high-error upload loops, auth abuse, report abuse, and message spam patterns.
- Admins can clear or adjust limits only through audited backend actions.

## Required DB tables

- `admin_users`: backend admin identity, linked user/admin account, status. Added in `ADMIN-OPS-01`.
- `admin_roles`: role definitions. Added in `ADMIN-OPS-01`.
- `admin_user_roles`: admin-role assignments. Added in `ADMIN-OPS-01`.
- `admin_sessions` or protected auth session storage.
- `admin_audit_log`: immutable admin action trail. Added in `ADMIN-OPS-01`.
- `client_error_reports`: mobile/client error ingestion. Added in `ADMIN-OPS-02`.
- `client_error_reports.status`, `resolved_at`, `resolved_by_admin_user_id`, `resolution_note`, `updated_at`: client error lifecycle. Added in `ADMIN-OPS-04`.
- `report_review_actions`: admin report review/action history. Added in `ADMIN-OPS-03-FULL`.
- `admin_support_notes`: support notes tied to user/content.
- `safety_reports.status`: report queue status. Added in `ADMIN-OPS-03-FULL`.
- `moderation_queue_items`: queue state and assignment.
- `moderation_actions`: decisions and enforcement actions.
- `media_moderation_reviews`: media review state. Added in `ADMIN-OPS-03-FULL`.
- `rate_limit_events` or aggregated rate-limit counters.
- `ops_health_events` or metrics snapshots, if not handled by the metrics system.

## Required backend endpoints

- `POST /admin/auth/login` (future, if separate admin auth is required)
- `POST /admin/auth/refresh` (future, if separate admin auth is required)
- `POST /admin/auth/logout` (future, if separate admin auth is required)
- `GET /admin/health` (added in `ADMIN-OPS-01`)
- `GET /admin/me` (added in `ADMIN-OPS-01`)
- `GET /admin/users?amoriaId=...&q=...&limit=...` (added in `ADMIN-OPS-01`)
- `GET /admin/admin-users` (owner-only, added in `ADMIN-OPS-04`)
- `GET /admin/users/:userId`
- `GET /admin/users/:userId/support-context`
- `GET /admin/reports`
- `GET /admin/reports/:reportId` (implemented as `/admin/reports/:id` in `ADMIN-OPS-03-FULL`)
- `POST /admin/reports/:reportId/actions` (implemented as `/admin/reports/:id/actions` in `ADMIN-OPS-03-FULL`)
- `GET /admin/moderation/queue`
- `POST /admin/moderation/queue/:itemId/assign`
- `POST /admin/moderation/queue/:itemId/decision`
- `GET /admin/media` (added in `ADMIN-OPS-03-FULL`)
- `GET /admin/media/:mediaId` (added in `ADMIN-OPS-03-FULL`)
- `POST /admin/media/:mediaId/decision` (added in `ADMIN-OPS-03-FULL`)
- `GET /admin/audit-log` (added in `ADMIN-OPS-01`)
- `GET /admin/client-errors?limit=...&screen=...&action=...&code=...&amoriaId=...&userId=...&status=...&createdFrom=...&createdTo=...` (added in `ADMIN-OPS-02`, lifecycle filters added in `ADMIN-OPS-04`)
- `POST /admin/client-errors/:id/actions` (added in `ADMIN-OPS-04`)
- `POST /admin/client-errors/actions/bulk` (added in `ADMIN-OPS-04`)
- `GET /admin/ops/health` (added in `ADMIN-OPS-03-FULL`)
- `GET /admin/ops/rate-limits`
- `POST /client/error-reports` (added in `ADMIN-OPS-02`)

## Required admin UI screens

- Admin login. Added in `ADMIN-OPS-03-FULL`.
- Admin dashboard. Added in `ADMIN-OPS-03-FULL`.
- User search by Amoria ID. Added in `ADMIN-OPS-03-FULL`.
- User detail/support context.
- Reports list. Added in `ADMIN-OPS-03-FULL`.
- Report detail/action panel. Added in `ADMIN-OPS-03-FULL`.
- Moderation queue.
- Media moderation. Added in `ADMIN-OPS-03-FULL`.
- Locked gallery safety view with elevated access. Foundation added in `ADMIN-OPS-03-FULL`.
- Blocks/abuse view.
- Client error reports. Added in `ADMIN-OPS-03-FULL`.
- Ops health. Added in `ADMIN-OPS-03-FULL`.
- Admin users read view. Added in `ADMIN-OPS-04`.
- English/Russian language switcher and typed dictionaries. Added in `ADMIN-OPS-04`.
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
- `ADMIN-OPS-02` client error reporting backend + mobile integration. Completed foundation.
- `ADMIN-OPS-03-FULL` real admin web console + user search + reports/media moderation foundation + ops health. Completed foundation.
- `ADMIN-OPS-04` client error lifecycle, safe archive cleanup, ops health counts, admin users read view, and Russian admin-web localization. Completed foundation.
- `ADMIN-OPS-05` media moderation enforcement policy hardening.
- `ADMIN-OPS-06` object storage health + rate limits.
- `ADMIN-OPS-07` admin smoke pass.
