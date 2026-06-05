# I18N-RELEASE-CLEANUP-01

Date: 2026-06-05

Scope: clean release-critical language drift for active mobile UI before public
beta. Backend behavior, Nearby logic, Together logic, media/crop behavior,
monetization, billing, push/email, local bat files, and fake data were not
changed.

## Branches

| Repo | Branch | SHA before work | Result |
| --- | --- | --- | --- |
| Mobile `F:\Dev\Amoria` | `migration/remove-firebase-foundation` | `0bf3fe8 Document and fix release warning gate` | changed |
| Server `F:\Dev\AmoriaServer` | `backend/standalone-foundation` | `36a7e90 Document and fix server release warning gate` | unchanged |

Both worktrees were clean before work. Both branches were already up to date.

## Commands Run

### Mobile

| Command | Result |
| --- | --- |
| `git status --short` | clean before work |
| `git branch --show-current` | `migration/remove-firebase-foundation` |
| `git pull` | already up to date |
| `git log -1 --oneline` | `0bf3fe8 Document and fix release warning gate` |
| `npm run i18n:audit` before | failed on full 24-locale drift |
| `npm run i18n:ui-risk` before | passed; broad 24-locale warning report |
| `npx tsc --noEmit` before | passed |
| `npm run i18n:audit` after | passed release gate |
| `npm run i18n:ui-risk` after | passed; scans EN/RU/HR release languages |
| `npx tsc --noEmit` after | passed |
| `git diff --check` | required final check |

### Server

| Command | Result |
| --- | --- |
| `git status --short` | clean before work |
| `git branch --show-current` | `backend/standalone-foundation` |
| `git pull` | already up to date |
| `git log -1 --oneline` | `36a7e90 Document and fix server release warning gate` |

Server code was not changed, so `npm run typecheck` and `npm test` were not
required for this task.

## Audit Before

Initial `npm run i18n:audit` failed against full locale parity:

| Locale | Missing | Extra | Same as English |
| --- | ---: | ---: | ---: |
| `ru` | 0 | 0 | 12 |
| `hr` | 542 | 59 | 260 |
| other non-base locales | about 941 each | about 59 each | about 227-256 each |

The old audit treated all 24 locale files as release-supported. That did not
match the product state and allowed the language picker to expose incomplete
languages.

## Audit After

`npm run i18n:audit` is now a concrete release gate:

| Item | Result |
| --- | --- |
| Release languages | `en`, `ru`, `hr` |
| Hidden beta locale files | 21 |
| Base keys | 1555 |
| Active UI keys scanned | 739 |
| `en` active missing | 0 |
| `ru` active missing | 0 |
| `hr` active missing | 0 |
| `hr` remaining full-file missing | 373, outside release gate |
| `hr` active same-as-English | 27 product names, units, ranges, or compact tokens |
| Hidden beta locale drift | reported, not release-blocking |

`npm run i18n:ui-risk` after cleanup:

| Locale | Risk count | Longest |
| --- | ---: | ---: |
| `en` | 108 | 141 |
| `ru` | 85 | 137 |
| `hr` | 61 | 133 |

The remaining risk report is a length/wrapping warning report. The longest HR
items are localized body/help text, not missing-key or mixed-language blockers.

## Fixed Now

- Limited the public language picker to EN/RU/HR.
- Kept all 24 locale files importable for backward compatibility and fallback.
- Migrated stored unsupported locale choices into the mandatory release-language
  picker path instead of continuing to show incomplete locale UI.
- Added active EN/RU/HR keys for Profile, Edit Profile, Nearby, Together,
  Chat/Inbox, Settings, Photo/Gallery, Safety/Reports, Drawer/Tabs, Together
  history/detail/result, replay controls, and draw example labels.
- Moved hardcoded replay control strings into i18n.
- Removed the hardcoded Russian disabled-canvas fallback.
- Added a defensive legacy nickname formatter fallback so unknown dynamic
  nickname parts do not surface raw `nickname.*` keys.
- Updated `i18n:audit` to fail on active EN/RU/HR missing keys and report hidden
  beta locale drift separately.
- Updated `i18n:ui-risk` to scan EN/RU/HR release languages and active prefixes.

## Remaining Limitations

- Amoria has 24 locale files, but only EN/RU/HR are public-beta supported in this
  release gate.
- The other 21 locale files remain present but are hidden from the language
  picker because they have large drift.
- Hidden beta locale cleanup is deferred until those languages are intentionally
  release-supported.
- Some same-as-English EN/RU/HR strings remain by design for product names,
  units, numeric ranges, IDs, and short tokens.
- Admin/server i18n was not changed. If admin i18n grows into a release issue,
  track it separately as `ADMIN-I18N-CLEANUP`.

## Build Impact

| Area | Impact |
| --- | --- |
| EAS rebuild | No |
| Backend restart | No |
| DB migration | No |
| Admin build | No |
| Metro cache clear | Yes |
