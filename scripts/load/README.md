# Amoria non-production scale validation

Every script in this directory refuses a production-looking target. Tokens, users, media metadata, and push destinations are synthetic; never point these commands at production.

## Scale stack

`docker-compose.scale.yml` is separate from production Compose. It contains PostgreSQL, transaction-pooled PgBouncer, Valkey, MinIO, API A, API B, the general worker, text moderation, photo moderation, a local Expo stub, and an optional pinned k6 container. PostgreSQL and PgBouncer are exposed only on loopback for seeding and plan capture. Worker metrics are available only on the internal `scale_backend` network.

Migrations run through the direct PostgreSQL connection. API and worker runtime connections use PgBouncer transaction pooling. The code uses transaction-scoped advisory locks and transaction-bounded `FOR UPDATE SKIP LOCKED`, which are compatible with transaction pooling.

```powershell
docker compose -f docker-compose.scale.yml config --quiet
docker compose -f docker-compose.scale.yml up -d --build
docker compose -f docker-compose.scale.yml ps
```

Do not use `docker-compose.scale.yml` as a deployment file. Its credentials, loopback ports, host model mounts, `.test` URLs, fake push service, and database name are deliberately non-production.

## Dataset profiles

`light` is a quick architecture/query smoke profile. `representative` defaults to denser cardinalities: 20 messages per synthetic direct thread (2 million messages at 1 million users), up to 1 million notifications, 200,000 Nearby-active profiles, 20,000 live Together waiters, 20,000 Turn-Based waiters, 100,000 push deliveries, and 50,000 metadata-only photo jobs. Override each count to fit available disk and RAM:

- `MESSAGES_PER_THREAD`
- `SCALE_NEARBY_ACTIVE_COUNT`
- `SCALE_NOTIFICATION_COUNT`
- `SCALE_TOGETHER_WAITING_COUNT`
- `SCALE_TURN_BASED_WAITING_COUNT`
- `SCALE_PUSH_DELIVERY_COUNT`
- `SCALE_PHOTO_JOB_COUNT`

Turn-Based rows include a dense Zagreb population plus older distant rows, so matching plans and false-no-match checks are meaningful. Photo job rows point only at an explicitly non-materialized scale namespace. They are suitable for claim/retry/depth tests, not inference throughput. For inference tests, upload a small safe fixture corpus and create controlled jobs that reuse it.

Seed registered-user stages independently and record the elapsed time and returned cardinalities:

```powershell
$env:SCALE_DATABASE_URL='postgres://amoria_migrator:scale-migration-password@127.0.0.1:45432/amoria_scale'
$env:CONFIRM_SCALE_DATASET='I_CONFIRM_TEST_DATABASE'
$env:SCALE_DATASET_PROFILE='light'
$env:SCALE_USER_COUNT='200000'
Measure-Command { npm run scale:seed }
```

Use `representative` for the final successfully hosted stage. Do not describe 500k or 1m as validated unless that exact stage completed.

## Test-token fixtures

The generator reads only `scale-*@load.invalid` users, signs short-lived HS256 access tokens with the exact `amoria-api` issuer, `amoria-mobile` audience, `typ=access`, and durable `auth_version`, and writes mode-0600 JSON beneath the gitignored `scripts/load/fixtures` directory.

```powershell
$env:SCALE_DATABASE_URL='postgres://amoria_runtime:scale-runtime-password@127.0.0.1:46432/amoria_scale'
$env:CONFIRM_SCALE_FIXTURES='I_CONFIRM_TEST_DATABASE'
$env:SCALE_JWT_SECRET='scale-only-jwt-secret-never-use-in-production'
$env:SCALE_FIXTURE_SCENARIO='websocket_steady'
$env:SCALE_FIXTURE_COUNT='2000'
npm run scale:fixtures
```

Supported sets cover steady HTTP, steady/reconnecting WS, chat and realtime sender/receiver/thread pairs, Together compatible pairs, Turn-Based, Nearby, notifications, worker recovery, and mixed traffic. `SCALE_FIXTURE_OFFSET` splits non-overlapping user ranges across generator hosts.

## Workload model

