# Nearby Redesign 01

Updated: 2026-06-04

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

Admin/Ops diagnostics use `GET /admin/nearby/diagnostics` for owner/ops users. The endpoint returns aggregate counts only: visibility counts, profile readiness missing-field counts, and safe feed exclusion reason codes. It does not return exact coordinates, exact `birthDate`, profile notes/text, locked gallery media, object keys, signed URLs, or per-user feed rows.

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

## Admin Diagnostics

Nearby Admin diagnostics help explain why users do or do not appear in the profile feed without exposing private data. Safe reason codes include `self`, `blocked`, `visibility_off`, `visibility_expired`, `distance_too_far`, `age_mismatch`, `gender_mismatch`, `missing_birth_date`, `missing_gender`, and `missing_preferred_genders`.

The Admin Web Ops Health page may display these counts with RU/EN labels, but it must stay aggregate-only. It must not show raw coordinates, exact date of birth, locked gallery media, raw profile text, or fake users.

## Legacy Compatibility

Legacy short Nearby statuses remain available under `/nearby/statuses` endpoints while the profile-card feed becomes the main `/nearby/feed` contract. The future UI should target profile cards, not the deprecated status feed.
