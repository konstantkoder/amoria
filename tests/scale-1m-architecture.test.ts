import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { geographicBounds } from "../src/nearby/nearby.repo";
import { createRealtimeEvent, parseRealtimeEvent } from "../src/realtime/realtime-event";

const read = (file: string) => fs.readFileSync(path.resolve(process.cwd(), file), "utf8");

test("0035 adds the reviewed scale indexes and remains sequential", () => {
  const migration = read("src/db/migrations/0035_scale_1m.sql");
  const journal = JSON.parse(read("src/db/migrations/meta/_journal.json")) as { entries: Array<{ idx: number; tag: string }> };
  assert.equal(journal.entries.at(-1)?.idx, 35);
  assert.equal(journal.entries.at(-1)?.tag, "0035_scale_1m");
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
});

test("Together matching has no global activity lock and uses bounded skip-locked claims", () => {
  const repo = read("src/together/together.repo.ts");
  assert.doesNotMatch(repo, /together_queue:/);
  assert.match(repo, /limit\(50\)/);
  assert.match(repo, /skipLocked: true/);
  assert.match(repo, /limit 100/i);
});

test("maintenance locks are transaction scoped for transaction poolers", () => {
  const maintenance = read("src/together/together-turn-based.service.ts");
  assert.match(maintenance, /pg_try_advisory_xact_lock/);
  assert.doesNotMatch(maintenance, /pg_try_advisory_lock\(/);
  assert.doesNotMatch(maintenance, /pg_advisory_unlock/);
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

test("cross-instance per-user WebSocket admission uses expiring shared leases", () => {
  const bus = read("src/realtime/realtime-bus.ts");
  assert.match(bus, /acquireSharedWsUserConnection/);
  assert.match(bus, /ZREMRANGEBYSCORE/);
  assert.match(bus, /WS_MAX_CONNECTIONS_PER_USER/);
  assert.match(bus, /WS_LEASE_TTL_MS = 90_000/);
  assert.match(read("docker-compose.prod.yml"), /maxmemory-policy", "noeviction/);
});

test("production compose separates API, general workers, text model and internal bus", () => {
  const compose = read("docker-compose.prod.yml");
  assert.match(compose, /AMORIA_PROCESS_ROLE: api/);
  assert.match(compose, /AMORIA_PROCESS_ROLE: worker/);
  assert.match(compose, /text-moderation:/);
  assert.match(compose, /REALTIME_BUS_URL: redis:\/\/valkey:6379/);
  const apiSection = compose.slice(compose.indexOf("  api:"), compose.indexOf("  worker:"));
  assert.doesNotMatch(apiSection, /TEXT_MODEL_HOST_DIR/);
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
    "http_reads", "websocket", "chat", "nearby", "together", "notifications", "mixed", "reconnect_storm", "worker_recovery",
  ]) assert.match(load, new RegExp(scenario));
  assert.match(load, /CONFIRM_NON_PRODUCTION_TARGET/);
  assert.match(seed, /generate_series/);
  assert.match(seed, /5_000_000/);
  assert.match(seed, /push_deliveries/);
  assert.match(load, /rate<0\.005/);
  assert.doesNotMatch(seed, /bcrypt|argon2/i);
});
