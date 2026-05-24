# Bugfix: Together Geo Required Matching

Updated: 2026-05-24

## Fixed

- New `POST /together/queue` requests require `location.latitude`, `location.longitude`, and `location.radiusKm`.
- `radiusKm: null` is no-limit with coordinates, not no-location.
- Matching rejects old waiting rows without coordinates and expires them during new matching attempts so they cannot block release matching.
- Mixed no-limit/finite matching uses the finite user's distance cap.
- Admin Queue exposes `geoMode` and never exposes exact coordinates.
- Admin Sessions exposes created, ended, abandoned/cancelled, heartbeat, participant, event-count, and reveal diagnostics without raw payloads.

## Not Changed

- Nearby was not changed.
- Announcements were not changed.
- `color_mood` was not restored.
- Matching does not use fake users or fake coordinates.
