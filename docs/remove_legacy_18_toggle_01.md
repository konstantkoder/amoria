# Remove Legacy 18 Toggle 01

Updated: 2026-05-29

## Release Decision

The standalone legacy `18+` / `Flirt` toggle is removed from active mobile release UI.

Removed active surfaces:

- Profile `18+` badge based on `allowAdultMode`;
- Profile `Flirt 18+` settings entry;
- Edit Profile adult-mode switch;
- Settings local adult-mode switch;
- `FlirtSettingsScreen` navigation route.

## Deprecated Compatibility Fields

The existing `allowAdultMode` and `flirtEnabled` fields may remain in DB/API compatibility surfaces for now.

They are deprecated and must not be used for:

- age verification;
- Together queue admission;
- Together matching;
- Admin Queue age diagnostics;
- future Nearby age matching.

No DB column drop is included in this block.

## Real Age System

The active age architecture is:

- private `birthDate`;
- backend 18+ validation;
- safe computed `ageGroup`;
- Together `preferredAgeRange`.

Exact `birthDate` remains private and must not appear in public profile, Admin Queue, peer UI, or client error metadata.

## Future Nearby

Future Nearby redesign should reuse the same profile/search age model:

- `birthDate`;
- `ageGroup`;
- `preferredAgeRange`;
- later shared interests/tags/goals.

Do not create a separate Nearby age system. Announcements are not part of the future age architecture.
