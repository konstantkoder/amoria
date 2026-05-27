# Together Smoke Pass

Updated: 2026-05-27 for `TOGETHER-DRAW-TOOLS-05`

## Run Metadata

| Field | Value |
| --- | --- |
| Backend URL used | Tester must fill exact release/dev backend URL |
| WebSocket URL used | Tester must fill exact release/dev WS URL |
| Mobile build/dev client used | NOT TESTED - requires tester to fill exact Expo/dev-client/build identifier |
| Device A | NOT TESTED - requires phone/emulator assignment |
| Device B | NOT TESTED - requires second phone/emulator assignment |
| Account A identifier | NOT TESTED - enter email/Amoria ID only, no password |
| Account B identifier | NOT TESTED - enter email/Amoria ID only, no password |
| Execution owner | Codex prepared checklist and ran automated checks; real 2-device pass was not executed from this shell |

## Scope

This smoke pass covers the active staged Together release lifecycle:

- `draw` first from the Together lobby.
- optional `story_sparks` continuation after draw.
- final open/skip after Story Sparks when the continuation is used.

Removed pre-release coverage:

- `color_mood` must not appear in the active release UI.
- New `color_mood` queue requests are rejected by backend validation.
- Old local/dev `color_mood` rows show a generic unsupported-old-session fallback instead of keeping a runtime feature path.

The required lifecycle is:

```text
radius choice -> draw queue -> draw session -> draw result -> continue_story/open/skip -> optional story_sparks session -> story result -> open/skip -> DM/history/detail
```

No mock, stub, fake data, Firebase fallback, or local-only success path should be accepted as passing evidence.

Geo matching rule:

- every radius mode requires real foreground location before joining queue;
- the normal default radius is 25 km;
- no-limit sends coordinates with `radiusKm:null` and means no distance cap, not no location;
- backend queue uses the selected radius and coordinates as source of truth;
- waiting keeps polling until match or expiry and should not encourage repeated retry;
- no-match/retry does not appear after one poll or 2-3 seconds;
- delayed guidance appears after about 90 seconds and offers radius expansion or stop search;
- temporary poll failures show a retrying connection message and do not cancel queue;
- normal PlayMatch cleanup, remount, focus/blur, route changes, and temporary backgrounding do not cancel queue;
- explicit mobile cancels send `cancelSource`: `user_stop`, `user_back`, `retry_restart`, or `radius_expansion`;
- exact peer coordinates must not appear in UI, logs, queue/session responses, DM, history, or detail;
- Story Sparks continuation after draw keeps the same pair and does not re-match by geo.
- Admin Web has Together Queue and Together Sessions pages for owner/ops. Use Queue before match to see activity/status/radius/hasCoordinates without exact coordinates; use Sessions after match to see status, participant heartbeat, event counts, reveal summaries, and stale active sessions.

## Automated Sanity Checks

These checks passed for the Story Sparks implementation, but they do not replace the required 2-device smoke pass.

| Area | Command | Result | Notes |
| --- | --- | --- | --- |
| Server typecheck | `npm run typecheck` | PASS | `tsc -p tsconfig.json --noEmit` completed with exit code 0 |
| Server tests | `npm test` | PASS | 184/184 tests passed |
| Mobile TypeScript | `npx tsc --noEmit` | PASS | Completed with exit code 0 |

## Draw UX Cleanup 05

- Phone fullscreen topbar should stay compact and horizontal: timer left, tools/exit/menu actions in one row or horizontal scroll.
- Tools are hidden by default and open in a compact drawer.
- Fullscreen has one top/edge tools button; there is no duplicate bottom floating tools button.
- The drawer keeps brush/eraser primary, move as secondary fallback, reset as a small secondary action, colors, and sizes.
- `+` / `-` zoom controls are not prominent because two-finger pan/zoom is the primary viewport gesture.
- Hint copy should be visible in the draw footer: `Одним пальцем рисуйте, двумя — двигайте и масштабируйте.`
- Android back closes the drawer first, exits fullscreen second, and then follows normal leave confirmation.
- One-finger draw/erase, two-finger pan/zoom, peer strokes, and replay/history must remain backend-backed and unchanged.

## Build Verification

Before manual smoke:

```bash
npx expo start -c
```

Set `EXPO_PUBLIC_RELEASE_VERSION` if exact Git SHA injection is not available. Client Errors should include `appVersion`, `buildNumber`, and release metadata. If native `app.json` flags changed, including Android `usesCleartextTraffic`, rebuild/reinstall the dev/native app; JS reload is not enough.

