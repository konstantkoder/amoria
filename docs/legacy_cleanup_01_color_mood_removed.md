# Legacy Cleanup 01: color_mood Removed

Updated: 2026-05-23

## Decision

`color_mood` was removed before public release. There is no public compatibility contract for this pre-release scenario, so keeping the full active runtime would only add release risk.

## Mobile Result

- `PlayColorMoodScreen.tsx` was deleted.
- `togetherPaletteState.ts` was deleted.
- Navigation no longer exposes `PlayColorMood`.
- Mobile Together activity types allow only `draw` and `story_sparks`.
- `PlayMatch` rejects unknown/removed activities and reports a sanitized Client Error.
- Result/history/detail show a generic unsupported-old-session fallback for forced old local/dev rows.
- Active UI no longer mentions the removed feature.

## Server Result

- Backend activity constants allow only `draw` and `story_sparks`.
- New `color_mood` queue requests return validation error / 400.
- Palette events are rejected from active draw sessions.
- Positive active-scenario tests were removed and replaced with negative guard tests.

## Dev Data

If a local database still contains old pre-release rows, reset/clean the local dev database. Do not keep production runtime code for pre-public local data.
