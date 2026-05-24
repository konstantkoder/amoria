# Admin/Ops Architecture

Updated: 2026-05-24

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
- Ops Health: honest backend/database/object-storage/status counts; no fake OK for unchecked dependencies.
- Bootstrap: first owner flow only when backend permits it.

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

Ops Health may show backend and database health when actually checked. Object storage remains `not_checked` until a safe non-mutating check is wired. Counts for open client errors, open reports, and pending media moderation are real backend counts.

## Public Beta Gaps

- Browser smoke all Admin Web pages with real admin users by role.
- Complete real media moderation smoke with real uploaded media.
- Complete real Together queue/session smoke with two clients.
- Add object storage live health check.
- Add rate-limit/anti-spam visibility if needed for public beta operations.
