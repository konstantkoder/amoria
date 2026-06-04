# Amoria Release Control Center

Updated: 2026-06-04

## Release Rules

- No mock, stub, fake, Firebase fallback, or local-only success path counts as release evidence.
- Together, Admin Web, media moderation, reports, audit, and ops health must use real backend endpoints.
- Do not touch local launch/archive files from release commits.
- Nearby mobile redesign and Announcements are out of scope for this Together/Admin pass.
- Nearby Admin diagnostics must remain aggregate-only and must not expose exact coordinates, exact birth dates, locked gallery media, fake users, or raw profile text.

## Branches

- Server branch: `backend/standalone-foundation`
- Mobile branch: `migration/remove-firebase-foundation`

## Together Geo Contract

- Together requires foreground location for every queue request.
- Default user flow radius is `25 km`.
- Valid finite radiuses are `5`, `25`, `100`, and `250` km.
- No-limit sends real coordinates with `radiusKm:null`; it means no distance cap, not no geolocation.
- Exact coordinates are never returned to peers, admin queue/session responses, DM, public profile, or client error reports.
- Old waiting rows without coordinates are release-invalid and should expire or be cancelled through Admin Queue.
- Search should remain waiting for late peer joins; users do not need to press start simultaneously.
- PlayMatch must not cancel queue from cleanup, remount, focus/blur, route changes, or temporary backgrounding.
- Queue cancellation must carry `cancelSource`; Admin Queue distinguishes `waitingReason` from true cancellation source.
- Device/emulator GPS failures must explain that coordinates are unavailable and must not start queue.

## Together Age Contract

- User profile stores private `birthDate`.
- Mobile Edit Profile collects `birthDate` through separate day/month/year numeric fields, assembles ISO `YYYY-MM-DD` for backend update, and splits saved self-profile dates back into the same fields.
- Mobile shows friendly birth-date errors, but backend remains the authority for age validation and Together admission.
- Backend validates 18+ before Together queue join; missing DOB, minors, future DOB, and unreasonable age are rejected.
- Exact `birthDate` is never public, never shown in Admin Queue, and redacted from client error metadata.
- Backend computes safe `age` for self profile and safe `ageGroup` for public/admin surfaces.
- Together sends a real backend `preferredAgeRange`; default is any adult `18+`.
- Matching requires mutual age compatibility, 18+ users, and existing activity/geo rules.
- Admin Queue exposes only `userAgeGroup`, `preferredAgeRange`, and age waiting reasons such as `age_mismatch`.
- Old Flirt/18+ `allowAdultMode` / `flirtEnabled` fields are deprecated compatibility fields only. The active mobile release UI no longer exposes the old standalone toggle, and these fields are not used for Together matching.

## Profile Anketa Contract

- Backend-backed anketa fields are `about`, `goal`, `mood`, and `interests`.
- Public profile safely exposes `about`, `goal`, `mood`, `interests`, `ageGroup`, avatar, and public photos.
- Public profile never exposes exact `birthDate`, exact coordinates, private age preferences, secrets, or locked-gallery content.
- Interests are the single release tag list. Do not add duplicate hashtags/tags for release.
- Interests are normalized by backend: trim, remove leading `#`, collapse whitespace, lowercase, deduplicate, enforce count/length, and reject empty/unsafe tags.
- Mobile Profile shows `Моя анкета`; Edit Profile saves through backend and refreshes from backend after save.
- Together lobby may display profile interest count, but interest overlap does not gate matching in this block.

## Together Draw Tools

- Draw eraser is backend-backed through `stroke_batch` events with `tool:"erase"`.
- Brush strokes use `tool:"draw"`; legacy strokes without `tool` remain valid as draw strokes.
- Story Sparks sessions reject draw stroke events.
- Replay/history/detail must rebuild brush and eraser effects from backend events.
- Mobile two-finger pan/zoom is viewport-only and must not alter saved stroke coordinates.
- Move and Reset must not be visible in the normal user drawer.
- Fullscreen/focus mode must let testers hide the tool palette while keeping exit fullscreen and leave-session controls available.

## Media Render Contract

- Public avatar/profile media must render through `/media/public/:mediaId` with image content type.
- Public profile must not return `avatarUrl` or public photo entries when the public media route would return `404`.
- Missing storage objects return `error.code=object_not_found` and are not treated as successful image loads.
- Owner delete can remove owned broken media rows/gallery items when the storage object is already missing.
- Owner delete bypasses the locked-folder minimum-visible guard; move/hide/password flows still enforce it.
- Avatar upload uses square unsaved preview, explicit backend save, backend refresh, and mediaId-based URL equality.
- Avatar and profile photo upload require in-app square crop confirmation before upload.
- Crop metadata uses normalized `0..1` coordinates against the oriented source image; the backend validates crop bounds/square shape, applies the crop, strips metadata, and re-encodes WebP.
- Old clients without crop metadata get backend center-square fallback; this is compatibility, not fake crop success.
- Admin Media thumbnails use safe public media paths; locked media must not get public preview URLs.
- Admin Media detail preview uses the authenticated audited content route.
- Mobile peer media failures must report safe `mediaId`, `urlKind`, `httpStatus`, and `contentType`; raw full URLs, signed URLs, tokens, and local paths must not appear.

## Admin Web Release Surface

Owner/ops/moderator/support roles should use Admin Web for release diagnostics:

- Dashboard
- Users
- Admin Users
- Client Errors
- Reports
- Media Moderation
- Together Queue
- Together Sessions
- Audit Log
- Ops Health
- Bootstrap

Together Queue is the smoke-test control surface for waiting/matched/expired/cancelled queue rows, `radiusKm`, `hasCoordinates`, `geoMode`, `userAgeGroup`, `preferredAgeRange`, `waitingReason`, `cancelSource`, `cancelReason`, `cancelledAt`, `lastAction`, waiting age, stale state, and audited waiting-row cancellation.

