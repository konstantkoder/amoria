# Profile Age Matching

Updated: 2026-05-31

## Data Model

Private profile:

- `birthDate`
- `preferredAgeMin`
- `preferredAgeMax`

Safe computed/profile fields:

- self profile: `age`, `ageGroup`;
- public profile: `ageGroup`;
- public anketa: `about`, `goal`, `mood`, `interests`;
- Admin Queue: `userAgeGroup`, `preferredAgeRange`.

Exact birth date is private and must not be shown to peers or Admin Queue.

## Validation

Backend rejects:

- missing birth date before Together queue join;
- under-18 users;
- future date;
- unreasonable profile age.

Backend also validates preferred age range bounds and rejects invalid ranges.

Mobile Edit Profile collects private `birthDate` through separate day/month/year numeric fields, then submits backend ISO `YYYY-MM-DD`. Mobile may show friendly missing/invalid/future/under-18/year messages before submit, but backend validation remains authoritative for persisted profile data and Together admission.

## Public Profile

Peers may see `ageGroup` and safe anketa fields only. Exact `birthDate`, exact self-only `age`, and private age preferences are not public.

## Legacy 18 Toggle

The old standalone `allowAdultMode` / `flirtEnabled` fields are deprecated compatibility fields only.

They are not age verification and must not be used for Together admission, Together matching, Admin Queue age diagnostics, or future Nearby age matching. Active release UI no longer exposes the legacy `18+` / `Flirt` toggle.

## Client Errors

Client error metadata redacts DOB-like keys (`birthDate`, `birth_date`, `dateOfBirth`, `dob`). Safe reports may include age filter min/max and whether a profile age is present, but never exact DOB.

## Nearby Note

Nearby should reuse this profile/search model in a future redesign, including `interests`, `goal`, and `mood`. Do not add a separate age model or Nearby-only profile fields. Announcements are excluded.
