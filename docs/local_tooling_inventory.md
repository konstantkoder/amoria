# Amoria Local Tooling Inventory

Updated: 2026-05-16

## Scope

This document records local development tooling in `F:\Dev` after `ADMIN-OPS-00A`.
Local bat files and helper scripts are development tooling only. They are not release product logic.

## Main start bat

Preserved:

- `F:\Dev\START_AMORIA_DEV.bat`

This is the current working launcher for the local Amoria dev environment and must stay in place.

## Preserved project folders

- `F:\Dev\Amoria`
- `F:\Dev\AmoriaServer`
- `F:\Dev\.gitignore`
- `F:\Dev\scripts`
- `F:\Dev\tools`

`F:\Dev\scripts\start-amoria-dev.ps1` is called by the main start bat. `F:\Dev\tools\cloudflared\cloudflared.exe` is used by that script.

## Preserved local log tools

Preserved as local development/test support only:

- `F:\Dev\AMORIA_CLEAR_TEST_LOGS.bat`
- `F:\Dev\AMORIA_COLLECT_TEST_LOGS.bat`
- `F:\Dev\amoria_collect_logs.ps1`

These tools collect server, Docker, git status, process, health, safe env snapshot, and Android logcat diagnostics. They do not change app behavior and must not be treated as product logic.

## Preserved repository scripts

Mobile scripts under `F:\Dev\Amoria\scripts` were preserved. They are tracked by Git, and several are referenced by `F:\Dev\Amoria\package.json` scripts.

Server scripts under `F:\Dev\AmoriaServer\scripts` were preserved. `scripts/run-db-migrate.mjs` is referenced by `F:\Dev\AmoriaServer\package.json`.

## Archived local files

Archive path:

- `F:\Dev\AmoriaLocalArchive\2026-05-16_13-43-38`

Moved to archive:

- `F:\Dev\Amoria\.env.example.backup-before-mobile-cleanup`
- `F:\Dev\AmoriaServer\.env.backup-before-security`
- `F:\Dev\AmoriaServer\docker-compose.yml.backup-before-standalone-server`
- `F:\Dev\scripts\logs\cloudflared-20260509-105229.stderr.log`
- `F:\Dev\scripts\logs\cloudflared-20260509-105229.stdout.log`
- `F:\Dev\scripts\logs\cloudflared-20260509-105909.stderr.log`
- `F:\Dev\scripts\logs\cloudflared-20260509-105909.stdout.log`
- `F:\Dev\scripts\logs\cloudflared-20260516-130224.stderr.log`
- `F:\Dev\scripts\logs\cloudflared-20260516-130224.stdout.log`

## Manual confirmation

- Confirm whether old archived backup files should be permanently removed after release sign-off. They are quarantined, not deleted.
- Keep the archive out of release commits. It may contain local-only historical data.
- `F:\Dev\AmoriaServer\uploads` and `F:\Dev\AmoriaServer\uploads-test` were not touched because they are server working data and may be tied to local media testing.

## Rules

- Do not move or delete `F:\Dev\START_AMORIA_DEV.bat`.
- Do not move or delete `F:\Dev\Amoria` or `F:\Dev\AmoriaServer`.
- Do not touch `.env`, `.git`, `node_modules`, Docker volumes, tracked source, tests, package files, or referenced repository scripts during local cleanup.
- Local bat files are development tooling only, not release product logic.
