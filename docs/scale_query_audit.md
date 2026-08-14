# Scale hot-query and process-local-state audit

The guarded EXPLAIN harness was run against 200k, 500k, and the representative 1m dataset. Final warm-plan evidence is recorded in `SCALE-1M-RUNTIME-VALIDATION-01.md`.

| Area | Hot path | Bound/index decision |
|---|---|---|
| Auth | user/email lookup, refresh, durable abuse | Unique user/email/token keys; scoped rate keys; expired cleanup moved out of requests into 500-row worker batches. |
| `/users/me` | primary-key user/profile | Primary key, constant row count. Media/gallery lists have product caps. |
| Nearby | summary, visibility, profile/status feeds | Ordinary non-polar/non-dateline reads use a 500-row point-GiST KNN candidate cap before authoritative Haversine, radius, account and block checks. Exact latitude/longitude range fallbacks preserve antimeridian/pole behavior. Admin diagnostics aggregate globally and inspect only 500 recent sample rows. |
| Chat inbox | member threads, peer/latest/unread/contexts | Inbox list max 100; new `(user_id,thread_id)` index; one batched detail query with bounded lateral latest, unread cap 1000/thread, contexts cap 20—no per-thread DB round trips in production. |
| Chat messages | recent messages/send/read | New `(thread_id,created_at,id)` and sender index; reads bounded by API limit; idempotency unique key. Cursor pagination is deferred because current UI intentionally loads a small recent window. |
| Together queue | enqueue/match/expiry | Removed per-activity global advisory lock. Mutual age, gender, block, and exact radius compatibility now run in PostgreSQL before `ORDER BY created_at,id` and `LIMIT 50`. Finite searches use an antimeridian/pole-safe bounding box before Haversine; no-limit searches split global no-limit candidates from finite candidates bounded by the 250 km product maximum. Candidate rows retain `FOR UPDATE OF together_queue SKIP LOCKED`; stale cleanup remains `LIMIT 100 SKIP LOCKED`. Migration 0036 adds the partial live waiting geo index. |
| Together turn-based | partner claim | Mutual profile and radius checks remain authoritative. Incoming finite searches are geographically bounded first; no-limit searches bypass trigonometry for no-limit candidates and bound finite-radius candidates by 250 km before exact Haversine. `FOR UPDATE OF m SKIP LOCKED` and the active-participant uniqueness constraints prevent duplicate partner claims. Migration 0036 adds the partial turn-based waiting geo index. |
| Together sessions/events | membership and event history | Reverse member index and session/event ordering index. Session lists/events remain API bounded. Maintenance ownership uses transaction advisory lock and bounded claim/purge batches. |
| Notifications/push | recent list, unread, delivery claims | User/created/id index, recent list max 100, read-only notification retention, push claims first lock at most 100 IDs before bounded payload joins, terminal retention and queue-age metrics. Measured 1M/100k-queue evidence justifies the ordered 0037 claim index. |
| Media | owned/public files and moderation | S3-compatible bytes, DB metadata indexes, small profile/gallery product caps, display-sized WebP normalization, and optional short-lived signed public delivery so API replicas do not proxy bytes. Locked media remains private/proxied. Photo claim is `SKIP LOCKED`, retry/stale recovery and multiple-worker safe. |

The schema adds 10 indexes in `0035_scale_1m.sql`, two matching indexes in `0036`, the measured push claim index in `0037`, and two Nearby KNN indexes in `0038`. The existing notification `(user_id, created_at)` index is retained instead of adding a redundant prefix-equivalent index. Nearby summary counts are DB-derived but cached through Valkey with a distributed refresh lock and per-instance single-flight, so mass app-open traffic does not multiply global counts. Auth still performs its authoritative status/version read on every request, while `last_seen_at` is durably refreshed at most once per heartbeat window. Final warm plans had no table-size-proportional sequential scan on an ordinary user request; the intentional summary refresh remained a single cached aggregate. PostGIS remains a future option if the exact polar/dateline fallback becomes a measured bottleneck.

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

For a large existing database, pre-stage the two 0036 indexes with equivalent `CREATE INDEX CONCURRENTLY` statements outside the transactional migrator, verify index validity and replication/disk headroom, then deploy/record 0036. The migration uses `IF NOT EXISTS` so correctly pre-staged indexes are accepted; 0035 remains unchanged.
