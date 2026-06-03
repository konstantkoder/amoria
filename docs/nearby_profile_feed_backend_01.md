# Nearby Profile Feed Backend 01

Updated: 2026-06-03

## Scope

This block adds the backend foundation for a real Nearby profile feed. The feed is built from server-side opted-in profile visibility rows and public profile data. It does not use fake users, local-only users, or client-supplied feed cards.

Mobile UI redesign is not included in this block. Future Nearby UI should render compact grid/list profile cards. It should not use a full-screen photo feed. Photos should appear as small thumbnails/previews inside profile cards.

## Profile Fields

User profiles now support:

- `gender`: optional, private matching input.
- `preferredGenders`: private matching input.

These fields are available on self profile responses and profile update requests. They are not exposed on public profile responses or Nearby feed cards.

## Visibility Model

`nearby_profile_visibility` stores one row per user:

- `userId`
- `status`: `active`, `off`, or `expired`
- `latitude` and `longitude`, stored server-side only
- `radiusKm`
- `nearbyStatus`
- `statusKind`: `coffee`, `walk`, `bike`, `talk_now`, or `open_to_suggestions`
- `updatedAt`
- `expiresAt`

Active visibility requires coordinates, radius, and expiry. Off visibility clears coordinates and expiry.

## API

- `GET /nearby/me`: returns the authenticated user's safe visibility state.
- `PUT /nearby/me/visibility`: turns profile visibility on/off and updates server-side location/radius.
- `PATCH /nearby/me/status`: updates short Nearby status text/kind without changing location.
- `GET /nearby/feed`: returns real opted-in nearby profile cards.

Legacy Nearby status endpoints remain available for compatibility:

- `POST /nearby/statuses`
- `GET /nearby/statuses/feed`
- `DELETE /nearby/statuses/:id`

The legacy status feed is deprecated for the future profile-card Nearby UI.

## Feed Rules

The profile feed includes real opted-in users only. It excludes:

- self
- blocked users in either direction
- users with `off` or expired visibility
- users outside the viewer radius or outside their own radius
- users outside mutual age compatibility
- users outside mutual gender/preference compatibility

## Safe Profile Card

Each feed item returns only safe card data:

- `userId`
- `displayName`
- `avatarUrl`
- `ageGroup`
- `distanceBucket`
- `goal`
- `mood`
- `interests`
- `publicPhotos` as small previews only
- `nearbyStatus`
- `statusKind`
- `canMessage`

`distanceBucket` is coarse only: `under_1km`, `1_5km`, `5_25km`, `25_100km`, or `over_100km`.

## Privacy Guarantees

Nearby profile feed responses must not return:

- exact coordinates
- exact `birthDate`
- exact distance
- locked gallery content
- object keys
- signed URLs
- bucket names or internal storage paths
- fake users

Location is matching infrastructure. The server stores exact coordinates for active visibility, but clients and peers receive only coarse distance buckets.

## Build Impact

- EAS rebuild required: no
- Backend restart required: yes
- DB migration required: yes
- Admin web build required: no
- Metro cache clear required: no
