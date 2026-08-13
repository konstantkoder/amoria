# Amoria non-production scale harness

`seed-scale-dataset.mjs` supports 200k, 500k, 1m, or any custom count up to 5m with PostgreSQL `generate_series`; it performs no password hashing. It creates representative users, Nearby visibility, direct threads/messages, Together waiters, notifications, fake scale-only push tokens, and pending push deliveries. It refuses databases whose name does not clearly indicate test/scale/bench/dev and also requires an explicit confirmation variable.

The k6 harness covers HTTP reads, WebSockets, chat, Nearby, Together, notification/push-DB pressure, mixed traffic, reconnect storms, and worker restart recovery. Provide a gitignored `USERS_FILE` JSON fixture containing test access tokens; chat entries additionally need `threadId`. Supported validation steps are 2k, 5k, 10k, 25k and 50k VUs. Start small; none of the high steps runs automatically.

The default model is intentionally light: each VU performs one bounded action then sleeps 200 ms for HTTP/Nearby/Together, 500 ms for notification reads, holds a WebSocket for 20 seconds, or—in reconnect mode—holds for 1–3 seconds then adds up to 2 seconds of jitter. The mixed scenario rotates HTTP reads, Nearby, notifications, chat, and Together evenly. Thresholds are unexpected HTTP errors below 0.5%, ordinary p95 at or below 300 ms/p99 at or below 1 s, Nearby p95 at or below 500 ms, chat p95 at or below 300 ms, and Together p95 at or below 800 ms. Realtime delivery latency must be derived from timestamped received events in the k6 output and server bus histogram; the harness does not invent it.

Example commands:

```powershell
$env:SCALE_DATABASE_URL='postgres://.../amoria_scale'; $env:CONFIRM_SCALE_DATASET='I_CONFIRM_TEST_DATABASE'; $env:SCALE_USER_COUNT='200000'; node scripts/load/seed-scale-dataset.mjs
$env:BASE_URL='https://scale-api.example.test'; $env:USERS_FILE='./tmp/scale-users.json'; $env:SCENARIO='mixed'; $env:VUS='2000'; k6 run scripts/load/amoria-scale.js
$env:CONFIRM_EXPLAIN='I_CONFIRM_NON_PRODUCTION'; node scripts/load/explain-hot-queries.mjs
```

Never let synthetic tokens reach Expo. For worker/backlog runs, start the guarded local stub with `CONFIRM_EXPO_STUB=I_CONFIRM_NON_PRODUCTION node scripts/load/expo-push-stub.mjs`, then launch only the non-production worker with `EXPO_PUSH_SEND_URL=http://127.0.0.1:4500/--/api/v2/push/send` and `EXPO_PUSH_RECEIPTS_URL=http://127.0.0.1:4500/--/api/v2/push/getReceipts`. Production configuration rejects endpoint overrides.

For the reconnect-storm scenario, allocate 25% of the intended steady-state concurrent WebSockets to a separate `reconnect_storm` run while the steady-state WebSocket run remains active. The worker-recovery scenario requires an operator to stop and restart worker replicas and verify that SKIP LOCKED claims, stale leases, queue age, and retry metrics recover without duplicate final effects.