Together Sessions is the smoke-test control surface for created, active, finished, abandoned, cancelled, and recently ended sessions, including zero-event sessions, stale heartbeat, participant counts, event counts, story choice counts, reveal summaries, and exit state.

## Manual Smoke Required

Automated checks cannot replace the real two-client pass:

1. Both test users grant location.
2. Both start with `25 km`.
3. Both users must have private birth date set through day/month/year fields and use compatible age filters, starting with `Любой 18+`.
4. Start one user first, wait 10-30 seconds, then start the second user.
5. Repeat with `5`, `100`, `250`, and no-limit.
6. Inspect Admin Queue before match.
7. Inspect Admin Sessions after match, exit, freeze, or abandon.
8. Confirm Admin Media thumbnails and `Открыть фото` render real images.
9. Confirm peer avatar/photos render or emit safe media diagnostics.
10. Confirm no exact coordinates appear in mobile UI, Admin Web, client errors, DM, history, or public profile.
11. Confirm no exact birth date appears in public profile, Admin Queue, client errors, DM, history, or peer UI.
12. Confirm Profile/Edit Profile saves `about`, `goal`, `mood`, and `interests` to backend and persists after app restart.
13. Confirm peer profile shows safe public `ageGroup`, `about`, `goal`, `mood`, `interests`, avatar, and public photos.
14. Confirm Client Errors include enough app/build/release metadata to identify the running build and redact exact coordinates, exact birth date, secrets, and raw profile text.
15. In draw, smoke brush, eraser, hidden tools, no visible Move/Reset drawer controls, pinch pan/zoom, fullscreen on/off, finish, and history/detail replay.
16. In gallery/avatar, smoke delete below 3 visible public photos, broken photo cleanup, avatar crop/preview/upload/restart persistence, profile photo crop/preview/upload, peer avatar/photo visibility, crop cancel/choose-another, invalid crop rejection, and Admin `Проверить URL` HTTP 200 `image/webp`.
17. In Together age filtering, smoke missing DOB block, `Любой 18+`, one compatible age group, one incompatible age group, and Admin `age_mismatch`.

## Build Verification

- Clear Metro cache before smoke: `npx expo start -c`.
- Set `EXPO_PUBLIC_RELEASE_VERSION` for the smoke build when an exact Git SHA is not injected automatically.
- Native `app.json` changes, including Android `usesCleartextTraffic`, require a rebuilt/reinstalled dev/native build, not only JS reload.

## Future Nearby Age Reuse

Nearby future redesign should reuse `birthDate`/`ageGroup`, `preferredAgeRange`, `interests`, `goal`, `mood`, and geolocation/radius. Do not create separate age logic or separate Nearby-only profile fields. Announcements are not part of the future architecture.

## Nearby Profile Feed Backend

- Nearby profile feed uses real opted-in user profiles from `nearby_profile_visibility`.
- Active visibility stores exact latitude/longitude server-side only and returns only safe visibility state to the owner.
- Feed cards never expose exact coordinates, exact `birthDate`, exact distance, locked-gallery content, object keys, signed URLs, bucket names, or internal storage paths.
- Feed filtering excludes self, blocked users, off/expired visibility, incompatible age, incompatible gender/preference, and users outside mutual radius.
- Feed distance uses coarse `distanceBucket` only.
- Owner/ops Admin diagnostics for Nearby are available from `GET /admin/nearby/diagnostics` and the Admin Web Ops Health page.
- Diagnostics return active/off/expired/recent visibility counts, missing profile readiness counts, and safe feed exclusion reason-code counts only.
- Diagnostics help explain why users do not appear in the feed without exposing exact coordinates, exact `birthDate`, locked gallery media, media object keys, signed URLs, raw notes, or per-user private profile data.
- Future Nearby UI must use compact grid/list profile cards. It must not use a full-screen photo feed; photos should be thumbnails/previews inside cards.
- Legacy Nearby status endpoints remain compatible under `/nearby/statuses`; the future UI should target profile cards from `GET /nearby/feed`.

## Public Beta Blockers

- Complete real phone/emulator Together smoke against the release backend.
- Verify Admin Web role access in browser for owner, ops, moderator, and support.
- Connect a real media moderation provider or staff manual moderation before public beta.

## Completed Release Blocks

- ADMIN-OBJECT-STORAGE-HEALTH-01:
  - Admin/Ops Health now checks object storage with a non-mutating read-only bucket metadata check.
  - The check writes no test file, deletes no file, and creates no object.
  - Response statuses are `ok`, `not_configured`, `error`, and `not_checked`.
  - Responses expose only `status`, `checkedAt`, and safe `reason`/`errorCode`; no bucket names, object keys, endpoints, internal MinIO paths, secrets, tokens, or signed URLs are exposed.
- NEARBY-PROFILE-FEED-BACKEND-01:
  - Backend foundation now serves real opted-in Nearby profile cards from `GET /nearby/feed`.
  - Visibility is stored server-side with status, radius, optional short status, status kind, update time, expiry, and private coordinates.
  - Matching excludes self, blocked users, off/expired users, incompatible age, incompatible gender/preference, and users outside mutual radius.
  - Responses expose only safe profile card fields and coarse distance buckets.
- NEARBY-ADMIN-DIAGNOSTICS-01:
  - Backend/Admin Web now expose owner/ops Nearby diagnostics through aggregate counts and safe feed exclusion reason codes.
  - Responses and UI omit exact coordinates, exact birth dates, locked gallery media, raw profile text, object keys, signed URLs, and fake users.
  - Build impact: backend restart yes, admin build yes, DB migration no, EAS rebuild no, Metro cache clear no.
