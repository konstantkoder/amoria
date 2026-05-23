# Together Geo Matching

Updated: 2026-05-23

## Queue Contract

Finite radius queue requests must include valid coordinates:

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

No-limit mode is the safe release default. It may omit `location` entirely or send `radiusKm: null`; it never requires coordinates.

## Retry Lifecycle

Every new queue attempt from the same user cancels that user's existing `waiting` row first, then creates a new attempt and tries to match. This keeps repeated retry from reusing a stale row or being blocked by the unique `waiting` constraint.

## Matching Rule

- no-limit + no-limit matches without coordinates.
- finite + finite matches only when distance satisfies both users' radiuses.
- no-limit with coordinates + finite can match if the finite user's radius is satisfied.
- no-limit without coordinates + finite does not match.
- Activity still has to match; legacy `color_mood` remains activity-compatible only for old sessions and backend compatibility.

## Privacy

Queue, session, reveal, history, and admin queue responses do not expose exact latitude/longitude. Admin queue observability returns `hasCoordinates` only.
