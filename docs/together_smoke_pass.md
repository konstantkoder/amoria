# Together Smoke Pass

Updated: 2026-05-23 for `ADMIN-OPS-05`

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

Legacy compatibility coverage:

- `color_mood` remains readable in history/session detail and supported by backend activity validation.
- `color_mood` must not appear as the active second scenario in the Together lobby and must not be the new-user CTA.

The required lifecycle is:

```text
radius choice -> draw queue -> draw session -> draw result -> continue_story/open/skip -> optional story_sparks session -> story result -> open/skip -> DM/history/detail
```

No mock, stub, fake data, Firebase fallback, or local-only success path should be accepted as passing evidence.

Geo matching rule:

- finite radius requires real foreground location;
- no-limit is the default and can match without coordinates;
- backend queue uses the selected radius and coordinates as source of truth;
- repeated retry cancels the current/old queue entry before joining again;
- exact peer coordinates must not appear in UI, logs, queue/session responses, DM, history, or detail;
- Story Sparks continuation after draw keeps the same pair and does not re-match by geo.
- Admin Web has a read-only Together Queue page for owner/ops. Use it during smoke to see activity/status/radius/hasCoordinates without exact coordinates.

## Automated Sanity Checks

These checks passed for the Story Sparks implementation, but they do not replace the required 2-device smoke pass.

| Area | Command | Result | Notes |
| --- | --- | --- | --- |
| Server typecheck | `npm run typecheck` | PASS | `tsc -p tsconfig.json --noEmit` completed with exit code 0 |
| Server tests | `npm test` | PASS | 167/167 tests passed |
| Mobile TypeScript | `npx tsc --noEmit` | PASS | Completed with exit code 0 |

Known automated-check warning: the server test run prints the existing AWS SDK future Node support warning because this shell uses Node `v18.19.1`. It did not fail tests.

## Scenario Results

| Scenario | Required Coverage | Result | Evidence / Notes | Bug ID |
| --- | --- | --- | --- | --- |
| A - Draw happy path | 2 accounts match into one `draw` session, live strokes sync, finish, mutual open, one DM chat, `activity: draw`, history/detail replay, app restart replay from backend events | NOT TESTED | Prepared for manual 2-device pass. No phone/emulator pair and account credentials are available in this Codex shell. | - |
| B - Staged Story Sparks happy path | Complete `draw`, both choose `continue_story`, both enter the same backend `story_sparks` continuation session, complete 4 rounds, mutual open creates one DM chat with draw + story context | NOT TESTED | Prepared for manual 2-device pass. No phone/emulator pair and account credentials are available in this Codex shell. | - |
| C - Draw open/skip | Complete `draw`, A opens, B skips, no mutual DM chat, honest result/history state, no chat-promise CTA | NOT TESTED | Prepared for manual 2-device pass. | - |
| D - Story Sparks open/skip | Complete `story_sparks`, A opens, B skips, no mutual DM chat, honest result/history state, story remains in history/detail | NOT TESTED | Prepared for manual 2-device pass. | - |
| E - Skip/skip | Complete either active scenario, both skip, no chat, history/detail accessible, no chat CTA appears | NOT TESTED | Prepared for manual 2-device pass. | - |
| F - Leave / abandon | Match, A leaves before finish, B sees interrupted state, reveal/chat unavailable, no success history, no infinite spinner | NOT TESTED | Prepared for manual 2-device pass. | - |
| G - Missed WebSocket recovery | Complete session, background/reload one client, result/detail recovers via `getSession` / `getSessionEvents`, no duplicate chat navigation | NOT TESTED | Prepared for manual 2-device pass. | - |
| H - Duplicate action protection | Double tap story choice/finish/open, buttons disable or backend idempotency holds, no duplicate events/thread/broken UI | NOT TESTED | Prepared for manual 2-device pass. | - |
| I - Legacy color_mood compatibility | Existing `color_mood` history/session detail remains readable, but lobby/new-user path does not offer it | NOT TESTED | Prepared for manual compatibility check. | - |
| J - Mixed continuation intent | A chooses `continue_story`, B chooses `skip` or `open`; no chat and no fake story session is created | NOT TESTED | Prepared for manual 2-device pass. | - |
| K - DM keyboard | After one real DM message sends successfully, the keyboard closes; failed send remains understandable/retryable | NOT TESTED | Prepared for manual 2-device pass. | - |
| L - Radius 5 km same place | A+B select 5 km, grant location, start Together, backend matches into `draw` if devices are actually nearby | NOT TESTED | Prepared for manual 2-device pass. | - |
| M - Radius outside range | Simulate/far-location accounts with strict radius do not match; no fake local match | NOT TESTED | Prepared for manual 2-device pass. | - |
| N - Location denied | Select finite radius, deny location, no queue join, clear UI asks to enable location or choose no limit | NOT TESTED | Prepared for manual pass. | - |
| O - No limit | Select no limit, start Together without location, backend accepts queue without coordinates | NOT TESTED | Prepared for manual pass. | - |
| P - Retry no-limit fallback | Start finite-radius search, wait for delayed state, tap `Попробовать без ограничения`, backend cancels old queue entry and starts no-limit queue | NOT TESTED | Prepared for manual pass. | - |

