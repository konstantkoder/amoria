# Media Moderation Policy

Updated: 2026-08-09 for the Amoria 1.0 release candidate

This is a release engineering policy, not final legal policy.

## MVP Policy

- New avatars must contain a person or receive an explicit, reasoned owner/moderator override.
- Ordinary public gallery photos may contain people, objects, places, animals, food, medicine, art,
  or other NSFW-safe content; person presence is informational for these photos.
- Locked-gallery photos remain subject to policy, but content is manually reviewable only by an
  owner/moderator through the reason-gated, audited admin access path. Automatic jobs must never
  read locked-gallery bytes.
- Avatars and public profile photos are screened by the self-hosted OpenNSFW ONNX CPU worker.
- A local YOLOX-Nano person-class plus YuNet face-presence detector records only a tri-state
  `containsPerson` signal. It performs no identity matching and creates no face embeddings.

## Disallow

- explicit sexual content;
- violence/gore;
- sexualized minors or suspected child sexual exploitation;
- illegal content;
- scams/spam/impersonation;
- visible private documents, credentials, tokens, addresses, phone numbers, or other sensitive private information.

## Automated policy

The raw NSFW probability and the release policy are separate. Policy
`amoria_public_photo_v3` approves at or below `0.20`, restricts at or above `0.95`, and sends the
middle range to human review. For a new avatar, NSFW restriction has priority; below that boundary,
`containsPerson=false` becomes `needs_review/person_not_detected` and `unknown` becomes
`needs_review/person_presence_uncertain`. Only `containsPerson=true` continues through the normal
NSFW zones. Existing active avatars are not rescanned or retroactively hidden. Thresholds are
configurable, with startup validation that the approve boundary is below the restrict boundary.

OpenNSFW only supports pornographic-content classification and does not imply person absence. The
separate presence detector returns `true`, `false`, or `unknown`; detector failure is always
`unknown`. Person presence remains informational for ordinary public gallery photos. Automatic
person absence or uncertainty never deletes content and can be overridden through a separate,
reasoned and audited owner/moderator review without rewriting the automated result. Violence
remains `unknown`. Automated decisions never physically delete content.

