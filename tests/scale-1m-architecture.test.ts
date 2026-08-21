import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { geographicBounds } from "../src/common/geography";
import { createRealtimeEvent, parseRealtimeEvent } from "../src/realtime/realtime-event";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

test("scale migrations remain additive and sequential through measured hot-path indexes", () => {
  const migration = read("src/db/migrations/0035_scale_1m.sql");
  const matchingMigration = read("src/db/migrations/0036_scale_matching_locality.sql");
  const pushMigration = read("src/db/migrations/0037_scale_push_claim_order.sql");
  const nearbyKnnMigration = read("src/db/migrations/0038_scale_nearby_knn.sql");
  const journal = JSON.parse(read("src/db/migrations/meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.at(-1)?.idx, 39);
  assert.equal(journal.entries.at(-1)?.tag, "0039_admin_mfa_security");
  assert.equal(journal.entries.at(-2)?.idx, 38);
  assert.equal(journal.entries.at(-2)?.tag, "0038_scale_nearby_knn");
  assert.match(migration, /auth_version/);
  assert.match(migration, /refresh_tokens_auth_version_check/);
  for (const index of [
    "messages_thread_created_id_idx",
    "thread_members_user_thread_idx",
    "together_queue_waiting_activity_created_idx",
    "together_events_session_created_id_idx",
    "nearby_profile_visibility_active_geo_idx",
    "nearby_statuses_geo_expires_idx",
  ]) assert.match(migration, new RegExp(index));
  assert.match(matchingMigration, /together_queue_waiting_activity_geo_created_idx/);
  assert.match(matchingMigration, /together_turn_based_waiting_geo_created_idx/);
  assert.match(matchingMigration, /CREATE INDEX CONCURRENTLY/);
  assert.match(pushMigration, /push_deliveries_claim_order_idx/);
  assert.match(pushMigration, /CREATE INDEX CONCURRENTLY/);
  assert.match(nearbyKnnMigration, /nearby_profile_visibility_active_point_gist_idx/);
  assert.match(nearbyKnnMigration, /nearby_statuses_point_gist_idx/);
  assert.match(nearbyKnnMigration, /CREATE INDEX CONCURRENTLY/);
});

test("ordinary Nearby profile reads use a bounded KNN candidate set before exact distance", () => {
  const repo = read("src/nearby/nearby.repo.ts");
  assert.match(repo, /nearby_profile_nearest_candidates/);
  assert.match(repo, /nearby_status_nearest_candidates/);
  assert.match(repo, /point\([\s\S]*<-> point/);
  assert.match(repo, /\.limit\(500\)/);
  assert.match(repo, /!bounds\.allLongitudes && !bounds\.crossesAntimeridian/);
  assert.ok(repo.indexOf(".limit(500)") < repo.indexOf("sql`${distanceKm} <= ${viewerRadiusKm}`"));
});

test("Together matching filters compatibility before bounded skip-locked claims", () => {
  const repo = read("src/together/together.repo.ts");
  assert.doesNotMatch(repo, /together_queue:/);
  assert.match(repo, /limit\(50\)/);
  assert.match(repo, /skipLocked: true/);
  assert.match(repo, /queueCandidateCompatibilityCondition\(input\)[\s\S]*orderBy[\s\S]*limit\(50\)/);
  assert.match(repo, /NOT EXISTS \(\s*SELECT 1 FROM blocked_users/);
  assert.match(repo, /MAX_FINITE_MATCH_RADIUS_KM/);
  assert.match(repo, /asin\(least\(1, sqrt/);
  assert.match(repo, /runTogetherQueueMaintenance/);
});

test("turn-based matching bounds geography before exact distance and preserves row claims", () => {
  const turnBased = read("src/together/together-turn-based.service.ts");
  const boundsPosition = turnBased.indexOf("m.latitude BETWEEN $10 AND $11");
  const distancePosition = turnBased.indexOf("6371 * 2 * asin");
  assert.ok(boundsPosition > 0 && distancePosition > boundsPosition);
  assert.match(turnBased, /m\.radius_km IS NULL AND \$9::integer IS NULL/);
  assert.match(turnBased, /ORDER BY m\.created_at ASC, m\.id ASC LIMIT 1 FOR UPDATE OF m SKIP LOCKED/);
  assert.doesNotMatch(turnBased, /6371\*acos/);
});

test("maintenance locks are transaction scoped for transaction poolers", () => {
  const maintenance = read("src/together/together-turn-based.service.ts");
  assert.match(maintenance, /pg_try_advisory_xact_lock/);
  assert.doesNotMatch(maintenance, /pg_try_advisory_lock\(/);
  assert.doesNotMatch(maintenance, /pg_advisory_unlock/);
});

test("Turn-Based hot requests use targeted deadline normalization, never global maintenance", () => {
  const service = read("src/together/together-turn-based.service.ts");
  for (const [name, next] of [["start", "getCurrent"], ["getCurrent", "getMoment"], ["getMoment", "getMomentBroadcasts"]]) {
    const section = service.slice(
      service.indexOf(`export async function ${name}`),
      service.indexOf(`export async function ${next}`),
    );
    assert.doesNotMatch(section, /runMaintenance/);
  }
  assert.match(service, /normalizeExpiredMoment/);
  assert.match(service, /FOR UPDATE OF m/);
  assert.match(service, /validateRevealDecision/);
});

test("live Together request paths expire only the requested user's row", () => {
  const repo = read("src/together/together.repo.ts");
  assert.match(repo, /expireWaitingEntryForUser\(tx, input\.userId, now\)/);
  assert.match(repo, /runTogetherQueueMaintenance[\s\S]*for update skip locked/);
  assert.match(repo, /TOGETHER_QUEUE_MAINTENANCE_BATCH_SIZE/);
  assert.doesNotMatch(repo, /expireWaitingEntriesForMatching/);
});

test("geographic bounding box handles normal, antimeridian and polar searches", () => {
  const zagreb = geographicBounds(45.815, 15.982, 25);
  assert.equal(zagreb.crossesAntimeridian, false);
  assert.equal(zagreb.allLongitudes, false);
  assert.ok(zagreb.minLatitude < 45.815 && zagreb.maxLatitude > 45.815);
  const dateline = geographicBounds(0, 179.9, 50);
  assert.equal(dateline.crossesAntimeridian, true);
  const pole = geographicBounds(89.99, 0, 25);
  assert.equal(pole.allLongitudes, true);
  const highLatitude = geographicBounds(89, 0, 100);
  assert.equal(highLatitude.allLongitudes, false);
  assert.ok(highLatitude.maxLongitude > 60 && highLatitude.minLongitude < -60);
  for (const radiusKm of [5, 25, 100, 250]) {
    const bounds = geographicBounds(0, -30, radiusKm);
    assert.ok(bounds.minLatitude < 0 && bounds.maxLatitude > 0);
    assert.ok(bounds.minLongitude < -30 && bounds.maxLongitude > -30);
  }
});

test("realtime events are versioned, parse-bounded and reject unknown types", () => {
  const event = createRealtimeEvent({ type: "user.access_revoked", userId: crypto.randomUUID(), reason: "Account suspended" });
  assert.deepEqual(parseRealtimeEvent(JSON.stringify(event), 4096), event);
  assert.equal(parseRealtimeEvent(JSON.stringify(event), 10), undefined);
  assert.equal(parseRealtimeEvent(JSON.stringify({ ...event, type: "arbitrary.event" }), 4096), undefined);
});

test("durable access generation backs cross-instance security revocation", () => {
  const auth = read("src/auth/auth.service.ts");
  const middleware = read("src/common/security/auth-middleware.ts");
  const revalidation = read("src/realtime/ws-access-revalidation.ts");
  assert.match(auth, /revokeAllUserAccess/);
  assert.match(read("src/auth/auth.repo.ts"), /eq\(refreshTokens\.authVersion, user\.authVersion\)/);
  assert.match(auth, /user\.access_revoked/);
  assert.match(middleware, /authVersion !== payload\.ver/);
  assert.match(revalidation, /REVALIDATION_BATCH_SIZE = 500/);
});

test("presence throttling keeps the authoritative access read and skips fresh writes", () => {
  const middleware = read("src/common/security/auth-middleware.ts");
  const repo = read("src/users/users.repo.ts");
  const presence = read("src/users/user-presence.service.ts");
  assert.match(repo, /columns: \{ accountStatus: true, authVersion: true, lastSeenAt: true \}/);
  assert.ok(middleware.indexOf("authVersion !== payload.ver") < middleware.indexOf("await refreshUserPresence"));
  assert.match(presence, /lastSeenAt\.getTime\(\) >= staleBeforeMs/);
  assert.match(presence, /claimSharedPresenceHeartbeat/);
});

test("Nearby summary uses shared stale-while-refresh without lock-waiter COUNT fallthrough", () => {
  const nearby = read("src/nearby/nearby.service.ts");
  assert.match(nearby, /NEARBY_SUMMARY_CACHE_KEY/);
  assert.match(nearby, /acquireSharedEphemeralLock/);
  assert.match(nearby, /nearbySummaryRefresh \?\?=/);
  assert.match(nearby, /getNearbySummaryCounts/);
  assert.match(nearby, /stale_while_refresh/);
  assert.match(nearby, /NEARBY_SUMMARY_STALE_TTL_MS/);
  assert.match(nearby, /refresh is already in progress/);
  assert.doesNotMatch(nearby, /totalUsersCount:\s*0/);
});

test("cross-instance per-user WebSocket admission uses expiring shared leases", () => {
  const bus = read("src/realtime/realtime-bus.ts");
  assert.match(bus, /acquireSharedWsUserConnection/);
  assert.match(bus, /ZREMRANGEBYSCORE/);
  assert.match(bus, /WS_MAX_CONNECTIONS_PER_USER/);
  assert.match(bus, /WS_LEASE_TTL_MS = 90_000/);
  assert.match(bus, /wsLeaseReconciliationPending/);
  assert.match(bus, /recreateMissing/);
  assert.match(read("docker-compose.prod.yml"), /maxmemory-policy", "noeviction/);
});

test("shared fixed windows are atomic and successful subscriptions are acknowledged", () => {
  const bus = read("src/realtime/realtime-bus.ts");
  const routes = read("src/realtime/ws.routes.ts");
  assert.match(bus, /FIXED_WINDOW_INCREMENT_LUA/);
  assert.match(bus, /redis\.call\('INCR'/);
  assert.match(bus, /redis\.call\('PEXPIRE'/);
  assert.doesNotMatch(bus, /publisher\.incr/);
  assert.match(routes, /sendSubscriptionAck\(socket, "subscribed", "thread"/);
  assert.match(routes, /sendSubscriptionAck\(socket, "subscribed", "inbox"/);
  assert.match(routes, /sendSubscriptionAck\(socket, "subscribed", "together"/);
});

test("worker role exposes only an authenticated metrics and health listener", () => {
  const workerServer = read("src/workers/worker-observability.server.ts");
  const server = read("src/server.ts");
  assert.match(workerServer, /createServer/);
  assert.match(workerServer, /\/health\/live/);
  assert.match(workerServer, /\/internal\/metrics/);
  assert.match(workerServer, /Bearer \$\{env\.METRICS_TOKEN\}/);
  assert.match(server, /startWorkerObservabilityServer/);
  assert.match(server, /runTogetherQueueMaintenance/);
});

test("production compose separates API, general workers, text model and internal bus", () => {
  const compose = read("docker-compose.prod.yml");
  assert.match(compose, /AMORIA_PROCESS_ROLE: api/);
  assert.match(compose, /AMORIA_PROCESS_ROLE: worker/);
  assert.match(compose, /text-moderation:/);
  assert.match(compose, /REALTIME_BUS_URL: redis:\/\/valkey:6379/);
  const apiSection = compose.slice(compose.indexOf("  api:"), compose.indexOf("  worker:"));
  assert.doesNotMatch(apiSection, /TEXT_MODEL_HOST_DIR/);
  const workerSection = compose.slice(compose.indexOf("\n  worker:"), compose.indexOf("\n  text-moderation:"));
  assert.match(workerSection, /4001\/health\/live/);
  assert.doesNotMatch(workerSection, /ports:/);
});

test("scale-out public media bypasses Node bytes without weakening locked media", () => {
  const service = read("src/media/media.service.ts");
  const routes = read("src/media/media.routes.ts");
  const images = read("src/media/image-processing.ts");
  assert.match(service, /PUBLIC_MEDIA_DELIVERY_MODE === "presigned"/);
  assert.match(routes, /status\(307\)/);
  assert.match(images, /PROFILE_PHOTO_OUTPUT_MAX_SIZE/);
  assert.match(service, /getLockedGalleryMedia[\s\S]*readPublicMediaObject/);
});

test("scale scripts include guards and every required workload", () => {
  const load = read("scripts/load/amoria-scale.js");
  const seed = read("scripts/load/seed-scale-dataset.mjs");
  for (const scenario of [
    "http_reads", "websocket_steady", "chat", "nearby", "together", "notifications", "mixed", "reconnect_storm", "worker_recovery", "realtime_e2e", "together_match",
  ]) assert.match(load, new RegExp(scenario));
  assert.match(load, /CONFIRM_NON_PRODUCTION_TARGET/);
  assert.match(seed, /generate_series/);
  assert.match(seed, /5_000_000/);
  assert.match(seed, /push_deliveries/);
  assert.match(seed, /SCALE_DATASET_PROFILE/);
  assert.match(seed, /together_turn_based_moments/);
  assert.match(seed, /media_moderation_jobs/);
  assert.match(load, /constant-arrival-rate/);
  assert.match(load, /CONCURRENT_CLIENTS/);
  assert.match(load, /type === "subscribed"/);
  assert.doesNotMatch(load, /20_000/);
  assert.match(load, /rate<0\.005/);
  assert.match(load, /realtime_delivery_ms/);
  assert.match(load, /together_match_latency_ms/);
  assert.match(load, /known_compatible_false_no_match_total/);
  assert.match(load, /HTTP_BASE_URL/);
  assert.match(load, /WS_BASE_URL/);
  assert.doesNotMatch(seed, /bcrypt|argon2/i);
  const fixtures = read("scripts/load/generate-scale-fixtures.mjs");
  assert.match(fixtures, /typ: "access"/);
  assert.match(fixtures, /issuer: "amoria-api"/);
  assert.match(fixtures, /audience: "amoria-mobile"/);
  assert.match(fixtures, /CONFIRM_SCALE_FIXTURES/);
  assert.match(fixtures, /auth_version/);
  assert.match(fixtures, /scenario === "chat" \|\| scenario === "realtime_e2e" \|\| scenario === "mixed"/);
  const scaleCompose = read("docker-compose.scale.yml");
  assert.match(scaleCompose, /POOL_MODE: transaction/);
  assert.match(scaleCompose, /api-a:/);
  assert.match(scaleCompose, /api-b:/);
  assert.match(scaleCompose, /grafana\/k6:0\.57\.0/);
  assert.match(scaleCompose, /EXPO_STUB_HOST: 0\.0\.0\.0/);
});
