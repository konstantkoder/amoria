# Together Smoke Pass

Updated: 2026-05-30

## Required Geo Pass

1. Device A and Device B sign in to real backend accounts.
2. Both grant foreground location.
3. Both set private birth date in Profile/Edit Profile.
4. Both start Together with `25 km` and `Любой 18+`.
5. Start Device A first, wait 10-30 seconds, then start Device B. They should still match when compatible.
6. If no match after the delayed guidance, expand to `100 km`, then `250 km`, then no limit.
7. Confirm no-limit sends coordinates with `radiusKm: null`.
8. Confirm permission denied blocks queue join and shows a clear privacy message.
9. In BlueStacks, set emulator location and open Google Maps before retrying if the app says the device is not returning coordinates.
10. Confirm exact coordinates are absent from UI, client errors, admin responses, history, DM, and public profile.

## Cancel Lifecycle Pass

- Device A must remain `waiting` while Device B joins 10-30 seconds later.
- Normal re-render, focus/blur, remount, and temporary backgrounding must not cancel the queue row.
- Active waiting UI primary action is `Остановить поиск` / `Stop search`.
- Radius expansion must be confirmed and should cancel the old row with `cancelSource=radius_expansion`.
- Stop/start-over should cancel with `cancelSource=retry_restart`.
- Manual stop/back should cancel with `cancelSource=user_stop` or `user_back`.
- A backend expiry should become `status=expired`, not `status=cancelled`.
- If a row cancels before match, Admin Queue must show `cancelSource`, `cancelReason`, `cancelledAt`, and `lastAction`.

## Draw Tools Pass

- In one real backend `draw` session, draw with brush and confirm peer sees the stroke.
- Switch to eraser, erase part of the drawing, and confirm peer sees the erased result.
- Reload/background one client and confirm `getSessionEvents` hydration restores brush and erase strokes.
- Enter fullscreen/focus mode and hide the tool palette so the canvas visibly gets more phone space.
- Draw/erase with one finger.
- Pinch zoom and two-finger pan; saved strokes must land under the finger and remain undistorted.
- Confirm Move and Reset are not visible in the normal drawer; use two-finger pan/zoom for viewport movement.
- Android back should hide tools first, exit fullscreen second, and never trap the user.
- Finish the session and confirm history/detail replay preserves eraser effects.

## Admin Checks

- Queue: status, activity, radius, `hasCoordinates`, `geoMode`, `userAgeGroup`, `preferredAgeRange`, `waitingReason`, `cancelSource`, `cancelReason`, `cancelledAt`, `lastAction`, waiting age, safe identity, stale state, matched session link, cancel waiting action.
- Sessions: active, finished, abandoned/cancelled/recent sessions, zero-event sessions, stale heartbeat, participant left state, event counts, reveal summary.
- Client Errors: location read failures, queue join failures, queue poll failures, canvas/session diagnostics.
- Client Errors: confirm app/build metadata includes `appVersion`, `buildNumber`, and release metadata when public Expo release env vars were set.
- Audit: queue reads/cancels, session reads, media/report actions.
- Ops Health: DB status, object storage status, open client errors, reports, pending media.

## Age Filter Pass

- Missing birth date blocks Together start and prompts profile completion.
- `Любой 18+` matches compatible adults.
- A compatible age group, for example `25-34`, matches only if mutual preferences allow it.
- An incompatible age group keeps the row waiting and Admin Queue shows `age_mismatch`.
- Public profile and Admin Queue show safe age/ageGroup only; exact birth date must not appear.
- Old Flirt 18+ toggle is removed from active release UI and is not used for Together matching.

## Profile Anketa Pass

- Fill `О себе`, `Цель`, `Настроение`, and `Интересы` in Edit Profile.
- Save must call backend and refresh profile from backend.
- Restart the app and confirm saved anketa fields persist.
- Peer profile must show safe `ageGroup`, `about`, `goal`, `mood`, `interests`, avatar, and public photos.
- Peer profile must not show exact `birthDate`, exact coordinates, private preferences, or locked-gallery content without unlock.
- Try too many/too long/empty/coordinate-like interests and confirm backend rejects them without storing local-only success.
- Together lobby should show radius, age filter, and profile interest count.
- Together must still start without interests and must not require interest overlap.

## Expected Waiting UX

Search should not fall to no-match/retry after 2-3 seconds. It should show:

- `Ищем человека...`
- queue active-until time;
- `Можно подождать или остановить поиск`;
- temporary connection retrying message if polling fails.

Delayed guidance appears after about 90 seconds while polling continues. Retry/start-over is not the primary action for an active waiting row.

## Peer Media Check

After mutual open, open the peer profile from Together/DM context:

- avatar should render when `hasAvatarUrl=true`;
- public photos should render when `photoCount>0`;
- Client Errors should include safe `urlKind`, `mediaId`, `httpStatus`, and `contentType` if image loading fails;
- diagnostics should retain safe `hasAvatarUrl` and `photoCount`;
- locked gallery photos must remain hidden unless unlocked by user password.

Admin Media smoke:

- thumbnails render in Media Moderation;
- `Открыть фото` opens the real image;
- `Проверить URL` returns HTTP 200 and an image content type for allowed public avatar/profile media;
- failed thumbnails show media id, moderation status, MIME, and HTTP diagnostic instead of only a broken image icon.

## Build Verification

Before smoke, verify the tester is running the current build:

```bash
npx expo start -c
```

Set `EXPO_PUBLIC_RELEASE_VERSION` for the smoke build when an exact Git SHA is not injected automatically. If `app.json` native flags changed, for example Android `usesCleartextTraffic`, rebuild/reinstall the dev/native build; a JS reload is not enough.

## Future Nearby Reuse

Future Nearby redesign should reuse `birthDate`/`ageGroup`, `preferredAgeRange`, `interests`, `goal`, `mood`, and geolocation/radius from this profile/search model. Do not create separate Nearby profile fields or matching in this block. Announcements are not part of this architecture.

## Staged Flow

The release flow remains:

```text
draw -> continue_story -> story_sparks -> open/skip
```

Story Sparks continuation keeps the matched pair and does not run a second geo match.

## Result

Automated checks can verify validation and contracts. A release signoff still needs a real two-client pass against the release backend; no mock/stub/fake data counts.
