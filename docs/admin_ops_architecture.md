# Admin/Ops Architecture

Updated: 2026-06-04

## Purpose

Admin/Ops is a real backend-backed release tool for support, moderation, diagnostics, audit, and operational health. It must not depend on mock data, fake success, Firebase fallback, or browser-only state.

## Access Model

- Admin Web authenticates through the backend and then uses `/admin/me`.
- Every `/admin/*` endpoint checks active admin membership and role policy server-side.
- Owner, ops, moderator, and support see only the pages/actions allowed by backend roles.
- Hidden or forbidden pages must fail honestly, not with broken UI or local bypass.

## Audit Model

Admin reads/actions write audit entries where backend policy requires it. Release-critical audited surfaces include:

- admin user reads;
- client error lifecycle actions;
- report actions;
- media review/detail/decision actions;
- Nearby diagnostics reads;
- Together queue reads and cancels;
- Together session reads;
- audit log reads;
- ops health reads.

Audit metadata must stay sanitized: no passwords, tokens, signed URLs, exact coordinates, raw event payloads, private chat, or locked-media content outside the audited content-review route.

## Admin Web Pages

- Dashboard: summary counts and health links.
- Users: real user lookup and safe identifiers.
- Admin Users: owner-only safe admin user/role read view.
- Client Errors: filterable lifecycle feed with safe metadata and audited status actions.
- Reports: report list/detail/action flow with reason/note where required.
- Media Moderation: real previews when allowed, authenticated locked-media review with reason/audit, audited decisions, and no fake moderation provider success.
- Together Queue: owner/ops queue diagnostics with filters for activity, status, radius, `geoMode`, and `hasCoordinates`; no exact coordinates.
- Together Sessions: owner/ops latest session diagnostics for active, finished, abandoned, cancelled, and recently ended sessions; no raw event payloads.
- Audit Log: recent admin actions without secrets.
- Ops Health: honest backend/database/object-storage/status counts plus safe Nearby diagnostics; no fake OK for unchecked dependencies.
- Bootstrap: first owner flow only when backend permits it.

## Nearby Diagnostics

Owner/ops can read `GET /admin/nearby/diagnostics` from the Ops Health page. The response is aggregate-only:

- active, off, expired, and recently updated visibility counts;
- profile readiness missing counts for birth date, gender, preferred genders, avatar, and display name;
- feed exclusion reason counts for self, blocked, visibility, distance, age, gender, and missing profile requirements;
- `checkedAt`.

Nearby diagnostics are designed to explain why real users do not appear in the Nearby feed. They do not expose exact coordinates, exact birth dates, locked gallery media, raw profile text, public media rows, object keys, signed URLs, or fake users.

## Together Diagnostics

Queue rows expose safe derived geo state:

- `finite_with_location`
- `no_limit_with_location`
- `missing_location_invalid_old_entry`

Sessions expose safe diagnostic summaries:

- `participantCount`
- `participantUserIds`
- `lastHeartbeatAt`
- `leftAt`
- `eventCount`
- `strokeEventCount`
- `storyChoiceCount`
- reveal decisions

They do not expose exact coordinates, private chat, locked media, or raw draw/story payloads.

## Health Honesty

Ops Health shows backend and database health when actually checked. Counts for open client errors, open reports, and pending media moderation are real backend counts.

Object storage health uses a non-mutating bucket metadata check. It does not upload, delete, or create a test object. The response exposes only:

- `status`;
- `checkedAt`;
- safe `reason` or `errorCode` when relevant.

Object storage status meanings:

- `ok`: configured and reachable through the safe read-only check.
- `not_configured`: required object storage config is missing.
- `error`: configured, but the safe check failed with a sanitized error code.
- `not_checked`: the SDK/provider cannot perform the safe check; reason is `safe_check_unavailable`.

Ops Health must not expose object storage bucket names, object keys, endpoints, internal MinIO paths, access keys, secrets, tokens, or signed URLs.

## Public Beta Gaps

- Browser smoke all Admin Web pages with real admin users by role.
- Complete real media moderation smoke with real uploaded media.
- Complete real Together queue/session smoke with two clients.
- Add rate-limit/anti-spam visibility if needed for public beta operations.
