# TECH-DEBT-VSCODE-WARNINGS-01

Date: 2026-06-05

Scope: turn VS Code yellow warnings and project warnings into a RED/YELLOW/BLUE
release gate for the mobile and server release branches.

## Branches And Pre-Work SHAs

| Repo | Branch | Pre-work SHA | Initial worktree |
| --- | --- | --- | --- |
| Mobile `F:\Dev\Amoria` | `migration/remove-firebase-foundation` | `a0125730d3b022efc5472673068677caeb5111aa` | clean |
| Server `F:\Dev\AmoriaServer` | `backend/standalone-foundation` | `0fc2656747216fa8e9b8fc94838487897f35bfd2` | clean |

Local toolchain used for checks: Node `v18.19.1`, npm `9.2.0`.

## Commands Run

### Mobile

| Command | Result |
| --- | --- |
| `git status --short` | clean before work |
| `git branch --show-current` | `migration/remove-firebase-foundation` |
| `git pull` | already up to date |
| `git log -1 --oneline` | `a012573 Add gender and search preference profile completion` |
| `git rev-parse HEAD` | `a0125730d3b022efc5472673068677caeb5111aa` |
| `npx tsc --noEmit` | pass |
| `npm run i18n:audit` | fail: locale drift against `en.json` |
| `npm run i18n:ui-risk` | pass; wrote ignored `i18n_ui_risk.txt` |
| `npm audit --omit=dev` before lock update | fail: 19 vulnerabilities, 17 moderate and 2 high |
| `npm update fast-uri ws brace-expansion --package-lock-only` | pass with Node engine warnings from React Native/Metro packages requiring newer Node |
| `npm audit --omit=dev` after lock update | fail: 16 vulnerabilities, 15 moderate and 1 high |
| `rg --files` for ESLint/Prettier/VS Code settings | none found |
| targeted deprecated/import scan | found known compatibility deprecations, `expo-file-system/legacy`, and startup `LogBox.ignoreLogs` |

Mobile i18n audit details:

- Base locale keys: `1434`.
- Locales: `24`.
- `ru`: `0` missing keys, `0` extra keys, `12` strings same as English.
- `hr`: `542` missing keys, `59` extra keys, `260` strings same as English.
- Other non-base locales audited here generally show `941` missing keys and about `59` extra keys.
- Runtime translation fallback is present: locale value -> English value -> key. This prevents missing locale keys from becoming a runtime crash, but it is not release-quality localization.

Mobile UI-risk details:

- Script passed.
- Risk counts were `5` to `14` strings per locale.
- Longest flagged priority string length was `87`.
- This is visual/text quality debt, not a compile gate failure.

### Server

| Command | Result |
| --- | --- |
| `git status --short` | clean before work |
| `git branch --show-current` | `backend/standalone-foundation` |
| `git pull` | already up to date |
| `git log -1 --oneline` | `0fc2656 Add Nearby admin diagnostics` |
| `git rev-parse HEAD` | `0fc2656747216fa8e9b8fc94838487897f35bfd2` |
| `npm run typecheck` | pass |
| `npm test` | pass: 209 tests, 0 failed |
| `npm audit --omit=dev` before lock update | fail: 2 moderate vulnerabilities |
| `npm view ws version` | `8.21.0` available |
| `npm view brace-expansion version` | `5.0.6` available |
| `npm update ws brace-expansion --package-lock-only` | pass with Node engine warnings because local Node is below repo/package requirements |
| `npm audit --omit=dev` after lock update | pass: 0 vulnerabilities |
| root lint script inspection | present as `lint`, implemented as `tsc -p tsconfig.json --noEmit` |
| ESLint/Prettier/VS Code settings scan | none found |
| targeted deprecated/import scan | only known legacy `flirtEnabled` / `allowAdultMode` compatibility fields |

Server test warning:

- Tests pass, but the shell prints the AWS SDK future Node support warning while running on Node `v18.19.1`.
- Server `package.json` declares `engines.node >=22`; this shell is below that release runtime contract.

## RED/YELLOW/BLUE Gate

| Color | Finding | Gate decision | Action |
| --- | --- | --- | --- |
| RED | Mobile TypeScript compile errors | none found | no code fix |
| RED | Server TypeScript/test failures | none found | no code fix |
| RED | Runtime import/export errors or missing routes found by checks | none found | no code fix |
| RED | Server production audit exposed runtime dependency advisories in `ws` and `brace-expansion` | fixed | lockfile-only update to patched transitive versions |
| YELLOW | Mobile `npm audit --omit=dev` still reports Expo/tooling advisories: `@xmldom/xmldom` high, `postcss` moderate, `uuid` moderate dependency chain | not a small safe fix in this gate | defer Expo/tooling dependency work; `npm audit --force` would install Expo `56.0.8` |
| YELLOW | Mobile `npm run i18n:audit` fails with large locale drift | not runtime-breaking due fallback | defer to `I18N-RELEASE-CLEANUP-01` |
| YELLOW | Mobile has no lint script and no ESLint/Prettier config | project hygiene warning | defer lint setup decision |
| YELLOW | Mobile uses `expo-file-system/legacy` in media/storage paths | deprecated/legacy API warning | defer; media behavior out of scope for this task |
| YELLOW | Mobile has known deprecated compatibility routes/types for legacy Announcements and old 18+/Flirt fields | intentional compatibility surface | leave unchanged |
| YELLOW | Server and local shell Node versions do not match release engines | startup/toolchain warning | align local/CI/runtime Node to server `>=22`; mobile RN/Metro packages warn under Node 18 |
| YELLOW | Server deprecated `flirtEnabled` / `allowAdultMode` schema fields remain | intentional compatibility surface | leave unchanged |
| BLUE | Mobile `i18n:ui-risk` long-string findings | cosmetic UI/text risk | defer to i18n cleanup |
| BLUE | `LogBox.ignoreLogs` suppresses known Expo Go/nested navigation warnings | dev/runtime console hygiene only | no release action |
| BLUE | No `.vscode` settings files found | no project warning source to fix | no action |

Open RED after this task: none.

## Fixed Now

- Mobile `package-lock.json` was updated inside existing dependency ranges for patched transitive `fast-uri`, `ws`, and `brace-expansion` versions.
- Server `package-lock.json` was updated inside existing dependency ranges:
  - `ws` `8.20.0` -> `8.21.0`
  - `brace-expansion` `5.0.5` -> `5.0.6`
- Server production audit now reports `found 0 vulnerabilities`.

## Deferred

- `I18N-RELEASE-CLEANUP-01`: repair missing/extra/same-as-English locale keys and review UI string length risk.
- `ADMIN-REPORTS-MODERATION-WORKFLOW-01`: no new admin/report compile RED was found here; keep report/admin workflow and moderation completeness in that task.
- Locked-gallery tasks: no locked-gallery RED was found here; keep existing locked-gallery smoke/release verification outside this warning-gate task.
- Startup/toolchain tasks: align development, CI, EAS, and backend runtime Node versions with package engine requirements before release smoke.
- Expo/tooling dependency task: plan the remaining mobile audit cleanup because the remaining audit fix path includes broader Expo/tooling movement.

## Build Impact

| Area | Impact |
| --- | --- |
| EAS rebuild | No immediate app-behavior rebuild required; future EAS builds should consume the updated lockfile |
| Backend restart | Yes when deploying the server lockfile dependency update |
| DB migration | No |
| Admin build | No |
| Metro cache clear | No |

