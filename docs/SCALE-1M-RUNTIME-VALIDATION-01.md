# SCALE-1M-RUNTIME-VALIDATION-01

Result: **CONDITIONAL**. The representative 1M registered-user dataset and a 10K steady WebSocket stage passed. A 16 GiB single-host generator/stack crossed the resource safety ceiling at 10K, so 25K, 50K, and the 60-minute/6-hour soaks were not run. This is not a production validation or a 50K capacity claim.

Date: 2026-08-14

Server baseline: `a4c7bf81bf3bb9d9cb0ca693b52f09711a048d59` on `release/amoria-1.0-server-rc`

Mobile baseline: `cf1651eadf77818a034b8059f5d818ef97ffdaa9` on `release/amoria-1.0-mobile-rc`

Environment: isolated `amoria-scale` Docker Compose project; loopback-only host ports; PostgreSQL, PgBouncer transaction pooling, non-persistent Valkey, MinIO, two API containers, one general worker, one text-model service, one photo worker, a fake Expo endpoint, and pinned k6 0.57.0. No production endpoint, database, token, user, push provider, or private media was used.

## Implemented hardening

- Removed global Turn-Based and live Together expiry sweeps from ordinary requests. Requests normalize only their target row; bounded `SKIP LOCKED` maintenance belongs to workers.
- Worker role no longer starts the public API. It exposes only internal liveness and bearer-protected metrics and reports health for all five loops.
- Made shared WebSocket attempt counters atomic, repaired missing TTLs, reconciled live leases after Valkey loss, separated upgraded sockets from HTTP in-flight admission, and added explicit subscription acknowledgements.
- Added Nearby stale-while-refresh summary locking. A measured dense-cell failure led to `0038` point-GiST KNN candidate bounds before exact distance/radius/block checks.
- Reordered push claims to lock at most 100 IDs before payload joins and added the measured `0037` claim-order index.
- Added guarded, idempotent representative seeding; RFC-compliant deterministic UUIDs; synthetic token/fixture generation; full EXPLAIN coverage; realistic weighted workloads; and a separate non-production scale topology.

All required hardening checks pass: cross-instance fanout, no ordinary-request global Together sweeps, private worker role, atomic shared counters, lease reconciliation, true Nearby summary stampede protection, subscription ACKs, long-lived steady sockets, token generation, Turn-Based seed, large message seed, and photo-job fixtures.

## Dataset evidence

| Stage | Profile | Result | Important cardinalities | Elapsed / size |
|---|---|---:|---|---|
| 200K | light | PASS | 200K users, 20K messages, 40K Nearby visibility + 40K statuses, 4K live waiters, 500 Turn-Based, 10K notifications, 2K push, 100 photo jobs | idempotent retry 3.95 s |
| 500K | light | PASS | 500K users, 50K messages, 100K + 100K Nearby, 10K live waiters, 500 Turn-Based, 25K notifications, 5K push, 100 photo jobs | 19.51 s; DB 341 MB |
| 1M | representative | PASS | 1M users, 2M seeded messages, 200K + 200K Nearby, 20K live waiters, 20K Turn-Based waiters, 1M notifications, 100K push, 50K photo jobs | 178.2 s; initial DB 1,914 MB |

The retained database was 2,006 MB after load traffic. Fixture rows contain no usable passwords or real tokens. The safe photo corpus reused bundled repository artwork through the isolated MinIO bucket.

## Final warm EXPLAIN evidence at 1M

| Query | Execution ms | Important plan evidence |
|---|---:|---|
| Auth access state | 0.016 | `users_pkey`; no sequential scan |
| Chat messages | 0.023 | `messages_thread_created_id_idx` |
| Chat inbox | 0.071 | membership/thread indexes; bounded sort |
| Nearby status feed | 5.014 | point-GiST KNN, PK/account/block joins, 500 candidates |
| Nearby profile feed | 4.129 | partial point-GiST KNN, exact distance after 500 candidates |
| Nearby summary refresh | 55.027 | three indexed global counts; single-flight/cached, not per request |
| Live Together candidate | 0.440 | waiting index; bounded 50-row claim |
| Turn-Based candidate | 3.045 | waiting index; 8,000 rows removed in the deliberately skewed seed |
| Notifications | 0.025 | user-created index |
| Push claim | 2.330 | claim-order + PK indexes; 100 candidate IDs, no external sort |

The original push full-join plan was 488.517 ms with global sequential scans and an external sort. The first indexed rewrite measured 2.707 ms. Ordinary warm hot queries now have zero table-size-proportional sequential scans. The only global aggregate is the intentionally cached Nearby summary refresh.

## Runtime load evidence

