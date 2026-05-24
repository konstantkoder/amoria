# Together Geo Matching

Updated: 2026-05-24 for `BUGFIX-TOGETHER-GEO-REQUIRED-01`

## Product Model

Together now has a backend-backed search radius before matching:

- `5 km`
- `25 km`
- `100 km`
- `250 km`
- no limit / anywhere

The normal user-flow default is `25 km`. A stored invalid radius preference must be reset to `25 km`.

The selected radius is sent to `POST /together/queue`. AsyncStorage may remember the UI preference, but it is not the source of truth for matching.

## Queue Contract

All radius modes require foreground location before joining the queue. No-limit still sends coordinates with `radiusKm: null`.

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

No-limit mode must not omit `location`. It means "no distance cap", not "no geolocation".

Validation:

- `latitude`: `-90..90`
- `longitude`: `-180..180`
- `radiusKm`: `5`, `25`, `100`, `250`, or `null`
- every Together queue request requires both coordinates

## Matching Rule

- If both users provide coordinates and finite radius, match only when distance is within both users' limits.
- If one user chooses no limit, respect the other user's finite radius using both users' coordinates.
- If both users choose no limit, match only after both have coordinates; there is no distance cap.
- Coordinate-less old waiting rows are release-invalid and should expire/cancel instead of blocking new matching.
- Activity must still match, so `draw` does not match `story_sparks`. Removed activities such as `color_mood` are rejected by validation.

Story continuation after draw keeps the same pair and does not re-run geo matching.

## Retry Lifecycle

- The backend cancels any existing `waiting` queue row for the same user before creating a new attempt.
- Mobile radius expansion cancels the current queue entry before joining again.
- A delayed search offers `Расширить радиус` / `Остановить поиск`, instead of pushing repeated retry first.
- The no-limit expansion sends coordinates plus `radiusKm: null` and reports only safe metadata.

## Admin/Ops Observability

`GET /admin/together/queue` is available to `owner` and `ops` roles. It writes an admin audit log and returns only safe queue fields:

```text
entryId, userId, activity, status, radiusKm, hasCoordinates, geoMode, createdAt, expiresAt, matchedSessionId
```

It does not return latitude/longitude.

## Privacy Rule

Exact peer coordinates are never returned in queue, session, reveal, history, DM, or UI responses. Client error reports may include radius, permission status, and `hasCoordinates`, but not latitude/longitude.

## No-Location Behavior

If the user denies location permission, the app does not join the queue in any radius mode. It shows: `Для совместного поиска нужна геолокация. Мы не показываем точную позицию другим людям.` No fake location or local-only match is created.

## Smoke Checklist

| Step | Expected |
| --- | --- |
| Set 5 km on two clients in the same place | Both can match into `draw`. |
| Set strict radius with far/simulated locations | Users do not match. |
| Deny location permission in any radius mode | Clear UI state, no queue join, no fake match. |
| Select no limit | App still requests location, sends coordinates with `radiusKm:null`, and does not show exact coordinates. |
| Start `story_sparks` through any legacy queue path | Same radius contract is sent/respected. |
| Continue Story Sparks after draw | Same pair continues; no new geo search. |
| Inspect queue/session responses | No exact peer coordinates are exposed. |
