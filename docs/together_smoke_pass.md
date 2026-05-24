# Together Smoke Pass

Updated: 2026-05-24

## Required Geo Pass

1. Device A and Device B sign in to real backend accounts.
2. Both grant foreground location.
3. Both start Together with `25 km`.
4. Start Device A first, wait 10-30 seconds, then start Device B. They should still match when compatible.
5. If no match after the delayed guidance, expand to `100 km`, then `250 km`, then no limit.
6. Confirm no-limit sends coordinates with `radiusKm: null`.
7. Confirm permission denied blocks queue join and shows a clear privacy message.
8. In BlueStacks, set emulator location and open Google Maps before retrying if the app says the device is not returning coordinates.
9. Confirm exact coordinates are absent from UI, client errors, admin responses, history, DM, and public profile.

## Admin Checks

- Queue: status, activity, radius, `hasCoordinates`, `geoMode`, `waitingReason`, waiting age, safe identity, stale state, matched session link, cancel waiting action.
- Sessions: active, finished, abandoned/cancelled/recent sessions, zero-event sessions, stale heartbeat, participant left state, event counts, reveal summary.
- Client Errors: location read failures, queue join failures, queue poll failures, canvas/session diagnostics.
- Audit: queue reads/cancels, session reads, media/report actions.
- Ops Health: DB status, object storage status, open client errors, reports, pending media.

## Expected Waiting UX

Search should not fall to no-match/retry after 2-3 seconds. It should show:

- `Ищем человека...`
- queue active-until time;
- `Можно подождать или остановить поиск`;
- temporary connection retrying message if polling fails.

Delayed guidance appears after about 90 seconds while polling continues. Retry/start-over is not the primary action for an active waiting row.

## Peer Media Check

After mutual open, open the peer profile from Together/DM context:

- avatar should render when `hasAvatarUrl=true`;
- public photos should render when `photoCount>0`;
- Client Errors should include safe `urlKind` and `mediaId` if image loading fails;
- locked gallery photos must remain hidden unless unlocked by user password.

## Staged Flow

The release flow remains:

```text
draw -> continue_story -> story_sparks -> open/skip
```

Story Sparks continuation keeps the matched pair and does not run a second geo match.

## Result

Automated checks can verify validation and contracts. A release signoff still needs a real two-client pass against the release backend; no mock/stub/fake data counts.
