# Release monetization, Founder, billing, and growth

## Runtime control

`monetization_settings` is the only runtime source of truth. New databases start in `OFF`; deployment does not change the mode. The first transition to `ON` requires an owner, recent MFA step-up, an explicit confirmation flag, a reason, and an audit record. `first_monetization_enabled_at` is written with `COALESCE` and is never reset by later mode changes.

- `OFF`: Premium capabilities are open, purchases are closed.
- `TEST`: ordinary accounts remain open; listed billing testers receive real Free/Premium gates and may make real purchases.
- `ON`: entitlements gate Premium capabilities and purchases are open.
- `PAUSED`: existing verified entitlements continue; new purchases are closed.

The Founder campaign has an independent `ACTIVE`/`PAUSED` control. Founder numbers are allocated transactionally from 1 through 500 only on activation. Reservations expire after 24 hours and do not own a number. The permanent badge/number is not removed when the included 12-calendar-month Premium period ends.

## Google Play Billing

The Android client uses `expo-iap`, which is compatible with the Expo SDK 54 CNG/native-build architecture and talks directly to Google Play Billing. No subscription intermediary is used. Store price text comes from Google Play product metadata.

The client sends the product ID and purchase token to `POST /billing/google/verify`. The server calls Android Publisher `subscriptionsv2.get`, validates the configured package/product and verified lifecycle dates, and persists an idempotent subscription plus entitlement. Only after that response succeeds does the client finish/acknowledge the transaction. Purchase tokens are never logged or stored in plaintext: the lookup key is SHA-256 and the recoverable copy required for reconciliation uses AES-256-GCM.

Required secret/runtime configuration is documented in `.env.production.example`. `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64` and `BILLING_TOKEN_ENCRYPTION_KEY` belong in the deployment secret manager. `GOOGLE_PLAY_PREMIUM_PRODUCT_ID` is configuration; no store price is embedded in code.

RTDN is accepted only with a Google-signed OIDC bearer token for `GOOGLE_RTDN_AUDIENCE`, and only for the configured package. The recurring reconciliation job re-verifies stored subscriptions to follow renewals, cancellations, refunds, revocations, grace periods, holds, pauses, and expiry.

## App Links and attribution

`PUBLIC_APP_URL` is the canonical HTTPS origin for `/i/:code`. `/.well-known/assetlinks.json` stays unavailable until real production signing fingerprints are configured. Invite codes are random opaque six-character codes, with uniqueness enforced by PostgreSQL. Install attribution uses a server-HMACed installation identifier, rejects self-referral and replay, and counts successful conversion only after meaningful activation. Product analytics accepts an event allowlist and rejects sensitive metadata.

## Data lifecycle

All direct user-owned records introduced by migration `0040` use cascading foreign keys. An inviter relationship is anonymized if the inviter deletes the account; an invitee's attribution is deleted with that invitee. Premium does not bypass account status, blocks, moderation, age checks, or safety controls.
