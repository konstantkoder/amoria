# Media Moderation Policy

Updated: 2026-08-09 for the Amoria 1.0 release candidate

This is a release engineering policy, not final legal policy.

## MVP Policy

- Avatars should be profile-appropriate and safety-reviewed.
- Public profile photos should primarily be person/profile-appropriate images.
- Locked-gallery photos remain subject to policy, but content is manually reviewable only by an
  owner/moderator through the reason-gated, audited admin access path. Automatic jobs must never
  read locked-gallery bytes.
- Avatars and public profile photos are screened by the self-hosted OpenNSFW ONNX CPU worker.

## Disallow

- explicit sexual content;
- violence/gore;
- sexualized minors or suspected child sexual exploitation;
- illegal content;
- scams/spam/impersonation;
- visible private documents, credentials, tokens, addresses, phone numbers, or other sensitive private information.

## Automated policy

The raw NSFW probability and the release policy are separate. Policy
`amoria_public_photo_v1` approves at or below `0.20`, restricts at or above `0.80`, and sends the
middle range to human review. Thresholds are configurable, with startup validation that the
approve boundary is below the restrict boundary.

This first model only supports pornographic-content classification. Person detection and violence
are recorded as `unknown`; the system does not fabricate unsupported results. Automated decisions
never physically delete content.