Known automated-check warning: the server test run prints the existing AWS SDK future Node support warning because this shell uses Node `v18.19.1`. It did not fail tests.

## Scenario Results

| Scenario | Required Coverage | Result | Evidence / Notes | Bug ID |
| --- | --- | --- | --- | --- |
| A - Draw happy path | 2 accounts match into one `draw` session, live strokes sync, finish, mutual open, one DM chat, `activity: draw`, history/detail replay, app restart replay from backend events | NOT TESTED | Prepared for manual 2-device pass. No phone/emulator pair and account credentials are available in this Codex shell. | - |
| A1 - Draw tools | In one real `draw` session: brush stroke, eraser stroke, peer sees erase, fullscreen with hidden tools, one-finger draw/erase, pinch pan/zoom, zoom in/out/reset, draw while zoomed, Move mode fallback, finish, history/detail replay preserves erase | NOT TESTED | Prepared for manual 2-device pass. Brush/eraser must remain backend-backed through `stroke_batch`; pinch/zoom is viewport-only. | - |
| B - Staged Story Sparks happy path | Complete `draw`, both choose `continue_story`, both enter the same backend `story_sparks` continuation session, complete 4 rounds, mutual open creates one DM chat with draw + story context | NOT TESTED | Prepared for manual 2-device pass. No phone/emulator pair and account credentials are available in this Codex shell. | - |
| C - Draw open/skip | Complete `draw`, A opens, B skips, no mutual DM chat, honest result/history state, no chat-promise CTA | NOT TESTED | Prepared for manual 2-device pass. | - |
| D - Story Sparks open/skip | Complete `story_sparks`, A opens, B skips, no mutual DM chat, honest result/history state, story remains in history/detail | NOT TESTED | Prepared for manual 2-device pass. | - |
| E - Skip/skip | Complete either active scenario, both skip, no chat, history/detail accessible, no chat CTA appears | NOT TESTED | Prepared for manual 2-device pass. | - |
| F - Leave / abandon | Match, A leaves before finish, B sees interrupted state, reveal/chat unavailable, no success history, no infinite spinner | NOT TESTED | Prepared for manual 2-device pass. | - |
| G - Missed WebSocket recovery | Complete session, background/reload one client, result/detail recovers via `getSession` / `getSessionEvents`, no duplicate chat navigation | NOT TESTED | Prepared for manual 2-device pass. | - |
| H - Duplicate action protection | Double tap story choice/finish/open, buttons disable or backend idempotency holds, no duplicate events/thread/broken UI | NOT TESTED | Prepared for manual 2-device pass. | - |
| I - Removed color_mood guard | Lobby/history/detail/result do not expose an active `color_mood` path; a forced old route shows the unsupported-old-session fallback; backend rejects new queue requests | NOT TESTED | Prepared for manual guard check. | - |
| J - Mixed continuation intent | A chooses `continue_story`, B chooses `skip` or `open`; no chat and no fake story session is created | NOT TESTED | Prepared for manual 2-device pass. | - |
| K - DM keyboard | After one real DM message sends successfully, the keyboard closes; failed send remains understandable/retryable | NOT TESTED | Prepared for manual 2-device pass. | - |
| L - Radius 5 km same place | A+B select 5 km, grant location, start Together, backend matches into `draw` if devices are actually nearby | NOT TESTED | Prepared for manual 2-device pass. | - |
| M - Radius outside range | Simulate/far-location accounts with strict radius do not match; no fake local match | NOT TESTED | Prepared for manual 2-device pass. | - |
| N - Location denied | Select any radius, deny location, no queue join, clear UI explains Together needs location and exact position is not shown | NOT TESTED | Prepared for manual pass. | - |
| O - No limit | Select no limit, grant location, backend accepts coordinates with `radiusKm:null`, UI keeps showing active waiting/countdown without premature repeated retry | NOT TESTED | Prepared for manual pass. | - |
| P - Expand to no-limit | Start finite-radius search, wait for delayed state, tap `Расширить радиус` until no-limit; backend cancels old queue row and starts no-limit with coordinates | NOT TESTED | Prepared for manual pass. | - |
| Q - No-limit staggered join | A starts no-limit with coordinates, waits 10-30 seconds, B starts no-limit with coordinates, both match without repeated retry taps | NOT TESTED | Prepared for manual pass. | - |
| R - Stuck/frozen client diagnostics | Match into draw, freeze/kill one client if safe, inspect Together Sessions for stale heartbeat/no events/left state | NOT TESTED | Prepared for manual pass. | - |
| S - BlueStacks GPS unavailable | Grant permission but leave emulator location broken; app says the device is not returning coordinates and does not join queue | NOT TESTED | Prepared for manual pass. | - |
| T - Peer media | Open peer profile after Together/DM; avatar/photos load or Client Errors show safe `urlKind`/`mediaId`/`httpStatus`/`contentType` diagnostics | NOT TESTED | Prepared for manual pass. | - |

