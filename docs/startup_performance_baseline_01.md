# Startup Performance Baseline 01

Updated: 2026-06-05

## Scope

`STARTUP-PERFORMANCE-BASELINE-01` measures startup before optimization. It does not change product behavior, Nearby logic, Together logic, media behavior, locked-gallery behavior, billing, monetization, backend behavior, database schema, or local bat files.

## Startup Flow Inspected

Signed-in mobile startup currently flows through:

1. `App.tsx` mounts `LocaleProvider`.
2. `LocaleContext` reads the stored release locale from AsyncStorage and shows the mandatory picker if needed.
3. `AuthContext` reads the refresh token and calls `POST /auth/refresh` when a refresh token exists.
4. `IdentitySetupGate` calls `getUserProfile()`, which refreshes backend user state through `GET /me`.
5. `AppNavigator` mounts the bottom tabs with `initialRouteName="Together"` and `lazy:false`.
6. `MainTabs` loads the inbox badge through `GET /chat/inbox` and opens realtime inbox subscription.
7. `PlayLobbyScreen` is focused initially and calls `getUserProfile()` again to load the profile interest count.
8. `NearbyHubScreen` mounts because tabs are not lazy, but its backend `loadInitial()` is behind `useFocusEffect`, so it should run only when Nearby is focused.
9. Nearby media probes run only after card image failures, not as a normal startup preload.

## Timing Diagnostics Added

Diagnostics are dev-only console diagnostics through `src/services/startupDiagnostics.ts`. They log for the first 30 seconds after module load and use safe metadata only.

Added timings:

- `app.module_loaded`
- `locale.ready`
- `auth.refresh`
- `auth.bootstrap`
- `profile.bootstrap`
- `first_screen.ready`
- `together.initial_load` only while Together is focused
- `nearby.initial_load` only while Nearby is focused
- `api.request` for sanitized method/path/status/duration
- `api.duplicate_request` when the same sanitized startup request repeats
- `auth.refresh_reused_in_flight` when the API client dedupes an in-flight refresh
- `media.probe_aggregate` for safe aggregate media probe count/duration/result

The diagnostics do not log request bodies, tokens, refresh tokens, passwords, exact coordinates, exact birth dates, profile text, raw media URLs, private media URLs, object keys, signed URLs, or locked-gallery content.

API paths are sanitized before logging. User IDs, Amoria IDs, UUIDs, and media IDs are replaced with placeholders where those IDs appear in route paths.

## Static Findings

### RED

None found in this pass. Startup does not show an obvious auth loop, startup crash, private token logging, exact coordinate logging, exact birth-date logging, password logging, or locked-media URL logging in the inspected startup path.

One existing auth bootstrap log previously printed the raw error object. It was changed to safe error metadata: error name, HTTP status, and safe code only.

### YELLOW

- `IdentitySetupGate` calls `getUserProfile()` during startup, and the initially focused `PlayLobbyScreen` calls `getUserProfile()` again for interest count. Because `getUserProfile()` currently refreshes backend user state through `GET /me`, startup can issue repeated profile reads.
- `MainTabs` always loads the inbox badge and starts realtime inbox subscription for signed-in users on app startup. This is useful for chat badges, but it is startup work even when the first visual path is Together.
- `Tab.Navigator` uses `lazy:false`, so Nearby and Inbox components can mount at startup. Nearby backend loading is focus-gated, but mount work still exists.
- Dev-client startup can be slowed by Metro bundling, source maps, emulator cold start, Cloudflare/tunnel latency, and simultaneous phone/emulator backend pressure. The new `api.request` timings help separate app code from network/tunnel latency.

### BLUE

- Cosmetic loading polish may still make startup feel slower even when requests are normal.
- Media probe timing is only relevant after image failures; it is not a normal startup blocker unless failed card media appears immediately.

## Duplicate Request Detection

The API client now records sanitized startup requests during the first 30 seconds and logs `api.duplicate_request` when a method/path repeats.

Expected duplicates to watch during smoke:

- `GET /me`: likely from `IdentitySetupGate` plus initial Together profile interest load.
- `POST /auth/refresh`: should normally happen once. More than once suggests an auth bootstrap or retry issue.
- `GET /nearby/me` and `GET /nearby/feed`: should not appear until Nearby is focused.
- Media probe diagnostics should not appear unless an image fails to load.

## What Is Dev-Only

The diagnostics are gated by `__DEV__`. They are intended for local/dev-client startup comparison across:

- phone only;
- emulator only;
- phone plus emulator simultaneously;
- Metro cold start vs warm reload;
- direct backend URL vs Cloudflare/tunnel URL.

They are not a production analytics feature and do not persist data.

## Real App Issues To Optimize Later

Recommended follow-up after collecting a few startup logs:

- Deduplicate or cache the startup `GET /me` flow so identity gate and Together lobby do not both force a backend profile refresh.
- Decide whether inbox badge/realtime should wait until first screen ready or remain startup work.
- Consider `lazy:true` for inactive tabs if measured mount cost is meaningful, while preserving intended tab UX.
- If `api.request` durations are high only through tunnel/dev-client, treat it as environment latency rather than app startup logic.

## Optimization Follow-Up

`STARTUP-PERFORMANCE-OPTIMIZE-01` is documented in `docs/startup_performance_optimize_01.md`.

The optimization pass keeps the baseline diagnostics and reduces startup work by:

- reusing a short-lived real backend session user after auth/profile responses;
- deduplicating in-flight backend profile refreshes;
- enabling lazy inactive tab mounting;
- deferring inbox badge/realtime startup until after initial interactions.

Nearby backend loading remains focus-gated.

## Commands Run

- Mobile `git status --short`, `git branch --show-current`, `git log -1 --oneline`.
- Mobile `git pull`.
- Server `git status --short`, `git branch --show-current`, `git log -1 --oneline`.
- Server `git pull`.
- Inspected startup, auth, locale, navigation, Nearby, Together, API client, profile, and media probe files with `sed` and `rg`.
- Mobile `npx tsc --noEmit`: pass.

Server was not changed, so server typecheck/tests were not required.

## Build Impact

- EAS rebuild: no, no native configuration changed.
- Backend restart: no, server unchanged.
- DB migration: no.
- Admin build: no.
- Metro cache clear: yes, to ensure the new dev diagnostics are loaded during startup smoke.
