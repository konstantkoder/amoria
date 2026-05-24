# Bugfix: Together Start Reliability and Peer Media Diagnostics

Updated: 2026-05-24

## Together Waiting

The first user must remain in `waiting` until the backend queue row is matched, cancelled, expired, or otherwise terminal. Mobile must not turn one poll or a short network blip into no-match/retry.

Release UX:

- search stays active for about 90 seconds before the delayed guidance appears;
- backend queue TTL remains 5 minutes;
- polling continues while the row is still waiting;
- retry is not the primary active-waiting action;
- destructive restart is labeled as stop/start, not normal retry.

Two devices do not need to tap start simultaneously. A second user joining 10, 20, or 60 seconds later should still match the first user when activity and geo rules are compatible.

## Admin Diagnostics

Together Queue now includes safe fields for smoke testing:

- `amoriaId`
- `displayName`
- `ageSeconds`
- `geoMode`
- `waitingReason`
- `matchedSessionId`

`waitingReason` is derived without returning exact coordinates:

- `no_candidate`
- `activity_mismatch`
- `radius_distance_too_far`
- `missing_coordinates_old_entry`
- `same_user_excluded`
- `candidate_expired`
- `candidate_cancelled`
- `location_required`
- `unknown`

Together Sessions remains the place to verify that a matched session was created, even when zero events arrived or a client froze before canvas activity.

## BlueStacks / Device GPS

If permission is granted but the device does not return coordinates, mobile must block queue join and explain that the device/emulator GPS is the problem. For BlueStacks, set location in the emulator and open Google Maps to confirm the coordinates before retrying Together.

Client Errors for this case include safe metadata only: radius, permission status, platform/device model, and `hasCoordinates=false`.

## Peer Media

Public profile media should use `/media/public/:mediaId`. Mobile rewrites canonical media paths to the current API origin and reports safe media diagnostics when Android image loading fails:

- media id when known;
- URL kind such as `currentOrigin`, `rewritten`, `relative`, or `invalid`;
- avatar/photo counts;
- no full raw URL.

Locked gallery media remains hidden from public profile and public media routes.
