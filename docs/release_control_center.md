# Amoria Release Control Center

Updated: 2026-05-24

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

- RELEASE-SMOKE-BLOCKERS-03 is fixed in code and awaiting release smoke:
  - Peer/public/admin media responses derive `/media/public/:mediaId` at response time and no longer trust stale stored tunnel/local/object-storage URLs.
  - Admin Web has Together Queue and read-only Together Sessions observability for owner/ops.
  - Media Moderation shows image previews and safe public links from the current backend origin, plus detail metadata and audited manual decisions.
  - Locked media is not exposed through public media; elevated admin content review requires reason and audit.
  - Uploaded media enters manual review when the automated provider is `NOT_CONFIGURED`; there is no fake approval.
  - Production ops flow is documented in `docs/production_ops.md`.

## Completed blocks

- `TOGETHER-01` backend replay.
- `TOGETHER-02` color_mood was removed before public release in `RELEASE-SMOKE-BLOCKERS-02`.
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
  - `color_mood` is removed; old local/dev rows use unsupported-old-session fallback.
  - DM keyboard dismisses only after successful message send.
- `TOGETHER-GEO-01` radius-backed Together matching:
  - Together lobby offers `5 km`, `25 km`, `100 km`, `250 km`, and no-limit search radius.
  - The normal default is `25 km`; invalid stored radius preferences reset to `25 km`.
  - Every radius mode, including no-limit, requests foreground location before joining queue.
  - No-limit sends coordinates with `radiusKm:null` and means no distance cap, not no geolocation.
  - Backend validates coordinates/radius and matches by the stricter applicable radius.
  - Delayed no-match state offers radius expansion or stop search; repeated retry is not the first action.
  - Admin/Ops can inspect safe queue status and `geoMode` through `/admin/together/queue` without exact coordinates.
  - Admin/Ops can inspect safe latest/ended session diagnostics through `/admin/together/sessions` without exact coordinates or raw event payloads.
  - Exact peer coordinates are not returned to mobile.
  - Story Sparks continuation after draw keeps the same pair and does not re-match by geo.
- `MEDIA-01` backend-mediated profile photo upload:
  - Avatar and profile photo uploads are backend-mediated multipart flows.
  - Mobile now crops/previews first and uploads only after explicit user confirmation.
  - Mobile profile photo upload no longer depends on direct internal MinIO/S3 `PUT` URLs.
  - Returned profile media URL is the backend public media route `/media/public/:mediaId`.
  - Prepared direct upload endpoints remain available but are not used by mobile profile photo upload.
- `ADMIN-OPS-05` Admin/Ops release support:
  - Admin Web left nav includes `Очередь Together` / `Together Queue`.
  - Queue table shows created/expires/user/activity/status/radius/hasCoordinates/matched session, never exact coordinates.
  - Media Moderation shows thumbnails for safe public media and authenticated detail preview for locked/private review.
  - Manual media actions remain audited; reject/restrict require reason.
  - Automated moderation foundation is present but disabled as `NOT_CONFIGURED`, leaving uploads in manual review rather than fake-approved.
- `GALLERY-01` audit/hardening.
- `GALLERY-02` smoke checklist + preview failure fix.
- `BUGFIX-UX-01` mobile release UX/navigation blockers:
  - Superseded by `TOGETHER-FLOW-02`: Together lobby now shows Story Sparks as an after-draw continuation, not an equal first-step CTA.
  - DM chat profile opening self-heals missing route `peerId` through the real inbox thread list before failing visibly.
  - Profile shows direct edit entrypoints for "About me" and "Mood".
  - Client Errors now receives user-action failures for invalid Together activity, failed Story Sparks navigation, failed legacy color mood navigation, missing/hydrated peer failures, failed `UserProfile` navigation, and failed edit-profile navigation.
- `BUGFIX-UX-02` media/navigation/profile release blockers:
  - Peer public profile media now uses current backend public media paths: `/media/public/:mediaId`.
  - Public profile avatar/photos no longer trust stale stored `S3_PUBLIC_BASE_URL`, local, internal MinIO, or dead tunnel URLs as the mobile-visible contract.
  - Locked gallery photos remain excluded from public profile before unlock.
  - Profile goal/mood badges are clickable and open Edit Profile with focused sections.
  - Together draw/story_sparks/waiting screens have an explicit return to main tabs without fake finish/reveal/chat success.
  - Client Errors now receives peer media load failures and Together manual-exit failures.
- `RELEASE-SMOKE-BLOCKERS-03` media URLs and Together reliability:
  - Public profile, admin media list/detail, and mobile image rendering derive current media URLs from media ids.
  - Admin Web rewrites old absolute `/media/public/:mediaId` URLs to the current API origin.
  - No-limit Together queue joins are idempotent while an equivalent waiting row is active.
  - PlayMatch interpolates queue active-until time and does not show raw `{time}` in active UI.
  - Canvas/draw failures report safe Client Errors for WebView load/parse, stroke send, finish, heartbeat, and event hydration failures.
  - `Сессии Together` / `Together Sessions` gives owner/ops read-only diagnostics after match.
- `BUGFIX-TOGETHER-GEO-REQUIRED-01` release geo hardening:
  - Mobile never starts Together queue without real foreground coordinates.
  - Permission denial blocks the queue honestly with privacy copy.
  - Location-read failures report safe Client Errors without latitude/longitude.
  - No-limit sends coordinates with `radiusKm:null`.
  - Admin Queue shows `geoMode` and marks old coordinate-less rows as invalid.
  - Admin Sessions default to latest sessions and surface ended/stale/zero-event diagnostics.

See `docs/bugfix_ux_01_audit.md`.
See `docs/bugfix_ux_02_media_nav_profile.md`.
See `docs/bugfix_media_urls_together_reliability.md`.
See `docs/media_upload_architecture.md`.
See `docs/together_story_sparks.md`.
See `docs/together_flow_02_staged_story.md`.
See `docs/together_geo_matching.md`.
See `docs/admin_queue_ui_01.md`.
See `docs/media_moderation_policy.md`.
See `docs/production_ops.md`.
See `docs/legacy_cleanup_01_color_mood_removed.md`.
See `docs/bugfix_draw_prompts_peer_media_queue.md`.
See `docs/release_dead_code_inventory.md`.
See `docs/bugfix_together_geo_required_matching.md`.
See `docs/admin_web_regression_pass.md`.

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

- Smoke Admin Web Together Queue with two real test accounts while one/both are waiting.
- Smoke Admin Web Together Sessions after a real match, including stale heartbeat behavior if one client freezes/exits.
- Smoke Admin Web Media Moderation against real uploaded avatar/profile/locked media.
- Decide whether an audited queue cancel action is needed after release; current queue page is read-only.
- Connect a real automated media moderation provider or staff manual moderation before public beta.
- Complete real-device MEDIA-01 smoke: profile photo upload through `POST /media/profile-photo`, peer public profile visibility, and no `putUpload/minio` client errors.
- Complete real-device TOGETHER-GEO-01 smoke: 25 km default, 5/25/100/250/no-limit matching with granted location, denied-location blocking, staggered no-limit matching with coordinates, and no peer coordinate exposure.
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
