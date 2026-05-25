# Together Smoke Pass

Updated: 2026-05-25

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

## Cancel Lifecycle Pass

- Device A must remain `waiting` while Device B joins 10-30 seconds later.
- Normal re-render, focus/blur, remount, and temporary backgrounding must not cancel the queue row.
- Active waiting UI primary action is `Остановить поиск` / `Stop search`.
- Radius expansion must be confirmed and should cancel the old row with `cancelSource=radius_expansion`.
- Stop/start-over should cancel with `cancelSource=retry_restart`.
- Manual stop/back should cancel with `cancelSource=user_stop` or `user_back`.
- A backend expiry should become `status=expired`, not `status=cancelled`.
- If a row cancels before match, Admin Queue must show `cancelSource`, `cancelReason`, `cancelledAt`, and `lastAction`.

## Draw Tools Pass

- In one real backend `draw` session, draw with brush and confirm peer sees the stroke.
- Switch to eraser, erase part of the drawing, and confirm peer sees the erased result.
- Reload/background one client and confirm `getSessionEvents` hydration restores brush and erase strokes.
- Zoom in/out/reset and draw while zoomed; saved strokes must not be distorted.
- Use Move mode to pan the zoomed canvas without creating a stroke.
- Enter and exit fullscreen/focus mode; leave-session control must remain available.
- Finish the session and confirm history/detail replay preserves eraser effects.

## Admin Checks

- Queue: status, activity, radius, `hasCoordinates`, `geoMode`, `waitingReason`, `cancelSource`, `cancelReason`, `cancelledAt`, `lastAction`, waiting age, safe identity, stale state, matched session link, cancel waiting action.
- Sessions: active, finished, abandoned/cancelled/recent sessions, zero-event sessions, stale heartbeat, participant left state, event counts, reveal summary.
- Client Errors: location read failures, queue join failures, queue poll failures, canvas/session diagnostics.
- Client Errors: confirm app/build metadata includes `appVersion`, `buildNumber`, and release metadata when public Expo release env vars were set.
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
- diagnostics should retain safe `hasAvatarUrl` and `photoCount`;
- locked gallery photos must remain hidden unless unlocked by user password.

## Build Verification

Before smoke, verify the tester is running the current build:

```bash
npx expo start -c
```

Set `EXPO_PUBLIC_RELEASE_VERSION` for the smoke build when an exact Git SHA is not injected automatically. If `app.json` native flags changed, for example Android `usesCleartextTraffic`, rebuild/reinstall the dev/native build; a JS reload is not enough.

## Age Filter Note

Together age filtering is planned after Together start reliability is stable. `FlirtSettingsScreen` is not the Together age filter. Future block: `TOGETHER-AGE-FILTER-01`.

## Staged Flow

The release flow remains:

```text
draw -> continue_story -> story_sparks -> open/skip
```

Story Sparks continuation keeps the matched pair and does not run a second geo match.

## Result

Automated checks can verify validation and contracts. A release signoff still needs a real two-client pass against the release backend; no mock/stub/fake data counts.
