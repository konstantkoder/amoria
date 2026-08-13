# Scale hot-query and process-local-state audit

All query conclusions below are code/index reviews until the guarded EXPLAIN harness is run against 200k/500k/1m datasets.

| Area | Hot path | Bound/index decision |
|---|---|---|
| Auth | user/email lookup, refresh, durable abuse | Unique user/email/token keys; scoped rate keys; expired cleanup moved out of requests into 500-row worker batches. |
| `/users/me` | primary-key user/profile | Primary key, constant row count. Media/gallery lists have product caps. |
| Nearby | summary, visibility, profile/status feeds | Active expiry index plus latitude/longitude bounding box before Haversine; antimeridian/poles handled; result prefilter max 100. Admin diagnostics aggregate globally and inspect only 500 recent sample rows, not all users/blocks. |
| Chat inbox | member threads, peer/latest/unread/contexts | Inbox list max 100; new `(user_id,thread_id)` index; one batched detail query with bounded lateral latest, unread cap 1000/thread, contexts cap 20—no per-thread DB round trips in production. |
| Chat messages | recent messages/send/read | New `(thread_id,created_at,id)` and sender index; reads bounded by API limit; idempotency unique key. Cursor pagination is deferred because current UI intentionally loads a small recent window. |
| Together queue | enqueue/match/expiry | Removed per-activity global advisory lock. Per-user transaction lock plus candidate `FOR UPDATE SKIP LOCKED LIMIT 50`; partial waiting activity index; stale cleanup `LIMIT 100 SKIP LOCKED`. |
| Together sessions/events | membership and event history | Reverse member index and session/event ordering index. Session lists/events remain API bounded. Maintenance ownership uses transaction advisory lock and bounded claim/purge batches. |
| Notifications/push | recent list, unread, delivery claims | User/created/id index, recent list max 100, read-only notification retention, push claims `SKIP LOCKED LIMIT 100`, terminal retention and queue-age metrics. |
| Media | owned/public files and moderation | S3-compatible bytes, DB metadata indexes, small profile/gallery product caps, display-sized WebP normalization, and optional short-lived signed public delivery so API replicas do not proxy bytes. Locked media remains private/proxied. Photo claim is `SKIP LOCKED`, retry/stale recovery and multiple-worker safe. |

The schema adds 10 indexes in `0035_scale_1m.sql`. The existing notification `(user_id, created_at)` index is retained instead of adding a redundant prefix-equivalent index; the bounded top-N query may sort timestamp ties by ID. No known user-facing hot path intentionally performs a global unbounded scan after this pass. The guarded EXPLAIN harness must still confirm planner choices, examined rows and buffer counts at each dataset size. If selectivity degrades in unusually dense geographic cells, the next measured optimization is coarse geo-cell bucketing or PostGIS—not application sharding.

## Process-local state inventory

| State | Classification |
|---|---|
| WebSocket objects and subscriptions | Correctly local to the owning API; cross-instance delivery/revoke comes from Valkey. |
| Realtime event dedupe | Bounded one-minute optimization only; durable truth remains PostgreSQL. |
| No-bus WebSocket attempt map | Bounded development/test fallback only. Production requires Valkey shared admission. |
| Text moderation subprocess/pending map | Owned only by private moderation service; bounded, independently replicated. |
| API in-flight counter/metrics | Per-instance by design and scraped per target. |
| Locked-gallery wrong-attempt buckets | Existing feature-local bounded-risk P2: move to shared ephemeral limiter before multi-instance locked-gallery abuse testing. Durable authorization/password verification is unchanged. |
| Email-domain caches | Cache-only; a miss/restart changes performance, not truth. |
| Worker running flags/timers | Per-process overlap guard only; database transaction locks/leases provide cross-worker correctness. |

## Deferred P2 work

- Replace the locked-gallery in-memory wrong-attempt map with the shared ephemeral limiter and add its dedicated metric.
- Add keyset cursors to chat history/inbox if product navigation grows beyond the current bounded recent windows.
- Add coarse geo cells/PostGIS only if measured dense-cell plans fail targets.
- Decide and implement approved client-error/support retention; do not delete these records implicitly.
- Add durable realtime outbox only if product requirements evolve from reconnect/refetch semantics to guaranteed event delivery.
- Validate Valkey Sentinel/failover and PgBouncer behavior on the selected deployment hosts.
