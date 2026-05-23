# Media Moderation Policy

Updated: 2026-05-23 after `ADMIN-OPS-05`

This is a release engineering policy, not final legal policy.

## MVP Policy

- Avatars should be profile-appropriate and safety-reviewed.
- Public profile photos should primarily be person/profile-appropriate images.
- Locked-gallery photos still require safety moderation; password protection does not bypass policy.
- Manual moderation is the MVP until a real automated provider is configured.

## Disallow

- explicit sexual content;
- violence/gore;
- sexualized minors or suspected child sexual exploitation;
- illegal content;
- scams/spam/impersonation;
- visible private documents, credentials, tokens, addresses, phone numbers, or other sensitive private information.

## Automated Provider

The provider interface exists, but `NOT_CONFIGURED` never auto-approves and never claims a real scan. It leaves media in manual review.

Before public beta, either connect and test a real provider or staff a manual moderation process.

