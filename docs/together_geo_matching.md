# Together Geo Matching

Updated: 2026-05-24 for required Together location matching.

## Product Rule

Together matching requires real foreground coordinates for every new queue request.

Supported radius modes:

- `5 km`
- `25 km`
- `100 km`
- `250 km`
- no limit / `radiusKm: null`

No limit means there is no distance cap for that user. It does not mean no geolocation.

## Queue Contract

`POST /together/queue` requires:

```json
{
  "activity": "draw",
  "location": {
    "latitude": 45.815,
    "longitude": 15.9819,
    "radiusKm": 25
  }
}
```

For no-limit:

```json
{
  "activity": "story_sparks",
  "location": {
    "latitude": 45.815,
    "longitude": 15.9819,
    "radiusKm": null
  }
}
```

Validation:

- `latitude`: required number, `-90..90`
- `longitude`: required number, `-180..180`
- `radiusKm`: `5`, `25`, `100`, `250`, or `null`

## Matching Rule

- finite + finite: match only when distance is within both users' radiuses.
- no-limit + no-limit: match; coordinates are still required, no distance cap is applied.
- no-limit + finite: match only when distance is within the finite user's radius.
- Missing-coordinate waiting rows are invalid old entries and are not eligible for new matching.
- Activity still has to match. `draw` does not match `story_sparks`; removed activities such as `color_mood` are rejected.

Story Sparks continuation after draw keeps the same pair and does not re-run geo matching.

## Privacy

Exact latitude/longitude are stored only for queue matching. They are not returned in queue, session, history, DM, public profile, client error, or admin responses.

Admin queue diagnostics expose only:

- `hasCoordinates`
- `radiusKm`
- `geoMode`

`geoMode` values:

- `finite_with_location`
- `no_limit_with_location`
- `missing_location_invalid_old_entry`

## Croatia / Small Town Smoke

The intended manual pass is:

1. Both clients grant foreground location.
2. Both select `25 km`.
3. If no match, expand to `100 km`, then `250 km`, then no limit.
4. Inspect Admin Web `Очередь Together` for `radiusKm`, `hasCoordinates`, `geoMode`, status, stale state, and `matchedSessionId`.
5. Inspect Admin Web `Сессии Together` after match for created/ended status, participants, heartbeat, event counts, reveal summary, and abandoned/cancelled state.

No test should pass with fake coordinates, hardcoded coordinates, Firebase fallback, mock users, or local-only matching.
