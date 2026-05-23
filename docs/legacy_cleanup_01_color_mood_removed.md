# Legacy Cleanup 01: color_mood Removed

Updated: 2026-05-23

## Decision

`color_mood` was removed before public release. There is no production history contract to preserve, so the release backend does not keep an active compatibility path for new `color_mood` sessions.

## Backend Contract

- `TOGETHER_ACTIVITIES` contains only `draw` and `story_sparks`.
- `POST /together/queue` with `activity: "color_mood"` returns validation error / 400.
- Palette event handling was removed from active event validation.
- Draw and Story Sparks remain real backend sessions.
- Existing pre-release local databases may contain old rows; use a dev cleanup/reset instead of keeping runtime compatibility.

## Remaining References

Remaining `color_mood` references are allowed only in:

- negative tests proving the removed activity is rejected;
- documentation explaining the removal.

No active route, queue path, event path, or admin action creates a `color_mood` session.
