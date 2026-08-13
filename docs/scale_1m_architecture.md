# Amoria 1M scale architecture

Status: code and tooling design target, not a production load-test result. The target is 1,000,000 registered users with a data-layout path to 5,000,000, validation at 50,000 concurrent clients, and an instance-based path to 100,000. No sharding is required at this stage. Until the non-production runs in this document are performed, all throughput, latency, memory, and connection capacity remain **NOT MEASURED**.

## Runtime boundaries

PostgreSQL is the durable source of truth. Valkey is an ephemeral fan-out bus and shared WebSocket connection-attempt limiter; clients reconnect and refetch durable state after a disconnect. Every realtime event is version 1, carries an event ID, has a bounded serialized size, and uses one of these schemas: `thread.message`, `inbox.updated`, `together.event`, `together.session.updated`, `together.reveal.updated`, `together.turn_based.updated`, or `user.access_revoked`. Events never contain credentials, precise location, or storage paths. A source API publishes once and receives through the same subscription path as peer instances. A bounded event-ID cache covers ambiguous publish acknowledgements/fallback delivery.

`AMORIA_PROCESS_ROLE=api` serves HTTP/WebSocket and subscribes to the realtime bus. `worker` runs Together, push, account-deletion and retention loops without listening publicly. `all` is the low-cost development/single-node mode. Production Compose separates API and worker. Text moderation also has a private HTTP service whose replicas each own a bounded local Python model process; API replicas no longer load the model. Photo workers claim jobs with `FOR UPDATE SKIP LOCKED`, bounded batches, retry leases and stale-running recovery, so multiple replicas are safe.

WebSockets are deliberately per-instance bounded by `WS_MAX_CONNECTIONS_PER_INSTANCE`; capacity comes from measured instances behind a WebSocket-capable load balancer, never by assuming one Node process can hold 100,000 sockets. Per-user connections use renewable Valkey sorted-set leases, so `WS_MAX_CONNECTIONS_PER_USER` applies across replicas; an API crash releases its leases by expiry. Lease heartbeats are batched, Valkey uses `noeviction`, and missing shared admission fails closed. Per-connection subscriptions, serialized events, incoming payload, and outgoing `bufferedAmount` are bounded. Slow clients receive close code 1013 and must reconnect/refetch. Suspension, deletion, password reset, and logout-all increment the durable user auth generation where appropriate and publish `user.access_revoked`, closing every matching local socket on every subscribed API replica. Access and refresh tokens are both bound to that generation, closing rotate-versus-revoke races. A bounded, batched database revalidation every `WS_ACCESS_REVALIDATION_INTERVAL_MS` is the fail-safe for an event missed during a bus outage.

## Topologies

The low-cost topology is one PostgreSQL server, one S3-compatible object store, one ephemeral Valkey, one API, one general worker, one text-moderation service, and one photo worker. `all` can combine API/general workers outside production for the lowest resource use. Persistent backups cover PostgreSQL and object storage; Valkey persistence is intentionally disabled because it is not a durable outbox.

The scale-out topology places multiple stateless API replicas behind TLS termination/load balancing; adds API replicas from observed WebSocket count, RSS, event-loop delay, in-flight and p95/p99; runs at least two general workers; scales private text-moderation and photo workers from queue depth/oldest age/latency; uses Valkey primary/replica or Sentinel according to the operator's availability target; and fronts PostgreSQL with PgBouncer transaction pooling. Object media stays in protected S3-compatible storage. Kubernetes and paid dependencies are not prerequisites.

For scale-out media delivery, set `PUBLIC_MEDIA_DELIVERY_MODE=presigned` and route the HTTPS `S3_PUBLIC_BASE_URL` to the private-bucket S3-compatible object API. The API still checks current moderation/public-gallery state, then returns a 60-second signed redirect instead of buffering image bytes. Locked media never uses that route and remains authorization-gated and proxy-only. `proxy` remains available for the low-cost single-node topology. New profile photos are normalized to WebP and capped at 1440x1440 without enlargement; a separate CDN/variant product remains optional.

## Database connection budget

Use transaction pooling and calculate, do not guess:

`DB_POOL_MAX <= floor((postgres_max_connections - admin_reserve - worker_budgets) / api_replica_count)`

Start with `DB_POOL_MAX=10`, retain at least 10 administrative/recovery connections, budget explicit pools for each worker replica, and alert on `amoria_db_pool_waiting`, pool errors and connection timeouts. Never allocate one database connection per socket. The application uses transaction-scoped advisory locks; only the standalone migration process uses a session lock, which is compatible with a direct migration connection and must not run through transaction-mode PgBouncer.

Prepared-statement stickiness is not assumed. Transactions, `SKIP LOCKED`, and transaction advisory locks are compatible with PgBouncer transaction mode. API readiness includes database, storage, SMTP state and realtime bus readiness.

## Load shedding, observability and safe labels

