# iOS Smoke Plan

Date: 2026-06-09
Branch: `migration/remove-firebase-foundation`

## Readiness Snapshot

- iOS build was not run.
- `app.json` includes `platforms: ["ios", "android", "web"]`, Hermes, `expo-dev-client`, `expo-secure-store`, and `expo-notifications`.
- `ios.bundleIdentifier` is not set. A real iOS build needs the approved Apple bundle identifier before EAS build/TestFlight.
- There is no checked-in native `ios/` folder, Podfile, Info.plist, entitlements, or ATS override.
- `eas.json` has `development`, `preview`, and `production` profiles. They are generic profiles and do not define iOS-specific overrides.

## Permissions

- Photo library: configured with `NSPhotoLibraryUsageDescription`.
- Location: configured with `NSLocationWhenInUseUsageDescription`.
- Camera: no Expo camera dependency or camera use found, so no camera permission is required for current mobile flows.
- Notifications: `expo-notifications` plugin is configured. No notification permission request code was found in active mobile code during this pass.

## API And ATS

- iOS release builds should use an HTTPS backend origin, preferably the same public tunnel/domain used for smoke.
- A LAN `http://` API origin is an ATS risk on iOS because there is no `NSAppTransportSecurity` exception in `app.json`.
- Android-only `usesCleartextTraffic` does not help iOS.

## iOS Smoke Focus

1. Build/install on a real iPhone or TestFlight after setting `ios.bundleIdentifier`.
2. Start Metro with a fresh cache and HTTPS API/WS env values.
3. Login and signup: verify keyboard, password manager suggestions, and localized auth errors.
4. Nearby and Together location: allow, deny, and blocked-permission paths.
5. Avatar and public photo: select from photo library, use the in-app cropper, preview, upload, restart, and verify persistence.
6. Locked gallery: unlock, render authenticated images, and verify the `FileSystem.downloadAsync` fallback path if `Image` header rendering fails.
7. DM chat: verify keyboard composer with `KeyboardProvider` and `KeyboardStickyView`, multiline input, send, retry failed send, and back navigation.
8. Notifications: verify no unexpected prompt appears unless a notification feature explicitly requests it.

## Tooling Notes

- `expo-doctor` completed, but reported an Expo API timeout for the config schema check and patch-version drift in several Expo SDK 54 packages.
- Before the real iOS build, run `npx expo install --check` and decide whether to apply the recommended patch updates.

## Test Environment

- BlueStacks cannot test iOS. It can only cover Android behavior.
- Real iOS confidence requires EAS iOS build plus real iPhone install or TestFlight.

## Exact Next Step

Set the approved `ios.bundleIdentifier`, choose an HTTPS `EXPO_PUBLIC_API_URL` and matching `EXPO_PUBLIC_WS_URL`, then run an EAS iOS development or preview build for real-device smoke.
