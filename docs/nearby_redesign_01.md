# Nearby Redesign 01

Updated: 2026-06-04

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
- Cards use a compact responsive grid: 3 columns on normal phone widths, 2 columns on narrow widths, and 1 column only on very narrow widths. The implementation uses `FlatList numColumns={columns}` with `key={columns}` so column changes remount cleanly.
- Each card has one large media surface. It tries `avatarUrl` first, then the first public `publicPhotos[0]` image if the avatar is missing or fails, then a clean initials/person placeholder.
- Cards are small anketa previews: one-line name, one-line age group plus coarse distance bucket, one compact goal/mood/status line, 1-2 tiny interests, and small `Открыть` / `Написать` actions.
- Large full-screen photo cards are not part of the feed.

## Media Loading

- Nearby card images render only through safe public media URLs.
- Relative `/media/public/:mediaId` paths are resolved against the current backend API origin before they are passed to React Native `Image`.
- Stale absolute public-media paths are rewritten to the current backend origin by the shared media URL helper.
- Locked gallery media is not used for Nearby cards.
- Avatar/photo failures report safe Client Errors:
  - `screen=NearbyHubScreen`
  - `action=loadNearbyCardMedia`
  - `step=avatarLoadFailed` or `publicPhotoLoadFailed`
  - metadata includes `userId`, optional `mediaId`, `urlKind`, optional `httpStatus`/`contentType`, `hasAvatarUrl`, and `publicPhotoCount`
- Diagnostics must not include raw URLs, exact coordinates, exact birth date, object keys, signed URLs, or locked-gallery media.

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
- `UserProfile` loads the public backend profile by id and renders avatar/public photos through the same safe public-media URL path. Failed public photos show a visible placeholder and report safe diagnostics.
- `Написать` opens a real direct thread through the existing chat API with `source.type = nearby`.
- After a successful backend DM send, the composer clears, the input blurs, and the keyboard is dismissed. Failed sends do not dismiss the keyboard or pretend success.
- Report/hide remains future work unless a real backend-backed action already exists.