`API_MAX_IN_FLIGHT_REQUESTS` rejects excess work with 503 and `Retry-After: 1`. Existing abuse limits return 429 and Retry-After. WebSocket instance/user/subscription limits reject early; slow send buffers close with 1013. When Valkey is configured, a missing bus is fail-closed for connection-attempt admission and readiness.
Message sends also pass a coarse shared per-user Valkey flood gate before the durable PostgreSQL abuse evaluation. PostgreSQL evidence, idempotency, and the stricter policy decision remain authoritative. In production a missing shared limiter fails closed for message sends; in development without Valkey, the durable guard remains active.

Nearby summary counts are eventually fresh aggregate product data, not authorization state. They use a 10-second local/Valkey cache and a short distributed refresh lock; cache failure falls back to a real DB-derived refresh under a per-instance single-flight rather than returning fabricated zeroes. Authentication status and `auth_version` remain authoritative DB reads on every request. The same access-state SELECT carries `last_seen_at`; fresh presence skips the UPDATE entirely, while stale presence uses a Valkey `SET NX` heartbeat plus a bounded local fallback before the existing conditional write. Presence failure never changes an authentication decision.

The bearer-protected, internal-only `/internal/metrics` endpoint exposes Prometheus text for HTTP request count/status-class/latency/in-flight; RSS/heap/event-loop delay; DB pool total/idle/waiting/errors; WebSocket accepted/rejected/current/subscriptions/disconnects/slow clients; realtime publish/receive/errors/reconnects; chat create/send latency; Together enqueue/match/lock contention/queue depth; Nearby latency; text moderation count/latency/errors; photo/push/deletion queue depth and age; photo throughput/latency/errors; and push state processing. Labels use normalized route templates and small enums only—never user IDs, email, IP, tokens, raw URLs, thread/session IDs, or storage keys. Structured logger redaction remains enabled.

## Retention and durable truth

The retention worker deletes at most 500 rows per table per pass. Expired auth-rate and message-abuse records are disposable. Read notifications expire after `READ_NOTIFICATION_RETENTION_DAYS`; unread notifications are never deleted by this job. Terminal push deliveries and photo moderation jobs use their own conservative configurable retention. Messages remain durable product data until a separately approved product policy exists. Safety reports and admin audit logs remain under compliance policy. Account-deletion jobs remain as minimal idempotency/operational records; completed user content is removed/anonymized by the deletion workflow. Together artifacts use their existing consent, safety-hold and bounded purge workflow. Client error records require a separately approved support/compliance retention decision and therefore are not silently deleted.

## Migration safety

`0035_scale_1m.sql` is sequential and additive. It adds `users.auth_version` with a constant default (metadata-only on supported PostgreSQL versions) and validates its non-negative constraint separately. On an empty/low-volume environment, normal migration is acceptable. On an already large production database, stage equivalent `CREATE INDEX CONCURRENTLY` statements individually outside the transactional migrator, monitor replication lag/locks/disk, verify each valid index, and then record/deploy the migration under the established release procedure; the migration uses `IF NOT EXISTS` so correctly pre-staged indexes are accepted. Rollback is code-first; additive indexes may remain. Do not drop an index until the prior code is restored and query plans are verified.

`0036_scale_matching_locality.sql` is a separate additive migration; 0035 is unchanged. It adds only the live-waiting and turn-based-waiting geographic indexes used by compatibility-before-limit candidate selection. Apply the same large-table procedure: pre-stage equivalent indexes with `CREATE INDEX CONCURRENTLY` outside the transactional migrator, verify them, then deploy/record 0036. No production migration was run as part of this pass.

## Validation protocol

Use only isolated non-production infrastructure with production-like PostgreSQL, PgBouncer, Valkey, object storage and the intended instance sizes. Seed 200k, then 500k, then 1m users. Run and archive `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` at each size. Execute the scenarios in `scripts/load/README.md` at 2k, 5k, 10k, 25k and 50k concurrency; soak for at least 60 minutes at the largest safe step and 6 hours before final capacity sign-off. Run a second reconnect workload equal to 25% of steady sockets. Stop/restart workers and individual API/bus nodes while traffic continues.

Acceptance targets are p95 ordinary reads at or below 300 ms, p99 ordinary reads at or below 1 s, p95 chat send acknowledgement at or below 300 ms, p95 realtime delivery at or below 500 ms, p95 Nearby at or below 500 ms, p95 Together enqueue/match at or below 800 ms when a candidate exists, and unexpected server error rate below 0.5%. Memory must stabilize after warm-up, DB pool waiting must not remain exhausted, no hot sequential scan may examine rows in proportion to a global table, worker queues must remain bounded/recoverable, and recovery must not create duplicate durable outcomes. These are targets, not measurements.

Scale from observed headroom: keep steady CPU, memory, sockets, pool wait, bus lag and event-loop delay under 70% of the empirically established failure/shed point. A 100k path means adding measured API/bus capacity and connection budgets; it is not a claim that this code has already sustained 100k.
