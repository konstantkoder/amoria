# Media Moderation Policy

Updated: 2026-05-23 after `ADMIN-OPS-05`

This is a technical release policy for engineering and ops. It is not final legal policy.

## Release MVP

- Avatar uploads should be reviewed for safety. A real automated provider is not configured yet, so new uploads enter manual review.
- Public profile photos should primarily be person/profile-appropriate images. Non-person images can be allowed, restricted, or rejected by moderator judgment until product policy is finalized.
- Locked gallery photos remain private, but password protection does not bypass safety moderation.
- Manual moderation is the production MVP until a real automated provider is connected.

## Disallowed Content

Reject or restrict media that contains:

- explicit sexual content;
- violence, gore, or graphic injury;
- sexualized minors or suspected child sexual exploitation;
- illegal content;
- spam, scams, impersonation, or QR/payment bait;
- visible private documents, credentials, tokens, addresses, phone numbers, or other sensitive private information.

## Automated Provider Rule

The backend has a provider interface, but `NOT_CONFIGURED` is not a moderation decision. It must not approve media, mark media safe, or pretend a scan happened.

If no real provider is configured, uploaded media remains `pending_review` / `needs_manual_review` and is visible in Admin Web Media Moderation.

Before public beta, choose one of:

- connect a real image moderation/person-detection provider and test it with audited failure behavior;
- staff a manual moderation process with clear SLA and escalation.

## Manual Actions

Admin Web supports audited actions:

- approve;
- reject/remove;
- mark under review;
- restrict public visibility when policy requires it.

Reject and restrict require a reason. Locked-gallery review requires owner/moderator role plus a reason.

