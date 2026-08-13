# Store identity decision record

Status: **STORE IDENTIFIER DECISION REQUIRED**

Evidence audited on 2026-08-13:

- Expo owner: `kostiantyn111`
- Expo project ID: `e719ffd9-ab8a-457c-abad-48803775dd4f`
- `eas project:info` confirms `@kostiantyn111/amoria`; remote build history contains Android development builds only and provides no approved replacement package or iOS identity.
- Current Android package: `com.anonymous.amoria` (placeholder; not evidence of an approved permanent store identity)
- iOS `bundleIdentifier`: not configured
- Repository release documentation explicitly says the Apple identifier still needs approval.
- No different canonical identifier was found in local release docs, prior checked project config, or available native/credential metadata.

The store owner must approve globally unique, permanent Android and iOS identifiers before release builds or store records are created. Once approved, each identifier must be used consistently in Expo config, EAS credentials, native capability/provisioning records, store listings, and push credentials. Changing an identifier later creates a different store application and invalidates the related push-token/credential lineage.

Do not replace either identifier with a guessed reverse-domain value. After the decision, run production-like `npx expo config --type public`, create or select the matching EAS/store credentials, then validate push on physical Android and iOS devices.
