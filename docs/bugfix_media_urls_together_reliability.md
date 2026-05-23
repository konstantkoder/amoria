# Bugfix: Media URLs and Together Reliability

Updated: 2026-05-23 for `RELEASE-SMOKE-BLOCKERS-03`

## Canonical Media URLs

The backend public media contract is:

```text
GET /media/public/:mediaId
```

Mobile/admin responses derive public media URLs from the media id at response time. Stored absolute values in `media_files.url` are legacy/debug metadata only and must not be trusted as the public contract.

Responses should prefer relative paths:

```text
/media/public/:mediaId
```

Clients resolve those paths against the current API origin. This keeps existing old rows usable when `media_files.url` contains stale trycloudflare, localhost, MinIO, or old S3 public-base values.

Locked gallery profile photos remain blocked by `/media/public/:mediaId` unless they are public gallery items.

## Admin Together Diagnostics

Owner/ops can read:

```text
GET /admin/together/queue
GET /admin/together/sessions
```

`/admin/together/sessions` returns safe read-only diagnostics: session id, activity, status, timestamps, participant user ids/count, participant heartbeat/left timestamps, event counts, stroke/story-choice counts, reveal summary, stale heartbeat indicator, and source session id.

It does not return exact coordinates, private chat messages, locked gallery data, or raw sensitive payloads.

Audit action:

```text
admin.togetherSessions.read
```

## Together Reliability

No-limit queue joins are idempotent while an equivalent waiting row is active. Rejoining with the same no-limit search no longer cancels the active row first, so two users who arrive seconds apart can match reliably without coordinates.

Finite-radius fallback to no-limit remains a real queue change: the finite row is cancelled and a no-limit row is created.
