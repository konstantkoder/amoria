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
- Cards use a compact list on small screens and a two-column grid on wider screens.
- Avatar and public photos are thumbnails/previews inside cards.
- Large full-screen photo cards are not part of the feed.

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