## Staged Story Sparks Manual Checklist

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| 1. Open Together lobby | A | Lobby sells one primary path: `Начать вместе`; Story Sparks is described as after-drawing continuation; no active `Палитра настроения` CTA |  | NOT TESTED |
| 2. Choose radius | A+B | Radius selector defaults to no limit; 5/25/100/250 km choices request location before queue |  | NOT TESTED |
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
| 14. History/detail | A+B | `PlayHistory` and detail show draw/story_sparks correctly; legacy `color_mood` remains readable |  | NOT TESTED |
| 15. User exit | A or B | Leave calls backend; no fake result/reveal/chat success appears |  | NOT TESTED |
| 16. Peer leave | Peer | Remaining user sees honest interrupted state |  | NOT TESTED |

## Geo Radius Manual Checklist

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| 1. Select 5 km | A+B same place | Both grant foreground location and match into one `draw` session |  | NOT TESTED |
| 2. Select strict/far radius | A+B far/simulated | Backend keeps both waiting or expires; no fake local match |  | NOT TESTED |
| 3. Deny location | A | App shows location-required state and does not join finite-radius queue |  | NOT TESTED |
| 4. Select no limit | A | App starts queue without requesting/using coordinates |  | NOT TESTED |
| 5. Retry stale queue | A | Tap Retry repeatedly after error/expired/cancelled state; backend has one current waiting attempt for the user and no invisible stuck queue |  | NOT TESTED |
| 6. Try no limit fallback | A | After delayed finite search, tap no-limit fallback; old entry is cancelled and new no-limit queue starts |  | NOT TESTED |
| 7. Inspect responses/logs | A+B | Queue/session/history/DM do not expose peer latitude/longitude; `/admin/together/queue` shows only `hasCoordinates` |  | NOT TESTED |
| 9. Inspect Admin Web queue | Owner/Ops | Admin Web `Очередь Together` shows current queue rows with status/activity/radius/hasCoordinates/matchedSessionId, and no latitude/longitude columns |  | NOT TESTED |
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

## Legacy Color Mood Compatibility Checklist

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Open Together lobby | Active scenario list does not show `Палитра настроения` |  | NOT TESTED |
| Open an existing `color_mood` history item | Existing palette summary remains readable |  | NOT TESTED |
| Open existing `color_mood` detail | Detail uses legacy palette display, not canvas replay |  | NOT TESTED |
| Start another from legacy color mood surfaces | New activity path routes to `story_sparks`, not new `color_mood` |  | NOT TESTED |

## Found Bugs

No real 2-device bugs were observed because the manual smoke pass was not executed from this environment.

Use this format for every bug found during the real pass:

| Bug ID | Screen | Steps | Expected | Actual | Logs |
| --- | --- | --- | --- | --- | --- |
| TOGETHER-SMOKE-001 |  |  |  |  |  |

## Final Status

Together ready for release signoff: **NO**

Reason: automated checks pass, but the required real 2-account / 2-client smoke pass has not yet been executed. Together can only be marked ready after the scenario table above is updated with real PASS/FAIL evidence from phone + emulator or two devices against the real backend.
