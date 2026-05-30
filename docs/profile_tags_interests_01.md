# Profile Tags Interests 01

Updated: 2026-05-30

## Goal

Release profile/anketa data is backend-backed and reused by profile, Together context, and future Nearby/recommendation work. This block does not add interest-based matching.

## Current Profile Fields

Backend-backed self profile:

- `displayName`
- `about`
- `goal`
- `mood`
- `interests`
- `avatarUrl`
- `photos`
- `birthDate`
- `age`
- `ageGroup`
- `preferredAgeMin`
- `preferredAgeMax`
- `mysteryMode`
- deprecated compatibility only: `flirtEnabled`, `allowAdultMode`

Not present as separate profile systems:

- `shortAbout`
- `bio`
- `tags`
- `hashtags`
- `lifestyle`
- `travelStyle`
- `values`
- `prompts`
- question-of-day profile fields

Use `interests` as the single tag list. Do not create a separate hashtag model for release.

## Public Fields

Safe public profile exposes:

- `id`
- `displayName`
- `amoriaId`
- `about`
- `goal`
- `mood`
- `interests`
- `ageGroup`
- public avatar and public gallery photos
- locked-gallery summary only

Public profile must not expose:

- exact `birthDate`
- exact age for peers
- exact latitude/longitude
- private age preferences
- passwords, secrets, raw client-error metadata, locked-gallery content

## Validation

`about` is trimmed, optional, and capped by `ABOUT_MAX_LENGTH`.

`goal` is nullable and restricted to the current product-compatible enum:

- `relationship`
- `dating`
- `friendship`
- `chat`
- `unsure`

`mood` is nullable and restricted to:

- `romantic`
- `playful`
- `chill`
- `curious`
- `adventurous`

`interests` are:

- array-backed in the users table;
- max `PROFILE_INTERESTS_MAX_COUNT`;
- max `PROFILE_INTEREST_MAX_LENGTH` per tag;
- trimmed, de-hashed, whitespace-collapsed, lowercased;
- deduplicated after normalization;
- rejected when empty, coordinate-like, or containing obvious private/secrets data.

Profile save errors should include safe field metadata such as `field` or `errorCode`, not the full bio/about text.

## Mobile Behavior

Profile shows `Моя анкета` / `My profile form` / `Moja anketa`.

Edit Profile edits:

- short about;
- goal;
- mood;
- interests as chips with add/remove;
- birth date and age preferences remain in the existing age architecture.

Save uses the backend profile endpoint and refreshes the profile from backend after a successful save. Failed saves keep unsaved UI state and show an error.

Peer `UserProfile` displays only safe public fields: age group, about, goal, mood, interests, avatar, and public photos. It never displays exact birth date.

## Together

Together lobby displays the selected search context:

- radius;
- age filter;
- count of interests currently present in the profile.

Together matching remains age/radius/activity/geolocation based. Interests are visible and stored for future matching, but they are not required to start Together and are not used as a hard match filter in this block.

## Future Nearby

Future Nearby redesign should reuse:

- `birthDate` / `ageGroup`;
- `preferredAgeRange`;
- `interests`;
- `goal`;
- `mood`;
- geolocation/radius;
- later question/day/travel prompts if added through the same profile model.

Do not add separate Nearby-only profile fields. Do not implement Nearby matching in this block. Announcements are not part of this future architecture.

## Release Rules

- No mock/stub/fake profile data.
- No Firebase fallback.
- No local-only profile save success.
- No legacy 18+ toggle.
- No `color_mood` runtime path.
- No interest matching until a separate tested matching block defines mutual semantics, waiting reasons, and Admin Queue diagnostics.
