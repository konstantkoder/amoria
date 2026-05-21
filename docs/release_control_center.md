# Amoria Release Control Center

Updated: 2026-05-21

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

- MEDIA-01 direct profile photo `PUT` blocker is fixed in code by moving mobile profile photo upload to backend-mediated `POST /media/profile-photo`.
- A real-device gallery smoke pass is still required to verify physical phone upload and peer public profile visibility.
- Admin Client Errors should no longer receive profile photo reports with `step=putUpload` and `uploadUrlHost=minio:9000`.

## Completed blocks

- `TOGETHER-01` backend replay.
- `TOGETHER-02` color_mood. This activity remains supported as legacy history/session compatibility only.
- `TOGETHER-03` lifecycle hardening.
- `TOGETHER-04` smoke checklist only, real 2-device test not done.
- `TOGETHER-STORY-01` Story Sparks release scenario:
  - Story Sparks uses backend-backed curated story packs, backend events, result/history/detail rendering, and DM source context.
  - Superseded by `TOGETHER-FLOW-02`: Story Sparks is now a staged continuation after draw, not an equal lobby start option.
- `TOGETHER-FLOW-02` staged story continuation:
  - Active Together lobby entry is `Начать вместе` / `Start Together`, which starts `draw`.
  - After draw result, users can choose open chat, continue story, or leave the drawing as a story.
  - Mutual `continue_story` creates/reuses one backend `story_sparks` continuation session for the same pair.
  - Final Story Sparks result keeps the ordinary open/skip reveal flow.
  - `color_mood` remains legacy-readable and is not active in the lobby.
  - DM keyboard dismisses only after successful message send.
- `TOGETHER-GEO-01` radius-backed Together matching:
  - Together lobby offers `5 km`, `25 km`, `100 km`, `250 km`, and no-limit search radius.
  - Finite radius mode requests foreground location before joining queue.
  - Backend validates coordinates/radius and matches by stricter mutual radius.
  - Exact peer coordinates are not returned to mobile.
  - Story Sparks continuation after draw keeps the same pair and does not re-match by geo.
- `MEDIA-01` backend-mediated profile photo upload:
  - Avatar and profile photo uploads are backend-mediated multipart flows.
  - Mobile profile photo upload no longer depends on direct internal MinIO/S3 `PUT` URLs.
  - Returned profile media URL is the backend public media route `/media/public/:mediaId`.
  - Prepared direct upload endpoints remain available but are not used by mobile profile photo upload.
- `GALLERY-01` audit/hardening.
- `GALLERY-02` smoke checklist + preview failure fix.
- `BUGFIX-UX-01` mobile release UX/navigation blockers:
  - Superseded by `TOGETHER-FLOW-02`: Together lobby now shows Story Sparks as an after-draw continuation, not an equal first-step CTA.
  - DM chat profile opening self-heals missing route `peerId` through the real inbox thread list before failing visibly.
  - Profile shows direct edit entrypoints for "About me" and "Mood".
  - Client Errors now receives user-action failures for invalid Together activity, failed Story Sparks navigation, failed legacy color mood navigation, missing/hydrated peer failures, failed `UserProfile` navigation, and failed edit-profile navigation.
- `BUGFIX-UX-02` media/navigation/profile release blockers:
  - Peer public profile media now uses current backend public media URLs: `PUBLIC_MEDIA_URL/public/:mediaId`.
  - Public profile avatar/photos no longer trust stale stored `S3_PUBLIC_BASE_URL`, local, internal MinIO, or dead tunnel URLs as the mobile-visible contract.
  - Locked gallery photos remain excluded from public profile before unlock.
  - Profile goal/mood badges are clickable and open Edit Profile with focused sections.
  - Together draw/story_sparks/legacy color_mood/waiting screens have an explicit return to main tabs without fake finish/reveal/chat success.
  - Client Errors now receives peer media load failures and Together manual-exit failures.

See `docs/bugfix_ux_01_audit.md`.
See `docs/bugfix_ux_02_media_nav_profile.md`.
See `docs/media_upload_architecture.md`.
See `docs/together_story_sparks.md`.
See `docs/together_flow_02_staged_story.md`.
See `docs/together_geo_matching.md`.

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
- `BUGFIX-UX-01` adds mobile UX/navigation dead-action reports for Together, DM chat, and profile editing without tokens, passwords, local paths, signed URLs, or fake success.
- `BUGFIX-UX-02` adds peer profile media load reports and Together manual-exit failure reports without tokens, passwords, local paths, signed URLs, or fake success.

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

`ADMIN-OPS-04` Admin/Ops lifecycle and localization foundation has been implemented:

- `client_error_reports` now supports `open`, `resolved`, `ignored`, and `archived` lifecycle statuses.
- Single client error actions are available through `POST /admin/client-errors/:id/actions`.
- Bulk archive/resolve/ignore is available through `POST /admin/client-errors/actions/bulk` with a 500-row cap and audit trail.
- `GET /admin/client-errors` supports `status`, `createdFrom`, and `createdTo` filters and returns resolution fields.
- `GET /admin/ops/health` includes database status plus real open client error, open report, and pending media moderation counts.
- Object storage health remains explicitly `not_checked` until a safe non-mutating check is wired; it is not faked as OK.
- Owner-only `GET /admin/admin-users` lists admin users and roles without secrets.
- Admin Web has an English/Russian language switcher persisted in `localStorage`.
- Client Errors default to open errors and include Resolve, Ignore, Archive, Reopen, and `Archive current filtered errors`.
- See `docs/admin_ops_04_audit.md`.

## Next big epic

Continue Admin/Ops hardening and final smoke pass.

## Remaining blockers before admin smoke pass

- Complete real-device MEDIA-01 smoke: profile photo upload through `POST /media/profile-photo`, peer public profile visibility, and no `putUpload/minio` client errors.
- Complete real-device TOGETHER-GEO-01 smoke: radius matching, denied-location behavior, no-limit queue, and no peer coordinate exposure.
- BUGFIX-TOGETHER-PROMPTS-I18N-EXAMPLES.
- Full RU locale cleanup.
- Complete a real signed-in Together/Gallery smoke pass; `TOGETHER-04` is checklist-only so far and Story Sparks requires a real 2-account smoke pass.
- Run `npm run admin:create-owner` against the real local/dev database and keep credentials out of Git.
- Start backend + admin web and complete a real owner login smoke pass.
- Verify Client Errors after reproducing the profile photo upload bug.
- Verify Reports and Media Moderation against real user-generated reports/media.
- Add object storage live health check to `/admin/ops/health`.
- Add rate limit / anti-spam visibility endpoints and UI.
- Add admin role editing/assignment workflow.
- Decide whether dedicated admin auth/session endpoints are needed beyond the existing user auth token plus active admin membership guard.
- Keep local tooling and archive files out of release commits.