| Workload | Result | Measured evidence |
|---|---:|---|
| 2K steady WS | PASS | 2,000/2,000 upgrades + inbox ACKs; 60 s hold; zero failures |
| 5K steady WS | PASS | 5,000/5,000 upgrades + ACKs; 60 s hold; zero failures |
| 10K steady WS | PASS | 30 s ramp + 60 s full plateau; 10,000/10,000 upgrades + ACKs; zero failures/interruption; WS connect p95 1.09 ms |
| 25K / 50K WS | NOT RUN | stopped at the safety ceiling; 50K is **NOT VALIDATED** |
| General HTTP | PASS | 300 RPS for 30 s; 9,001/9,001; p50 1.50 ms, p95 3.20 ms, p99 4.77 ms |
| Nearby profile feed | PASS after fix | 100 RPS; 3,001/3,001; p95 18.20 ms. Before `0038`: ~35 RPS achieved, 1,702 drops, 28.5% failures, p95 9.06 s |
| Notifications | PASS | 100 RPS; 3,001/3,001; p95 2.56 ms |
| Chat + text model | PASS at 50/s | 1,501/1,501; p95 43.27 ms; one real ONNX text replica |
| Chat stress | SLO FAIL at 100/s | all 3,001 accepted, zero drops/errors, but p95 500.38 ms |
| Realistic mixed | PASS at 200 RPS | 6,001/6,001; overall p95 39.03 ms; chat 50.75, Nearby 11.72, Together 135.86 ms |
| Mixed boundary | SLO FAIL at 300 RPS | 9,001/9,001, zero drops/errors; overall p95 125.5 ms, but chat p95 944.19 ms |
| Mixed stress | FAIL at 575 target | 498.34 RPS achieved, 1,180 dropped iterations, p95 5.61 s; generator reached 1,000 VUs |
| Cross-node realtime | targeted PASS | 20/20 ACK-gated durable messages from API A delivered on API B; realtime p95 312.60 ms. Concurrent chat ACK p95 was 311.48 ms, narrowly above its 300 ms SLO |
| Live Together correctness | PASS | 20/20 compatible pairs matched one session; false-no-match 0; match p95 422 ms |
| Turn-Based correctness | PASS | 10/10 pairs, including stroke, submit, partner claim, and lease; match p95 104.65 ms |
| Photo model | PASS | 10/10 reusable safe-image jobs; 9.198 jobs/s/worker; average 94 ms, p95 99 ms; policy sent non-person art to review |
| Push worker | PASS | 100 tickets per 5 s scheduled pass (20/s steady); controlled 1,000-ticket backlog resumed after restart and all receipts became delivered |

Passing runs had 0% unexpected HTTP errors and zero dropped iterations. The failed boundary/stress runs above are retained as failure evidence and are not counted as validated capacity.

## Failure and recovery

- API node kill/rejoin: PASS. With 1,000 steady sockets on API B, API A was stopped; API B remained ready, API A rejoined at HTTP 200, and the steady cohort stayed at 1,000 connections/subscriptions.
- Valkey loss/rejoin: PASS. Valkey was replaced with an empty non-persistent container. All 1,000 sockets/subscriptions remained live. `amoria_ws_lease_reconciliations_total` reported 2,000 cumulative operations: one 1,000-socket initial-ready reconciliation and one 1,000-socket outage recovery.
- 25% reconnect storm: PASS. While the 1,000 steady cohort remained open, 250 VUs completed 1,807 reconnect sessions in 20 s with 1,807/1,807 upgrades and zero failures; connect p95 184.03 ms.
- Worker restart/backlog: PASS. The controlled push backlog stopped changing while the worker was down, resumed on restart, and completed through the fake Expo receipts endpoint. Worker liveness reported every loop healthy with zero consecutive failures and no DB waiters.

## Resource evidence and limits

- At 10K sockets, API B held exactly 10K connections/subscriptions at 274,685,952 bytes RSS (262 MiB), about 153 MiB heap, about 20.16 ms event-loop delay, and zero DB pool waiting. The k6 container used about 2.436 GiB.
- The host had 15.93 GiB RAM. During 10K it had about 2.72 GiB free (about 83% used), which triggered the stop rule. After the 1M DB, model services, image builds, and retained evidence containers, it was 88.5% used; this confirms that a 25K local attempt would conflate generator/host exhaustion with server capacity.
- Observed current/peak samples: API A current 111.6 MiB (10K peak not captured); text moderation 426 MiB; photo worker 288.1 MiB; worker process metric peak 141.4 MB; Valkey current 9.66 MiB after replacement (10K peak not captured); PostgreSQL current 1.70 GiB with 39 database connections, 1 active. DB CPU peak was not captured.
- Object storage completed the single safe-fixture upload at 732.9 KiB/s. That is a functional smoke measurement, not an object-storage throughput capacity result.

## Capacity conclusion

- **50K concurrent: NOT VALIDATED.** Highest actually validated: 10,000 steady WebSockets on one API instance.
- **1M registered dataset: VALIDATED** with the representative cardinalities above.
- 5M registered-user path: **MODELLED / NOT READY**. Reseed and remeasure plans, disk, maintenance, and backups before any claim.
- 100K concurrent path: **MODELLED / NOT READY**. It requires multiple measured API/generator hosts, load balancing, and a resilient Valkey topology.
- Conservative planning allowance: 7,000 steady sockets per instance, derived as 70% of the largest measured 10K stage. This is a measured-boundary planning number, not a saturation result. Do not use it to bypass multi-host validation.
- Validated realistic HTTP mix: 200 RPS on this single-host topology. Independent simple reads validated at 300 RPS. The 300 mixed boundary and 575 stress stage are failures, not operating targets.

## Soak, release, and ownership status

The 60-minute and 6-hour soaks were **NOT RUN** because the host had already crossed the resource safety ceiling at the largest successful stage. No production action, deployment, tag, force push, or Final Release Gold Gate was performed. Mobile ignores unknown WebSocket events and required no change. Admin Web was not touched.

Store identity remains **OWNER DECISION REQUIRED**.

New migrations: `0037_scale_push_claim_order.sql`, `0038_scale_nearby_knn.sql`.

## Verification summary

- Server typecheck: PASS.
- Full server suite: 489 total; 486 passed, 0 failed, 3 PostgreSQL-gated tests skipped in that invocation.
- Separately enabled PostgreSQL suites: 48 passed (release essentials, locality/concurrent claims, and Turn-Based behavior).
- Photo worker suite in its pinned runtime image: 18 total; 16 passed, 0 failed, 2 optional-model skips.
- Mobile TypeScript check: PASS; no files changed.
- Production and scale Compose rendering: PASS with non-secret example/scale inputs.
- Fresh empty scale-only migration database: PASS; all 39 journal entries applied and both `0038` GiST indexes plus `0037` were present.
- Admin Web build: NOT TOUCHED.
