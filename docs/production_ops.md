# Production Ops

Updated: 2026-05-23 after `ADMIN-OPS-05`

## Hard Rule

Codex must not modify production directly and must not receive production server access.

## Safe Fix Workflow

1. Observe the issue through Admin Client Errors, server logs, audit logs, and smoke evidence.
2. Capture safe reproduction notes without passwords, tokens, signed URLs, exact coordinates, or private media.
3. Reproduce in dev or staging.
4. Create a branch from the current release branch.
5. Let Codex fix code locally.
6. Run typecheck/tests/builds.
7. Deploy to staging.
8. Run manual smoke against staging.
9. Deploy to production through the normal operator-owned deploy path.
10. Monitor logs, client errors, audit, and support reports.

## Backend Deploy

- Backend fixes can be deployed without a mobile app-store update when API contracts stay compatible.
- Migrations require a database backup, rollback plan, and single-run migration procedure.
- Run migrations once.
- Verify health endpoints after deploy.
- Monitor structured logs and Admin Client Errors.

## Mobile Deploy

- JS-only fixes may use OTA only if Expo Updates are configured and release policy allows it.
- Native changes require EAS build and store release.
- Client Errors must include release version/build number so ops can tie failures to deployed app builds.

## Required Before Public Beta

- staging environment;
- database backups;
- migration rollback plan;
- structured logs;
- error tracking/crash reporting;
- release version tracking;
- admin support workflow;
- incident checklist;
- documented media moderation staffing or a real automated moderation provider.

