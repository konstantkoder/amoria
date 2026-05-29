# Together Age Filter 01

Updated: 2026-05-29

## Contract

- `birthDate` is private profile data.
- Backend validates that a user is 18+ before Together queue join.
- Future dates and unreasonable ages are rejected.
- Exact `birthDate` is not returned in public profile, Admin Queue, Together queue/session responses, or client error metadata.
- Backend computes safe `age` for self profile and `ageGroup` for public/admin-safe surfaces.
- Age groups: `18-24`, `25-34`, `35-44`, `45-54`, `55+`.

## Together Preference

Together queue accepts `preferredAgeRange`:

```json
{
  "min": 25,
  "max": 34
}
```

Default is any adult:

```json
{
  "min": 18,
  "max": null
}
```

Matching requires mutual compatibility:

- B age is inside A preferred range;
- A age is inside B preferred range;
- both users are 18+;
- activity and geo matching still pass.

## Waiting Reasons

Admin-safe age diagnostics:

- `age_mismatch`
- `missing_user_age`
- `missing_age_preference`

These are matching diagnostics only. They are not cancellation sources.

## Mobile UX

- Profile/Edit Profile collects birth date with privacy copy.
- Together blocks start if birth date is missing and routes the user to complete profile.
- Together shows `Кого искать` with `Любой 18+`, `18-24`, `25-34`, `35-44`, `45-54`, `55+`.
- PlayMatch shows selected filter as `Возраст: ...`.
- Old `allowAdultMode` / Flirt 18+ toggle is not used for Together matching.

## Future Nearby

Future Nearby redesign should reuse:

- private `birthDate`;
- computed `ageGroup`;
- `preferredAgeRange`;
- later interests/tags/goals.

Do not create separate Nearby age logic. Announcements are not part of the future age architecture.
