# Account deletion retention contract

This contract describes the behavior implemented by `account-deletion.service.ts`. It is an engineering data-lifecycle contract, not a legal retention promise.

| Category | Action | Rationale |
| --- | --- | --- |
| Account/profile, email, credentials, avatar/profile fields | Anonymize immediately | Stop access and remove direct identity while retaining a non-login tombstone for shared-record integrity. |
| Refresh tokens, email challenges, linkable email rate-limit keys, push tokens, notifications | Delete immediately | These are account/session/device associations and are not needed after deletion. Non-linkable IP/device abuse hashes remain only for their existing bounded expiry. |
| Public/locked gallery settings and media metadata | Hide immediately; delete after object purge | Prevent exposure immediately and ensure DB cannot claim final deletion while private object cleanup is incomplete. |
| Private object-storage media | Delete with durable, idempotent retry | Object keys and completed keys remain in the deletion job only until cleanup completes; then both lists are erased. |
| Nearby visibility, exact location, statuses, room memberships and activity preferences | Delete immediately | Product state and location are personal and have no post-deletion purpose. |
| Together queue and active state | Delete/cancel immediately | The account cannot remain matchable or actionable. |
| Together authored events/reveals | Delete | User-generated content belongs to the deleting account. Other participants' content is retained. |
| Shared Together membership and direct-thread membership | Retain against anonymized tombstone | Preserve counterpart-owned shared history without exposing the deleted user's former identity. Active timestamps/state are cleared. |
| Authored chat messages | Delete | Current product deletion policy removes content authored by the deleting account. Counterpart-authored messages remain their content. |
| Blocks and announcement state/content | Delete | These are user-owned relationship/content records. |
| Safety reports and moderation evidence | Retain minimum, anonymize user references | Preserve safety review integrity while clearing reporter/owner references and direct profile identity. |
| Client error records | Retain minimum, redact | Preserve aggregate operational record while removing account, message, stack, metadata and device-linked fields. |
| Admin audit records | Retain minimum, anonymize actor context | Preserve audit chronology/action integrity while clearing the deleted admin actor, request, IP and user-agent references. Active admin accounts must first be disabled to prevent deletion from bypassing owner controls. |
| Anonymous user tombstone and completed deletion-job metadata | Retain minimum | Protect shared referential integrity and record that physical cleanup completed. Tombstone has no reusable credential or original direct identifier. |

The durable job returns `pending` while physical deletion remains outstanding. Only successful object cleanup plus final media-row removal transitions the tombstone to `deleted` and the job to `completed`.
