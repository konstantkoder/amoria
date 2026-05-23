# Together Flow 02: Staged Story

Updated: 2026-05-21

## Active Flow

The active Together release flow is staged:

```text
draw -> optional Story Sparks -> final open/skip
```

- The Together lobby has one primary start: `Начать вместе` / `Start Together`.
- The primary start always enters `draw`.
- Story Sparks is presented as the second stage after drawing, not as a separate equal lobby choice.
- `color_mood` was removed before public release and is not an active lobby/history/detail scenario.

## Backend Model

The reveal decision enum is extended to:

```text
open | skip | continue_story
```

`continue_story` is accepted only for finished `draw` sessions.

Outcomes:

- `open_open`: create/open one real DM thread.
- `skip_skip`: no chat.
- `open_skip`: no chat.
- `continue_story`: both users chose continuation; create or reuse one backend `story_sparks` continuation session.
- `mixed_intent`: one user chose continuation and the other chose `open` or `skip`; no chat and no story session.
- `blocked`: no chat and no story session.
- `pending`: waiting for the second decision.

Continuation sessions are real `together_sessions` rows with `activity: story_sparks` and `source_session_id` pointing to the draw session. Creation is idempotent for repeated `continue_story`.

## Mobile Behavior

After a draw result, users see three actions:

- open chat,
- continue story,
- leave as story.

After Story Sparks result, users see the ordinary final actions:

- open chat,
- leave as story.

When backend returns a `story_sparks` continuation `nextSessionId`, the client navigates to `PlayStorySparks` for that session. Pending continuation does not emit client error reports.

Client Errors report:

- `continue_story` decision failure,
- next story session creation failure,
- navigation to Story Sparks failure,
- invalid continuation outcome.

## Manual Smoke Checklist

1. Start Together -> draw.
2. Finish draw.
3. Both choose continue story.
4. Both enter the same Story Sparks session.
5. Complete story.
6. Both open -> one DM.
7. Keyboard closes after sending a DM message.
8. History/detail still works for draw and Story Sparks. Removed/unknown activities show the unsupported-old-session fallback.
