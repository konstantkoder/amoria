# Google Play Billing and invite links

Android Premium uses `expo-iap` in a native development/internal-test build. Expo Go cannot validate this path. The product ID is supplied by the server's authenticated monetization snapshot; the displayed price is `displayPrice` returned by Google Play. A successful store callback never grants local Premium: the app submits the purchase token to the server and calls `finishTransaction` only after server verification.

Restore enumerates owned Google Play purchases and submits matching subscriptions to the same server verifier with `origin=restore`. Subscription management opens the Google Play account page for package `com.kostiantyndemidets.amoria`.

Production HTTPS invite links are enabled only when `EXPO_PUBLIC_APP_LINK_HOST` is an actual public host. The host must serve the API's `/.well-known/assetlinks.json` with the real Play App Signing SHA-256 fingerprint. The custom `amoria:` scheme remains available for local fallback. Play Install Referrer and App Link input are reduced to an opaque invite/source pair and claimed after authentication; no advertising ID or contact upload is used.
