# Together Story Sparks

Updated: 2026-05-20

## Release Contract

Story Sparks is the active second Together scenario for this release.

- Active Together lobby scenarios: `draw`, `story_sparks`.
- Legacy activity: `color_mood`.
- Legacy `color_mood` sessions and history stay readable, but the release UI must not create new `color_mood` sessions.
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

Matching is activity-isolated. `story_sparks` users only match with other `story_sparks` users and never with `draw` or `color_mood`.

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

1. Together lobby shows `Общий рисунок` and `История на двоих`.
2. Tapping Story Sparks opens `PlayMatch` with `activity: "story_sparks"`.
3. Matching routes to `PlayStorySparks`.
4. `PlayStorySparks` loads the session and backend story pack, hydrates events, subscribes to Together WebSocket updates, and polls backend events as recovery.
5. The user picks one of three cards in each of four rounds.
6. The selected card is locked only after backend event success.
7. Peer choice reveal is based on backend events.
8. After all four rounds have both choices, the session is finished and the app routes to `PlayResult`.
9. Leave/peer leave shows an interrupted state and does not fake result, reveal, or chat success.

## Result, History, Detail, DM

Story artifact data is derived from backend events and the backend story pack.

Result shows:

- localized story title,
- localized deterministic summary,
- four rounds,
- both users' selected cards for every completed round.

Reveal/open behavior is unchanged:

- `open_open` creates or opens one DM thread,
- `open_skip` and `skip_skip` do not create fake chat,
- reveal state stays backend-backed.

History shows `story_sparks` entries with the label `История на двоих` and a story artifact preview. It does not render Story Sparks as canvas replay.

Session detail renders a story card/detail for `story_sparks`, existing canvas replay for `draw`, and legacy palette display for `color_mood`.

DM source context for `story_sparks` includes:

- `activity: "story_sparks"`,
- `storyTitle`,
- `summary`,
- selected cards / story artifact preview.

DM chat shows a context card equivalent to `Вы собрали историю на двоих` with the story title/summary when available.

## Client Errors

Mobile reports release-relevant Story Sparks failures through existing client error reporting:

- failed `story_sparks` navigation,
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
| 1. Together lobby shows draw + История на двоих | No active Палитра настроения CTA | NOT TESTED |
| 2. Tap Story Sparks -> PlayMatch | `activity: story_sparks` queue starts | NOT TESTED |
| 3. Two accounts match story_sparks | Both users enter the same `story_sparks` session | NOT TESTED |
| 4. Each round shows 3 cards | Cards come from backend pack translations | NOT TESTED |
| 5. Both choose cards | Choices are saved as backend `story_choice` events | NOT TESTED |
| 6. Choices are revealed | Reveal is based on hydrated peer events | NOT TESTED |
| 7. After 4 rounds result opens | Result shows story artifact | NOT TESTED |
| 8. Both open -> one DM chat | One backend DM thread is used | NOT TESTED |
| 9. DM context shows story artifact | Context card shows Story Sparks title/summary | NOT TESTED |
| 10. History shows story_sparks | Entry uses story label and artifact preview | NOT TESTED |
| 11. Session detail shows story card | Detail does not try to render canvas | NOT TESTED |
| 12. User exit works | Backend leave happens; no fake success | NOT TESTED |
| 13. Peer leave works | Peer sees honest interrupted state | NOT TESTED |
