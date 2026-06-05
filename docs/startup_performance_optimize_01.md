# Startup Performance Optimize 01

Updated: 2026-06-05

## Scope

`STARTUP-PERFORMANCE-OPTIMIZE-01` reduces mobile startup work based on the baseline diagnostics. It does not change product behavior, Nearby business logic, Together business logic, media behavior, locked-gallery behavior, monetization, billing, push/email, app icon, backend behavior, database schema, or local bat files.

## Changes Made

### Profile Bootstrap

Startup profile reads now reuse a recent real backend session user for 15 seconds after `saveBackendSession()`.

That session user comes from a real backend auth/profile response, such as:

- `POST /auth/refresh`;
- login/register auth response;
- a completed `GET /me`;
- a profile mutation response saved back into the backend session.

This is not a local-only fake profile success. If the session is missing or older than the short startup cache window, `getUserProfile()` still refreshes from the backend.

`refreshBackendUser()` also deduplicates an in-flight backend profile refresh, so concurrent profile callers share the same real request instead of issuing duplicate `GET /me` calls.

Explicit freshness-sensitive paths can bypass the cache with `allowCached:false`. The avatar URL verification path does this so media/profile confirmation still checks the backend when the cached session does not match the uploaded avatar.

### Tabs

Bottom tabs now use `lazy:true`.

Expected effect:

- Together remains the initial tab.
- Nearby component/backend load is not mounted/fetched before Nearby is opened.
- Inbox component load is not mounted before Inbox is opened.
- The tab bar and route set are unchanged.

### Inbox Badge And Realtime

The signed-in tab shell still supports the unread badge and inbox realtime subscription, but startup work is deferred with `InteractionManager.runAfterInteractions()`.

Expected effect:

- first visual screen can settle before inbox badge fetch and realtime subscription start;
- Inbox screen still loads its own inbox and blocked-user state on mount/focus;
- chat correctness is preserved if the user opens Inbox directly.

### Diagnostics

The baseline diagnostics remain in place:

- safe timing logs;
- sanitized `api.request`;
- `api.duplicate_request`;
- profile cache reuse marker: `profile.cached_session_reused`;
- profile in-flight reuse marker: `profile.refresh_reused_in_flight`;
- safe aggregate media probe timing.

Diagnostics remain dev-only, console-only, and first-30-seconds only.

They do not log request bodies, tokens, refresh tokens, passwords, exact coordinates, exact birth dates, profile text, raw media URLs, private media URLs, object keys, signed URLs, or locked-gallery content.

## Expected Follow-Up Measurements

During startup smoke, compare the previous baseline against the new logs:

- `GET /me` should be reduced during the initial signed-in startup path.
- `profile.cached_session_reused` should appear when `IdentitySetupGate` or Together reuses the auth refresh user.
- `profile.refresh_reused_in_flight` should appear only if profile calls overlap.
- `GET /nearby/me` and `GET /nearby/feed` should still not appear until Nearby is focused.
- Inbox `GET /inbox` should appear after initial interactions, or when Inbox itself is opened.
- Repeated `POST /auth/refresh` remains a warning to investigate.

## RED / YELLOW / BLUE

### RED

None introduced or found. No auth loop, startup failure, private-data logging, or locked-gallery/media privacy regression was found in this optimization pass.

### YELLOW

- The profile cache is intentionally short-lived and in-memory. It reduces startup churn but is not a general offline cache.
- Inbox badge/realtime still starts automatically for signed-in users after initial interactions because the tab badge is an active UI surface.
- Dev-client, Metro, emulator, and tunnel latency can still dominate perceived startup. The retained request timings should distinguish environment latency from app request duplication.

### BLUE

- Loading polish is still separate from request-count optimization.

## Commands Run

- `git status --short`
- `git branch --show-current`
- `git log -1 --oneline`
- `git pull`
- Startup files inspected with `sed` and `rg`.
- `npx tsc --noEmit`: pass.

## Build Impact

- EAS rebuild: no, no native configuration changed.
- Backend restart: no, server unchanged.
- DB migration: no.
- Admin web build: no.
- Metro cache clear: yes, to ensure the optimized JS bundle and diagnostics reload during smoke.