Connected users and request rate are independent:

- `CONCURRENT_CLIENTS` controls `websocket_steady` or `reconnect_storm` sockets.
- `HTTP_TARGET_RPS` controls general/mixed HTTP arrival rate.
- `CHAT_MESSAGES_PER_SECOND`, `NEARBY_REQUESTS_PER_SECOND`, and `TOGETHER_ENQUEUE_PER_SECOND` control their own arrival-rate scenarios.

The conservative defaults model 50,000 connected users with only a small active fraction: 300 general reads/s, 100 Nearby reads/s, 50 chat messages/s, 25 Together enqueues/s, or 750 aggregate iterations/s in the alternative mixed scenario. These are separate runs unless intentionally combined. `LOAD_PROFILE=stress` applies `STRESS_MULTIPLIER` (default 4) for controlled saturation work.

`websocket_steady` ramps from zero over `WS_RAMP_DURATION` (30 seconds by default), then holds the target for `DURATION`. Each connection stays open beyond the selected hold, so a 60-minute run does not recycle sockets. `GRACEFUL_STOP` defaults to two minutes for orderly closure. `reconnect_storm` alone uses 1-3 second holds plus jitter. Run the storm at 25% of the steady population while a separate steady generator stays connected.

`realtime_e2e` waits for the exact `subscribed/thread/threadId` acknowledgement before committing the sender HTTP message. A missing acknowledgement is an explicit `subscription_ack_failures_total` failure; there is no readiness sleep. Set HTTP to API A and WS to API B to exercise cross-instance Valkey fanout.

## Stages and generator limits

Run 2k, 5k, 10k, 25k, then 50k. At every stage warm up, hold steady, save k6 output plus API/worker metrics, and stop when SLOs fail materially, a host reaches the chosen 70-80% safety ceiling, or k6 reports dropped iterations / generator saturation. Never infer server saturation from a generator whose CPU, RAM, network, or file-descriptor limit is exhausted.

Fixture rows are loaded through k6 `SharedArray`; do not replace it with a per-VU JSON parse, which multiplies fixture memory by virtual-user count. For multiple generator hosts, generate non-overlapping `SCALE_FIXTURE_OFFSET` ranges, split `CONCURRENT_CLIENTS` or target rates explicitly, and set a unique `GENERATOR_INSTANCE` tag. Sum accepted sockets and request rates only after confirming every generator has zero dropped iterations and acceptable iteration scheduling delay.

With a local k6 binary:

```powershell
$env:BASE_URL='http://127.0.0.1:4400'
$env:WS_BASE_URL='http://127.0.0.1:4401'
$env:USERS_FILE='./scripts/load/fixtures/websocket_steady-0-2000.json'
$env:SCENARIO='websocket_steady'
$env:CONCURRENT_CLIENTS='2000'
$env:DURATION='5m'
k6 run scripts/load/amoria-scale.js
```

If k6 is absent but Docker is available, use the pinned `grafana/k6:0.57.0` service and mount/copy only gitignored synthetic fixtures into the load directory. Do not install a random system package:

```powershell
docker compose -f docker-compose.scale.yml --profile load run --rm -e SCENARIO=http_reads -e USERS_FILE=/load/fixtures/http_reads-0-2000.json -e HTTP_TARGET_RPS=300 k6
```

## Plans, failures, and soak

Run `npm run scale:explain` through the PgBouncer loopback port after each completed 200k/500k/1m seed. It emits execution time, rows, rows removed, buffers, indexes, sequential scans, sorts, and the full JSON plan for auth, inbox/history, Nearby feed/profile/summary, live Together, Turn-Based, notifications, and push claims.

Only on this scale stack, test API A termination/rejoin, a brief Valkey restart and lease reconciliation, the 25% reconnect storm, and worker restart/backlog recovery. Keep steady sockets alive during the failure tests. A stable largest stage should receive a real 60-minute soak; report 6 hours only if six hours actually elapsed.

The final capacity statement must distinguish measured realistic load from stress/saturation and apply an operating target no higher than 70% of the measured saturation point. `50K VALIDATED` is permitted only after an actual successful 50,000-client run.
