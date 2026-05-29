# Profile Age Matching

Updated: 2026-05-29

## Data Model

Private profile:

- `birthDate`
- `preferredAgeMin`
- `preferredAgeMax`

Safe computed fields:

- self profile: `age`, `ageGroup`;
- public profile: `ageGroup`;
- Admin Queue: `userAgeGroup`, `preferredAgeRange`.

Exact birth date is private and must not be shown to peers or Admin Queue.

## Validation

Backend rejects:

- missing birth date before Together queue join;
- under-18 users;
- future date;
- unreasonable profile age.

Backend also validates preferred age range bounds and rejects invalid ranges.

## Public Profile

Peers may see `ageGroup` only. Exact `birthDate` and exact self-only `age` are not public.

## Legacy 18 Toggle

The old standalone `allowAdultMode` / `flirtEnabled` fields are deprecated compatibility fields only.

They are not age verification and must not be used for Together admission, Together matching, Admin Queue age diagnostics, or future Nearby age matching. Active release UI no longer exposes the legacy `18+` / `Flirt` toggle.

## Client Errors

Client error metadata redacts DOB-like keys (`birthDate`, `birth_date`, `dateOfBirth`, `dob`). Safe reports may include age filter min/max and whether a profile age is present, but never exact DOB.

## Nearby Note

Nearby should reuse this profile/search model in a future redesign. Do not add a separate age model for Nearby. Announcements are excluded.
