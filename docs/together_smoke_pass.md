# Together Smoke Pass

## Run Metadata

| Field | Value |
| --- | --- |
| Test date/time | 2026-05-13 18:43:51 CEST |
| Backend URL used | Configured target: `https://revelation-claire-filter-losing.trycloudflare.com` |
| WebSocket URL used | Configured target: `wss://revelation-claire-filter-losing.trycloudflare.com/ws` |
| Mobile build/dev client used | NOT TESTED - requires tester to fill exact Expo/dev-client/build identifier |
| Device A | NOT TESTED - requires phone/emulator assignment |
| Device B | NOT TESTED - requires second phone/emulator assignment |
| Account A identifier | NOT TESTED - enter email/Amoria ID only, no password |
| Account B identifier | NOT TESTED - enter email/Amoria ID only, no password |
| Execution owner | Codex prepared checklist and ran automated checks; real 2-device pass not executed from this shell |

## Scope

This smoke pass covers the Together release lifecycle for both supported scenarios:

- `draw`
- `color_mood`

The required lifecycle is:

`queue -> match -> session -> finish/leave/disconnect -> result -> reveal -> DM -> history/detail`

No mock, stub, fake data, Firebase fallback, or local-only success path should be accepted as passing evidence.

## Automated Sanity Checks

These checks passed, but they do not replace the required 2-device smoke pass.

| Area | Command | Result | Notes |
| --- | --- | --- | --- |
| Server typecheck | `npm run typecheck` | PASS | `tsc -p tsconfig.json --noEmit` completed with exit code 0 |
| Server tests | `npm test` | PASS | 90/90 tests passed |
| Mobile TypeScript | `npx tsc --noEmit` | PASS | Completed with exit code 0 |

Known automated-check warning: the server test run prints the existing AWS SDK future Node support warning because this shell uses Node `v18.19.1`. It did not fail tests.

## Scenario Results

| Scenario | Required Coverage | Result | Evidence / Notes | Bug ID |
| --- | --- | --- | --- | --- |
| A - Draw happy path | 2 accounts match into one `draw` session, live strokes sync, finish, mutual open, one DM chat, `activity: draw`, history/detail replay, app restart replay from backend events | NOT TESTED | Prepared for manual 2-device pass. No phone/emulator pair and account credentials are available in this Codex shell. | - |
| B - Color mood happy path | 2 accounts match into one `color_mood` session, palette events sync/recover, finish, mutual open, one DM chat, `activity: color_mood`, history/detail palette, app restart loads backend data | NOT TESTED | Prepared for manual 2-device pass. No phone/emulator pair and account credentials are available in this Codex shell. | - |
| C - Draw open/skip | Complete `draw`, A opens, B skips, no mutual DM chat, honest result/history state, no chat-promise CTA | NOT TESTED | Prepared for manual 2-device pass. | - |
| D - Color mood open/skip | Complete `color_mood`, A opens, B skips, no mutual DM chat, honest result/history state, no chat-promise CTA | NOT TESTED | Prepared for manual 2-device pass. | - |
| E - Skip/skip | Complete either scenario, both skip, no chat, history/detail accessible, no chat CTA | NOT TESTED | Prepared for manual 2-device pass. | - |
| F - Leave / abandon | Match, A leaves before finish, B sees interrupted state, reveal/chat unavailable, no success history, no infinite spinner | NOT TESTED | Prepared for manual 2-device pass. | - |
| G - Missed WebSocket recovery | Complete session, background/reload one client, result/detail recovers via `getSession` / `getSessionEvents`, no duplicate chat navigation | NOT TESTED | Prepared for manual 2-device pass. | - |
| H - Duplicate action protection | Double tap finish/open/save mood, buttons disable, no duplicate events/thread/broken UI | NOT TESTED | Prepared for manual 2-device pass. | - |
| I - Blocked state | If easy through current UI: block peer, reveal/open chat returns blocked outcome, UI does not allow chat | NOT TESTED | Prepared for manual 2-device pass. | - |

## Manual Checklist

### Scenario A - Draw Happy Path

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| Login | A | Account A is authenticated against real backend |  | NOT TESTED |
| Open Together | A | Together tab loads real backend state |  | NOT TESTED |
| Start "Общий рисунок" | A | A enters `draw` queue |  | NOT TESTED |
| Login | B | Account B is authenticated against real backend |  | NOT TESTED |
| Open Together | B | Together tab loads real backend state |  | NOT TESTED |
| Start "Общий рисунок" | B | B enters `draw` queue and matches with A |  | NOT TESTED |
| Match | A+B | Both clients enter one `draw` session with same prompt/sessionId |  | NOT TESTED |
| A draws stroke | A -> B | B sees A stroke through real WebSocket or backend recovery |  | NOT TESTED |
| B draws stroke | B -> A | A sees B stroke through real WebSocket or backend recovery |  | NOT TESTED |
| Finish | A or B | Both clients reach Result for the same session |  | NOT TESTED |
| A chooses open | A | A sees pending/waiting state, no chat yet |  | NOT TESTED |
| B chooses open | B | One DM chat opens for mutual open |  | NOT TESTED |
| DM context | A+B | DM source context contains Together `activity: draw` |  | NOT TESTED |
| Back navigation | A+B | Back goes to expected history/detail/inbox target without dead-end |  | NOT TESTED |
| History | A+B | PlayHistory shows the `draw` session and correct outcome/threadId |  | NOT TESTED |
| Detail replay | A+B | PlaySessionDetail shows replay for `draw` |  | NOT TESTED |
| Restart app | A or B | After restart, same history detail reloads replay from backend events |  | NOT TESTED |

