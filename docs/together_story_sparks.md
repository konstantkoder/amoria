# Together Story Sparks

Updated: 2026-05-23

## Release Contract

Story Sparks is the active optional second stage for this release.

- Active Together lobby entry: `draw`.
- Story Sparks is not a separate equal lobby choice anymore.
- After a completed `draw`, users can mutually choose `continue_story` to open a real `story_sparks` continuation session for the same pair.
- Legacy activity: `color_mood`.
- Legacy `color_mood` sessions and history stay readable, but the release UI must not create new `color_mood` sessions. `PlayColorMoodScreen` remains routeable only for old active session recovery.
- No mock/stub/fake data, Firebase fallback, local-only success, AI generation, free text input, adult-first content, or reward/gambling mechanics.

## Activity

Backend activity name:

```text
story_sparks
```

`TogetherActivity` includes:

- `draw`
- `color_mood` for legacy compatibility
- `story_sparks`

Lobby matching starts with `draw`. `story_sparks` sessions can still exist as real backend sessions, but the release UI enters them from the post-draw continuation decision instead of presenting Story Sparks as an equal first choice.

## Backend Content Model

Story content is curated server-side static data, attached to Story Sparks sessions through the session DTO. The MVP pack is:

```text
packId: first_sparks_v1
version: 1
rounds: place, detail, twist, ending
cards per round: 3
locales: ru, en, hr
```

Each card has:

```json
{
  "id": "night_train",
  "round": "place",
  "emoji": "🚆",
  "title": {
    "ru": "ночной поезд",
    "en": "night train",
    "hr": "noćni vlak"
  },
  "subtitle": {
    "ru": "Вагон, где незнакомцы говорят тише обычного.",
    "en": "A carriage where strangers speak softer than usual.",
    "hr": "Vagon u kojem neznanci govore tiše nego inače."
  },
  "toneTags": ["quiet", "travel"]
}
```

The first pack contains:

- `place`: night train, small cafe, rooftop after rain.
- `detail`: lost key, old camera, unsigned note.
- `twist`: lights went out, recognized melody, door opened itself.
- `ending`: meet again, all a joke, story began.

The mobile client renders server translations using the current locale. English fallback is allowed only as a display fallback when a locale is missing; RU, EN, and HR are filled in the shipped pack.

## Events

Story choices use the existing Together event system with event type:

```text
story_choice
```

Payload:

```json
{
  "roundId": "place",
  "cardId": "night_train",
  "packId": "first_sparks_v1",
  "clientRoundIndex": 0
}
```

Rules:

- `story_choice` is accepted only for `story_sparks` sessions.
- A user can submit at most one choice per round.
- Re-sending the same choice for the same user and round is idempotent.
- Sending a different card for an already chosen round is rejected.
- Choices are persisted as `together_events`.
- `GET /together/sessions/:id/events` remains the source for event hydration and replay.
- Non-members cannot read story session events.

## Mobile Flow

1. Together lobby sells one primary path: `Начать вместе` / `Start Together`.
2. The primary CTA opens `PlayMatch` with `activity: "draw"`.
3. Story Sparks is shown as the second stage: after drawing, users can continue with `История на двоих` / `Story Sparks`.
4. After `draw` result, the user can choose open chat, continue story, or leave the drawing as a story.
5. Only mutual `continue_story` opens `PlayStorySparks` with the backend-created continuation session id.
6. `PlayStorySparks` loads the session and backend story pack, hydrates events, subscribes to Together WebSocket updates, and polls backend events as recovery.
7. The user picks one of three cards in each of four rounds.
8. The selected card is locked only after backend event success.
9. Peer choice reveal is based on backend events.
10. After all four rounds have both choices, the story session is finished and the app routes to `PlayResult`.
11. The Story Sparks result uses the normal final reveal flow: open chat or leave story.
12. Leave/peer leave shows an interrupted state and does not fake result, reveal, or chat success.

## Result, History, Detail, DM

Story artifact data is derived from backend events and the backend story pack.

Result shows:

- localized story title,
- localized deterministic summary,
- four rounds,
- both users' selected cards for every completed round.

Reveal/open behavior is staged:

- `draw` supports `open`, `skip`, and `continue_story`.
- `story_sparks` supports final `open` and `skip`.
- `open_open` creates or opens one DM thread.
- `continue_story` + `continue_story` creates or reuses one backend `story_sparks` continuation session.
- `open_skip`, `skip_skip`, and `mixed_intent` do not create fake chat.
- reveal state stays backend-backed.

History shows `story_sparks` entries with the label `История на двоих` and a story artifact preview. It does not render Story Sparks as canvas replay.

Session detail renders a story card/detail for `story_sparks`, existing canvas replay for `draw`, and legacy palette display for `color_mood`.

DM source context for `story_sparks` includes:

- `activity: "story_sparks"`,
- the previous/source draw session reference when the story came from staged continuation,
- `storyTitle`,
- `summary`,
- selected cards / story artifact preview.

DM chat shows a context card equivalent to `Вы собрали историю на двоих` with the story title/summary when available.

## Client Errors

Mobile reports release-relevant Story Sparks failures through existing client error reporting:

- failed `story_sparks` navigation,
- failed `continue_story` decision,
- failed next story session creation,
- invalid continuation outcome,
- failed story choice send,
- invalid story pack,
- missing story cards,
- peer/event hydrate failure,
- failed finish/navigation,
- leave failure.

Reports must remain sanitized: no secrets, auth tokens, signed URLs, passwords, or full raw request bodies.

## Manual Smoke Checklist

| Step | Expected Result | Status |
| --- | --- | --- |
| 1. Start Together -> draw | Lobby primary CTA opens `PlayMatch` with `activity: draw` | NOT TESTED |
| 2. Finish draw | Both users reach draw result | NOT TESTED |
| 3. Both choose continue story | Backend reveal result becomes `continue_story` | NOT TESTED |
| 4. Same Story Sparks session | Both clients enter the same backend `story_sparks` continuation session | NOT TESTED |
| 5. Complete story | Choices are backend `story_choice` events and result shows story artifact | NOT TESTED |
| 6. Both open | One backend DM thread is used | NOT TESTED |
| 7. DM keyboard | Keyboard closes after successful message send | NOT TESTED |
| 8. History/detail | `draw`, `story_sparks`, and legacy `color_mood` remain readable | NOT TESTED |
