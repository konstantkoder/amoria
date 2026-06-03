# Nearby Redesign 01

Updated: 2026-06-03

## Mobile Contract

Mobile Nearby uses the real backend profile feed:

- `GET /nearby/me`
- `PUT /nearby/me/visibility`
- `PATCH /nearby/me/status`
- `GET /nearby/feed`

The screen must not create fake users, local-only profile cards, or local-only success states. Visibility and feed data come from the backend.

## UI Direction

Nearby is a compact profile-card surface, not a full-screen photo feed.

- The first screen shows `Рядом` and short copy about people nearby who are open to meeting.
- Visibility is controlled by `Показывать меня в Рядом`.
- Cards use a two-column compact grid on normal phone widths when readable, falling back to a compact single-column list only on very narrow screens.
- Avatar and public photos are thumbnails/previews inside cards.
- Cards are small anketa previews: name, age group, distance bucket, one compact goal/mood/status line, 2-3 interests, and small `Открыть` / `Написать` actions.
- Large full-screen photo cards are not part of the feed.

## Filters

- Radius is selected in chips and refreshed through backend visibility updates.
- Radius refresh is debounced so fast `25 km` / `100 km` switching does not flash stale feed state or rapidly send duplicate requests.
- Age filter is visible in Nearby: `Любой 18+`, `18-24`, `25-34`, `35-44`, `45-54`, `55+`.
- Age filter is saved through the existing profile preferred-age fields and then applied by backend feed matching.
- Gender preference uses existing profile `preferredGenders`; no local-only filtering is used.

## Privacy

Mobile must not show:

- exact coordinates
- exact birth date
- exact distance
- locked gallery media
- object keys
- signed URLs

Location is requested only when enabling visibility or refreshing the active feed. Feed cards show coarse `distanceBucket` labels only.

## Empty States

Nearby distinguishes:

- visibility off
- location permission needed
- profile setup needed
- no people nearby
- radius too narrow

When visibility is off, the screen prompts the user to enable visibility instead of showing identifiable feed cards.

## Profile And Message Actions

- `Открыть` opens the existing `UserProfile` route with Nearby source context.
- `Написать` opens a real direct thread through the existing chat API with `source.type = nearby`.
- Report/hide remains future work unless a real backend-backed action already exists.
