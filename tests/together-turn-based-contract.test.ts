import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  TOGETHER_ARTIFACT_PURGE_DELAY_MS,
  TOGETHER_HEARTBEAT_TIMEOUT_MS,
  TOGETHER_QUEUE_TTL_MS,
  TURN_BASED_DRAFT_TTL_MS,
  TURN_BASED_MAINTENANCE_INTERVAL_MS,
  TURN_BASED_PARTNER_CLAIM_TTL_MS,
  TURN_BASED_REVEAL_STALLED_WARNING_MS,
  TURN_BASED_REVEAL_TTL_MS,
  TURN_BASED_STORY_STALLED_WARNING_MS,
  TURN_BASED_STORY_TURN_TTL_MS,
  TURN_BASED_WAITING_FOR_PARTNER_TTL_MS,
  TURN_BASED_WAITING_WARNING_MS,
} from "../src/config/constants";
import {
  parseTurnBasedActionBody,
  parseTurnBasedStartBody,
} from "../src/together/together-turn-based.schemas";

const root = path.resolve(__dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const migration = read("src/db/migrations/0027_together_turn_based.sql");
const routes = read("src/together/together.routes.ts");
const service = read("src/together/together-turn-based.service.ts");
const admin = read("src/admin/admin-together-turn-based.service.ts");

test("existing live Together timing constants remain unchanged", () => {
  assert.equal(TOGETHER_QUEUE_TTL_MS, 5 * 60_000);
  assert.equal(TOGETHER_HEARTBEAT_TIMEOUT_MS, 60_000);
});
test("turn-based timing constants match the release contract", () => {
  assert.equal(TURN_BASED_DRAFT_TTL_MS, 24 * 60 * 60_000);
  assert.equal(TURN_BASED_WAITING_FOR_PARTNER_TTL_MS, 24 * 60 * 60_000);
  assert.equal(TURN_BASED_PARTNER_CLAIM_TTL_MS, 15 * 60_000);
  assert.equal(TURN_BASED_STORY_TURN_TTL_MS, 24 * 60 * 60_000);
  assert.equal(TURN_BASED_REVEAL_TTL_MS, 72 * 60 * 60_000);
  assert.equal(TOGETHER_ARTIFACT_PURGE_DELAY_MS, 24 * 60 * 60_000);
  assert.equal(TURN_BASED_MAINTENANCE_INTERVAL_MS, 15 * 60_000);
  assert.equal(TURN_BASED_WAITING_WARNING_MS, 12 * 60 * 60_000);
  assert.equal(TURN_BASED_STORY_STALLED_WARNING_MS, 12 * 60 * 60_000);
  assert.equal(TURN_BASED_REVEAL_STALLED_WARNING_MS, 24 * 60 * 60_000);
});
test("migration defaults existing sessions to live mode", () => {
  assert.match(migration, /"mode" text DEFAULT 'live' NOT NULL/);
});
test("migration constrains all moment statuses", () => {
  for (const status of ["starter_turn","waiting_for_partner","partner_turn","awaiting_draw_reveal",
    "story_turn","awaiting_story_reveal","completed","expired","cancelled","blocked","reported"]) {
    assert.ok(migration.includes(`'${status}'`), status);
  }
});
test("migration constrains stages and participant roles", () => {
  assert.match(migration, /'draw','story','done'/);
  assert.match(migration, /'starter','partner'/);
});
test("one active moment per user is database-enforced", () => {
  assert.match(migration, /participants_active_user_unique/);
  assert.match(migration, /WHERE "active" = true/);
});
test("open problems are deduplicated by moment and code", () => {
  assert.match(migration, /problems_open_dedupe/);
});
test("turn-based start parser requires safe location and request id", () => {
  const parsed = parseTurnBasedStartBody({
    location: { latitude: 45.8, longitude: 15.9, radiusKm: 25 },
    preferredAgeRange: { min: 25, max: 40 },
    clientRequestId: "request-1",
  });
  assert.equal(parsed.location.radiusKm, 25);
  assert.throws(() => parseTurnBasedStartBody({ location: { latitude: 91, longitude: 0, radiusKm: 5 }, clientRequestId: "x" }));
});
test("turn-based actions reject missing idempotency ids and oversized reasons", () => {
  assert.throws(() => parseTurnBasedActionBody({}));
  assert.throws(() => parseTurnBasedActionBody({ clientActionId: "x", reason: "x".repeat(501) }));
});
test("all required user endpoints are registered and history is removed", () => {
  for (const endpoint of ["/turn-based/start","/turn-based/current","/turn-based/moments/:id",
    "/turn-based/moments/:id/submit-draw","/turn-based/moments/:id/lease","/turn-based/moments/:id/cancel"]) {
    assert.ok(routes.includes(endpoint), endpoint);
  }
  assert.ok(!routes.includes('"/history"'));
});
test("matching is oldest-first, lock-safe, blocked-safe, and mutual", () => {
  assert.match(service, /ORDER BY m\.created_at ASC LIMIT 1 FOR UPDATE OF m SKIP LOCKED/);
  assert.match(service, /blocked_users/);
  assert.match(service, /preferred_genders/);
  assert.match(service, /radius_km/);
});
test("drawing submission requires a non-erase stroke from the actor", () => {
  assert.match(service, /non_empty_stroke_required/);
  assert.match(service, /COALESCE\(s->>'tool','draw'\)='draw'/);
});
test("expired partner claims remove only partner partial artifacts and return to pool", () => {
  assert.match(service, /DELETE FROM together_events WHERE session_id=\$1 AND from_user_id=\$2/);
  assert.match(service, /status='waiting_for_partner',partner_user_id=NULL/);
});
test("Story Sparks uses the exact alternating eight-turn order", () => {
  assert.match(service, /\[row\.starter_user_id,row\.partner_user_id,row\.partner_user_id,row\.starter_user_id,/);
  assert.match(service, /nextChoice >= 8/);
});
test("out-of-turn requests use the exact 409 code", () => {
  assert.match(service, /"together_turn_out_of_order","It is not your turn",409/);
});
test("terminal retention snapshots event counts and deletes event payloads", () => {
  assert.match(service, /DELETE FROM together_events/);
  assert.match(service, /event_count_snapshot=x\.event_count/);
});
test("moderation holds prevent artifact purge", () => {
  assert.match(service, /NOT IN \('reported','blocked'\)/);
});
test("maintenance uses an advisory lock and bounded batches", () => {
  assert.match(service, /pg_try_advisory_lock/);
  assert.match(service, /LIMIT 100/);
  assert.match(service, /cleanup_failed/);
});
test("admin reads exclude coordinates and expose operational state only", () => {
  assert.ok(!admin.match(/m\.latitude|m\.longitude/));
  assert.match(admin, /openProblemCount/);
});
test("admin action policy includes all required moment and problem actions", () => {
  for (const action of ["release_claim","return_to_pool","cancel_moment","expire_moment","retry_cleanup",
    "resolve","ignore","reopen"]) assert.ok(admin.includes(action), action);
});
