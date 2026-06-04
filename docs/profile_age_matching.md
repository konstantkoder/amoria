# Profile Age And Matching

Updated: 2026-06-04

## Mobile Contract

Profile completion for matching is backend-first. Mobile edits these fields through the existing profile save path and refreshes the profile from backend after save:

- private `birthDate`
- safe `ageGroup`
- `preferredAgeMin`
- `preferredAgeMax`
- `gender`
- `preferredGenders`

Mobile must not treat local state as saved profile success. If backend save or refresh fails, the UI must show the failure and keep the profile incomplete.

## Gender Preferences

Edit Profile exposes clear completion fields:

- `Я`: man, woman, other, or prefer not to say.
- `Кого я ищу`: women, men, everyone, and the already-supported other/nonbinary option.

Product UI must show localized labels only. It must not show internal enum names such as `man`, `woman`, or `nonbinary`.

The profile model distinguishes missing values from explicit choices:

- `gender === undefined`: field is missing and Nearby should ask for completion.
- `gender === null`: user explicitly chose not to say.
- `preferredGenders === undefined`: field is missing and Nearby should ask for completion.
- `preferredGenders === []`: user explicitly chose everyone.

## Nearby

Nearby uses backend compatibility for gender and search preferences. If `gender` or `preferredGenders` is missing, Nearby shows a profile completion card and routes to Edit Profile focused on the preference section.

Client Error diagnostics for this completion gate are safe and include only `missingField: gender` or `missingField: preferredGenders`. They must not include exact birth date, exact coordinates, raw profile text, tokens, or backend object keys.

## Together

Together matching remains unchanged by this block. Together still uses its existing age/location matching rules and is not blocked by gender preferences unless backend behavior changes separately.