## Staged Story Sparks Manual Checklist

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| 1. Open Together lobby | A | Lobby sells one primary path: `Начать вместе`; Story Sparks is described as after-drawing continuation; no active `Палитра настроения` CTA |  | NOT TESTED |
| 2. Choose radius | A+B | Radius selector defaults to 25 km; 5/25/100/250/no-limit choices all request location before queue |  | NOT TESTED |
| 3. Start Together | A+B | Both users enter backend `draw` matching/session using selected radius; there is no first-step choice between draw and story_sparks |  | NOT TESTED |
| 4. Finish draw | A+B | Both clients reach `PlayResult` for the same draw session |  | NOT TESTED |
| 5. Continue story | A+B | Both tap `Продолжить историю`; backend stores `continue_story` decisions |  | NOT TESTED |
| 6. Same continuation | A+B | Backend returns one `story_sparks` session id and both clients enter that same session |  | NOT TESTED |
| 7. Round 1 cards | A+B | `place` round shows exactly 3 backend-backed cards |  | NOT TESTED |
| 8. Choose round 1 | A+B | Each tap saves one backend `story_choice`; own choice locks after server success |  | NOT TESTED |
| 9. Complete rounds 2-4 | A+B | `detail`, `twist`, and `ending` repeat with backend choices |  | NOT TESTED |
| 10. Story result opens | A+B | After 4 completed rounds, both clients reach `PlayResult` with story artifact |  | NOT TESTED |
| 11. Both choose open | A+B | Backend reveal result is `open_open`; one DM thread opens |  | NOT TESTED |
| 12. DM context | A+B | DM context includes Story Sparks artifact and source draw reference when available |  | NOT TESTED |
| 13. Send DM message | A | Message sends through backend and keyboard closes after success |  | NOT TESTED |
| 14. History/detail | A+B | `PlayHistory` and detail show draw/story_sparks correctly; removed/unknown activities show unsupported fallback |  | NOT TESTED |
| 15. User exit | A or B | Leave calls backend; no fake result/reveal/chat success appears |  | NOT TESTED |
| 16. Peer leave | Peer | Remaining user sees honest interrupted state |  | NOT TESTED |

## Geo Radius Manual Checklist

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| 1. Select 5 km | A+B same place | Both grant foreground location and match into one `draw` session |  | NOT TESTED |
| 2. Select strict/far radius | A+B far/simulated | Backend keeps both waiting or expires; no fake local match |  | NOT TESTED |
| 3. Deny location | A | App shows location-required state and does not join queue in any radius mode |  | NOT TESTED |
| 4. Select no limit | A | App requests location, sends coordinates with `radiusKm:null`, and shows no exact coordinates |  | NOT TESTED |
| 5. Active no-limit waiting | A | While the no-limit queue row is still active, UI shows searching/countdown and does not encourage retry taps |  | NOT TESTED |
| 6. Staggered start | B starts 10-30 seconds later | A remains waiting, is not cancelled by lifecycle cleanup, and B can still match without simultaneous tapping |  | NOT TESTED |
| 7. Expand radius | A | After delayed search, tap `Расширить радиус`; old entry is cancelled and new queue starts with the next radius using the same safe coordinate contract |  | NOT TESTED |
| 8. Inspect responses/logs | A+B | Queue/session/history/DM do not expose peer latitude/longitude; `/admin/together/queue` shows `hasCoordinates`, `geoMode`, `waitingReason`, and age |  | NOT TESTED |
| 9. Inspect Admin Web queue | Owner/Ops | Admin Web `Очередь Together` shows status/activity/radius/hasCoordinates/geoMode/waitingReason/cancelSource/cancelReason/cancelledAt/lastAction/matchedSessionId, and no latitude/longitude columns |  | NOT TESTED |
| 10. Inspect Admin Web sessions | Owner/Ops | Admin Web `Сессии Together` shows matched/active sessions, participants, heartbeat, event counts, reveal summary, stale warnings, and no latitude/longitude/raw payload columns |  | NOT TESTED |
| 8. Continue story | A+B | Story Sparks continuation keeps same pair and does not perform a second geo match |  | NOT TESTED |

