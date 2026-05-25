# Production Ops

Updated: 2026-05-25 after `BUGFIX-TOGETHER-QUEUE-CANCEL-LIFECYCLE-06`

Codex must not modify production directly and must not receive production server access.

Safe fix workflow:

1. Observe via Admin Client Errors, server logs, audit, and support evidence.
2. Reproduce in dev/staging.
3. Create a branch.
4. Fix locally with Codex.
5. Run typecheck/tests/build.
6. Deploy to staging.
7. Manual smoke.
8. Operator deploys production through the normal release path.
9. Monitor logs, client errors, audit, and smoke signals.

Backend deploys can ship without mobile store updates when API contracts stay compatible. Migrations require backup, rollback plan, and single-run execution.

Mobile JS-only fixes may use OTA only if Expo Updates and release policy allow it. Native changes require EAS build and app store release.

Before a Together smoke or production verification:

- clear Metro cache with `npx expo start -c`;
- set `EXPO_PUBLIC_RELEASE_VERSION` when Git SHA is not injected automatically;
- rebuild/reinstall the dev/native build when `app.json` native flags change, including Android `usesCleartextTraffic`;
- inspect Admin Client Errors for app/build/release metadata before trusting tester evidence.

Together queue incident triage:

- `waitingReason` explains why a candidate was not matched.
- `cancelSource` explains who or what cancelled a queue row.
- `screen_cleanup`, `navigation_blur`, and `unknown` are suspicious mobile lifecycle sources.
- If a queue row cancelled before match, no session should exist. If `matchedSessionId` exists, Admin Sessions should show it.

Required before public beta:

- staging;
- database backups;
- migration rollback plan;
- structured logs;
- error/crash tracking;
- release version tracking;
- admin support workflow;
- incident checklist;
- real media moderation provider or staffed manual moderation.
