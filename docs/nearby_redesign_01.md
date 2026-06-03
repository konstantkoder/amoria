# Nearby Redesign 01

Updated: 2026-06-03

## Product Direction

Future Nearby should show real opted-in nearby profiles using compact grid/list cards. It should not be a full-screen photo feed. Photos should appear as thumbnails or small previews inside profile cards, with profile context visible around them.

This document describes the future UI direction only. The current block implements backend foundation and does not redesign mobile Nearby.

## Backend Contract

Future Nearby UI should use:

- `GET /nearby/me`
- `PUT /nearby/me/visibility`
- `PATCH /nearby/me/status`
- `GET /nearby/feed`

The feed returns real profile cards from opted-in users only. It never returns exact coordinates, exact birth dates, exact distances, locked media, object keys, signed URLs, or fake profiles.

## Card Model

Profile cards should render the fields returned by `GET /nearby/feed`:

- display name
- avatar
- coarse age group
- coarse distance bucket
- goal, mood, and interests
- public photo previews
- short Nearby status and status kind
- message availability

The UI should keep the card compact enough for scanning and comparison. It should not imply that Nearby is final until the redesign is implemented and smoke-tested.

## Reused Safety Inputs

Nearby reuses existing profile and safety infrastructure:

- private `birthDate` for computed `ageGroup`
- preferred age range for mutual age matching
- `gender` and `preferredGenders` for mutual preference matching
- safety block lists
- public profile media filtering
- server-side geolocation/radius visibility

Do not create separate Nearby-only age logic, duplicate profile fields, or local-only feed state.

## Legacy Compatibility

Legacy short Nearby statuses remain available under `/nearby/statuses` endpoints while the profile-card feed becomes the main `/nearby/feed` contract. The future UI should target profile cards, not the deprecated status feed.