### Scenario B - Color Mood Happy Path

| Step | Account / Device | Expected Result | Actual Result | Status |
| --- | --- | --- | --- | --- |
| Open Together | A | Together tab loads |  | NOT TESTED |
| Start "Палитра настроения" | A | A enters `color_mood` queue |  | NOT TESTED |
| Open Together | B | Together tab loads |  | NOT TESTED |
| Start "Палитра настроения" | B | B enters `color_mood` queue and matches with A |  | NOT TESTED |
| Match | A+B | Both clients enter one `color_mood` session |  | NOT TESTED |
| A chooses color | A -> B | Palette event persists and B sees or recovers state |  | NOT TESTED |
| B chooses color | B -> A | Session finishes after both backend palette events exist |  | NOT TESTED |
| Result | A+B | Both clients reach Result with palette summary |  | NOT TESTED |
| A chooses open | A | A sees pending/waiting state, no chat yet |  | NOT TESTED |
| B chooses open | B | One DM chat opens for mutual open |  | NOT TESTED |
| DM context | A+B | DM source context contains Together `activity: color_mood` |  | NOT TESTED |
| History | A+B | PlayHistory shows the `color_mood` session |  | NOT TESTED |
| Detail palette | A+B | PlaySessionDetail shows backend palette summary, not canvas replay |  | NOT TESTED |
| Restart app | A or B | History/detail reloads session and palette from backend |  | NOT TESTED |

### Scenario C - Draw Open/Skip

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Complete a `draw` session | Both clients reach Result |  | NOT TESTED |
| A chooses open | A waits for B decision, no chat yet |  | NOT TESTED |
| B chooses skip | No mutual DM chat opens |  | NOT TESTED |
| Check Result | Text says story remains / no chat |  | NOT TESTED |
| Check History | Outcome is `open_skip`, no broken chat CTA |  | NOT TESTED |

### Scenario D - Color Mood Open/Skip

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Complete a `color_mood` session | Both clients reach Result |  | NOT TESTED |
| A chooses open | A waits for B decision, no chat yet |  | NOT TESTED |
| B chooses skip | No mutual DM chat opens |  | NOT TESTED |
| Check Result | Text says story remains / no chat |  | NOT TESTED |
| Check History | Outcome is `open_skip`, no broken chat CTA |  | NOT TESTED |

### Scenario E - Skip/Skip

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Complete `draw` or `color_mood` | Both clients reach Result |  | NOT TESTED |
| A chooses skip | A waits or sees saved decision |  | NOT TESTED |
| B chooses skip | Outcome is `skip_skip`, no chat opens |  | NOT TESTED |
| Check History/Detail | Story remains accessible and no chat CTA appears |  | NOT TESTED |

### Scenario F - Leave / Abandon

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| A and B match | Both are in one active Together session |  | NOT TESTED |
| A leaves before finish | Backend marks session abandoned |  | NOT TESTED |
| B observes state | B sees interrupted/abandoned state, no infinite spinner |  | NOT TESTED |
| Reveal/chat | Reveal and chat are unavailable |  | NOT TESTED |
| History | History does not pretend this was a successful completed session |  | NOT TESTED |

### Scenario G - Missed WebSocket Recovery

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Complete a session | Session is finished on backend |  | NOT TESTED |
| Background/reload one client before update | Client may miss WS event |  | NOT TESTED |
| Reopen Result/Detail | HTTP `getSession` / `getSessionEvents` recovers state |  | NOT TESTED |
| Pending reveal | Pending state eventually updates after backend refresh |  | NOT TESTED |
| Chat navigation | No duplicate DM navigation |  | NOT TESTED |

### Scenario H - Duplicate Action Protection

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Double tap finish | One finish action, no broken state |  | NOT TESTED |
| Double tap open chat | One reveal/open action, one DM thread |  | NOT TESTED |
| Double tap save mood | No duplicate palette UI corruption; backend idempotency/recovery holds |  | NOT TESTED |
| Observe buttons | Buttons disable or ignore while action is in flight |  | NOT TESTED |

### Scenario I - Blocked State

| Step | Expected Result | Actual Result | Status |
| --- | --- | --- | --- |
| Block peer before/after session if current UI allows it | Block state is stored on backend |  | NOT TESTED |
| Try reveal/open chat | Backend returns blocked outcome / no chat access |  | NOT TESTED |
| Check UI | UI does not show open-chat CTA or broken navigation |  | NOT TESTED |

## Found Bugs

No real 2-device bugs were observed because the manual smoke pass was not executed from this environment.

Use this format for every bug found during the real pass:

| Bug ID | Screen | Steps | Expected | Actual | Logs |
| --- | --- | --- | --- | --- | --- |
| TOGETHER-SMOKE-001 |  |  |  |  |  |

## Final Status

Together ready for next release area: **NO**

Reason: automated checks pass, but the required real 2-account / 2-client smoke pass has not yet been executed. Together can only be marked ready after the scenario table above is updated with real PASS/FAIL evidence from phone + emulator or two devices against the real backend.
