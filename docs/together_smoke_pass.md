# Together Smoke Pass

Updated: 2026-05-24

## Required Geo Pass

1. Device A and Device B sign in to real backend accounts.
2. Both grant foreground location.
3. Both start Together with `25 km`.
4. If no match, expand to `100 km`, then `250 km`, then no limit.
5. Confirm no-limit sends coordinates with `radiusKm: null`.
6. Confirm permission denied blocks queue join and shows a clear privacy message.
7. Confirm exact coordinates are absent from UI, client errors, admin responses, history, DM, and public profile.

## Admin Checks

- Queue: status, activity, radius, `hasCoordinates`, `geoMode`, stale state, matched session link, cancel waiting action.
- Sessions: active, finished, abandoned/cancelled/recent sessions, zero-event sessions, stale heartbeat, participant left state, event counts, reveal summary.
- Client Errors: location read failures, queue join failures, queue poll failures, canvas/session diagnostics.
- Audit: queue reads/cancels, session reads, media/report actions.
- Ops Health: DB status, object storage status, open client errors, reports, pending media.

## Staged Flow

The release flow remains:

```text
draw -> continue_story -> story_sparks -> open/skip
```

Story Sparks continuation keeps the matched pair and does not run a second geo match.

## Result

Automated checks can verify validation and contracts. A release signoff still needs a real two-client pass against the release backend; no mock/stub/fake data counts.