## Draw Manual Checklist

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| Login | A | Account A is authenticated against real backend |  | NOT TESTED |
| Open Together | A | Together tab loads real backend state |  | NOT TESTED |
| Start "Общий рисунок" | A | A enters `draw` queue |  | NOT TESTED |
| Login | B | Account B is authenticated against real backend |  | NOT TESTED |
| Start "Общий рисунок" | B | B enters `draw` queue and matches with A |  | NOT TESTED |
| Match | A+B | Both clients enter one `draw` session with same prompt/sessionId |  | NOT TESTED |
| A draws stroke | A -> B | B sees A stroke through real WebSocket or backend recovery |  | NOT TESTED |
| B draws stroke | B -> A | A sees B stroke through real WebSocket or backend recovery |  | NOT TESTED |
| Finish | A or B | Both clients reach Result for the same session |  | NOT TESTED |
| Continue story option | A+B | Draw result shows Open chat, Continue story, and Leave story actions |  | NOT TESTED |
| Both choose open | A+B | One DM chat opens for mutual open when both choose open |  | NOT TESTED |
| One open, one continue | A+B | Backend returns honest mixed intent/no mutual path; no chat and no fake story session |  | NOT TESTED |
| One continue, one skip | A+B | Backend returns honest mixed intent/no mutual path; no chat and no fake story session |  | NOT TESTED |
| DM context | A+B | DM source context contains Together `activity: draw` |  | NOT TESTED |
| History/detail | A+B | History shows the `draw` session and detail shows replay from backend events |  | NOT TESTED |

## Draw Tools Manual Checklist

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| Fullscreen compact topbar | A | Tap `На весь экран`; top actions stay horizontal/compact on phone, with no stacked giant buttons |  | NOT TESTED |
| Hidden tools | A | Hide `Инструменты` and confirm the canvas gets noticeably more space |  | NOT TESTED |
| Brush | A -> B | A draws with one finger; B sees the stroke from backend/WebSocket or backend refresh |  | NOT TESTED |
| Eraser | A -> B | A selects `Ластик` and erases with one finger; B sees the erased result |  | NOT TESTED |
| Backend refresh | A or B | Reload/background recovery rebuilds the erased canvas from `getSessionEvents` |  | NOT TESTED |
| Pinch zoom/pan | A | Use two fingers to zoom and pan; no stroke is created by the gesture |  | NOT TESTED |
| Secondary reset | A | Tap `Сброс`; canvas resets without changing saved stroke data |  | NOT TESTED |
| Draw while zoomed | A -> B | Stroke lands under finger and peer sees correct unwarped stroke |  | NOT TESTED |
| Move mode fallback | A | Move is secondary, not primary; if selected, drag the viewport without creating a stroke |  | NOT TESTED |
| Exit fullscreen | A | Tap compact `Выйти` or Android back; user returns to normal draw screen |  | NOT TESTED |
| Finish + replay | A+B | Finish session, open history/detail, replay preserves brush and erase effects |  | NOT TESTED |

## Removed Color Mood Guard Checklist

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Open Together lobby | Active scenario list does not show `Палитра настроения` |  | NOT TESTED |
| Force an old `color_mood` route/history row in dev | App shows “Эта старая сессия больше недоступна в текущей версии.” |  | NOT TESTED |
| Try backend queue with `activity=color_mood` | Backend returns validation error / 400 |  | NOT TESTED |
| Search release UI | No “Mood palette” / “Палитра настроения” active text appears |  | NOT TESTED |

## Found Bugs

No real 2-device bugs were observed because the manual smoke pass was not executed from this environment.

## Future Age Filter

Together age filter is planned after Together start reliability is fixed. `FlirtSettingsScreen` is not the Together age filter. Future block name: `TOGETHER-AGE-FILTER-01`.

Use this format for every bug found during the real pass:

| Bug ID | Screen | Steps | Expected | Actual | Logs |
| --- | --- | --- | --- | --- | --- |
| TOGETHER-SMOKE-001 |  |  |  |  |  |

## Final Status

Together ready for release signoff: **NO**

Reason: automated checks pass, but the required real 2-account / 2-client smoke pass has not yet been executed. Together can only be marked ready after the scenario table above is updated with real PASS/FAIL evidence from phone + emulator or two devices against the real backend.
