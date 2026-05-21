# Together Geo Matching

Updated: 2026-05-21 for `TOGETHER-GEO-01`

## Product Model

Together now has a backend-backed search radius before matching:

- `5 km`
- `25 km`
- `100 km`
- `250 km`
- no limit / anywhere

The selected radius is sent to `POST /together/queue`. AsyncStorage may remember the UI preference, but it is not the source of truth for matching.

## Queue Contract

Finite radius modes require foreground location:

```json
{
  "activity": "draw",
  "location": {
    "latitude": 52.2297,
    "longitude": 21.0122,
    "radiusKm": 25
  }
}
```

No-limit mode may omit `location`.

Validation:

- `latitude`: `-90..90`
- `longitude`: `-180..180`
- `radiusKm`: `5`, `25`, `100`, `250`, or `null`
- finite `radiusKm` requires both coordinates

## Matching Rule

- If both users provide coordinates and finite radius, match only when distance is within both users' limits.
- If one user chooses no limit but provides coordinates, respect the other user's finite radius.
- If coordinates are missing, match only when both users are in no-limit mode.
- Activity must still match, so `draw` does not match `story_sparks` or legacy `color_mood`.

Story continuation after draw keeps the same pair and does not re-run geo matching.

## Privacy Rule

Exact peer coordinates are never returned in queue, session, reveal, history, DM, or UI responses. Client error reports may include radius, permission status, and `hasCoordinates`, but not latitude/longitude.

## No-Location Behavior

If the user selects a finite radius and denies location permission, the app does not join the queue. It shows a clear message and asks the user to choose no limit or enable location. No fake location or local-only match is created.

## Smoke Checklist

| Step | Expected |
| --- | --- |
| Set 5 km on two clients in the same place | Both can match into `draw`. |
| Set strict radius with far/simulated locations | Users do not match. |
| Deny location permission in finite radius mode | Clear UI state, no queue join, no fake match. |
| Select no limit | Queue can start without location. |
| Start `story_sparks` through any legacy queue path | Same radius contract is sent/respected. |
| Continue Story Sparks after draw | Same pair continues; no new geo search. |
| Inspect queue/session responses | No exact peer coordinates are exposed. |
