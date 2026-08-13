import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.AUTH_SECURITY_HMAC_SECRET = "test-auth-security-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";
process.env.SUPPORT_EMAIL = "release-support@example.test";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const service = read("src/users/account-deletion.service.ts");
const migration = read("src/db/migrations/0034_release_essentials.sql");
const routes = read("src/users/users.routes.ts");
const retention = read("docs/account_deletion_retention.md");

test("migration creates durable account deletion state without rewriting older migrations", () => {
  assert.match(migration, /CREATE TABLE "account_deletion_jobs"/);
  assert.match(migration, /'pending', 'processing', 'retry', 'completed'/);
  assert.match(migration, /account_deletion_jobs_due_idx/);
  assert.match(migration, /'active', 'suspended', 'deleting', 'deleted'/);
  assert.match(migration, /safety_reports_reporter_user_id_users_id_fk[\s\S]*ON DELETE set null/);
  assert.equal(fs.readdirSync(path.join(root, "src/db/migrations")).some((file) => file.startsWith("0033_")), true);
});

test("authenticated deletion is password-gated, immediately deactivates, revokes auth, and is idempotent", () => {
  assert.match(routes, /fastify\.delete[\s\S]*?"\/me\/account"[\s\S]*?accountDeletionAuthMiddleware/);
  assert.match(service, /verifyPassword\(password, user\.password_hash\)/);
  assert.match(service, /invalid_credentials/);
  assert.match(service, /account_status='deleting'/);
  assert.match(service, /DELETE FROM refresh_tokens WHERE user_id=\$1/);
  assert.match(service, /DELETE FROM auth_email_challenges WHERE user_id=\$1/);
  assert.match(service, /account_status === "deleting"[\s\S]*status: "pending"/);
  assert.match(service, /account_status === "deleted"[\s\S]*status: "completed"/);
  assert.match(service, /pg_advisory_xact_lock/);
});

test("profile, gallery, locked media, location, preferences, sessions and device state are covered", () => {
  for (const contract of [
    /display_name='Deleted user'/,
    /avatar_url=NULL,photos='\[\]'::jsonb/,
    /DELETE FROM profile_gallery_items/,
    /DELETE FROM profile_locked_gallery_settings/,
    /DELETE FROM nearby_profile_visibility/,
    /DELETE FROM nearby_statuses/,
    /DELETE FROM user_activity_preferences/,
    /DELETE FROM nearby_room_memberships/,
    /DELETE FROM together_queue/,
    /UPDATE together_turn_based_moments SET latitude=0,longitude=0/,
    /DELETE FROM push_tokens/,
    /DELETE FROM notifications/,
  ]) assert.match(service, contract);
});

test("shared chat and Together integrity use an anonymous tombstone while authored content is deleted", () => {
  assert.match(service, /DELETE FROM messages WHERE from_user_id=\$1/);
  assert.match(service, /DELETE FROM together_events WHERE from_user_id=\$1/);
  assert.match(service, /DELETE FROM together_reveals WHERE user_id=\$1/);
  assert.doesNotMatch(service, /DELETE FROM thread_members WHERE user_id/);
  assert.doesNotMatch(service, /DELETE FROM together_session_members WHERE user_id/);
  assert.match(service, /UPDATE together_session_members SET last_seen_at=NULL,left_at=/);
  assert.match(service, /UPDATE safety_reports SET reporter_user_id=NULL/);
  assert.match(service, /UPDATE safety_reports SET target_owner_user_id=NULL/);
  assert.match(service, /UPDATE admin_audit_log SET admin_user_id=NULL,ip_address=NULL,user_agent=NULL,request_id=NULL/);
});

test("delete, anonymize and minimum-retention decisions are documented", () => {
  for (const phrase of ["Delete immediately", "Anonymize immediately", "Retain minimum", "durable job"]) {
    assert.match(retention, new RegExp(phrase, "i"));
  }
});

test("private object cleanup is bounded, durable, restart-safe, observable, and not fake-complete", () => {
  const storage = read("src/media/object-storage.ts");
  assert.match(service, /collectObjectKeys/);
  assert.match(service, /deleted_object_keys/);
  assert.match(service, /next_attempt_at=now\(\)\+interval '5 minutes'/);
  assert.match(service, /status='retry'/);
  assert.match(service, /last_error_code=\$4/);
  assert.match(service, /physical_purge_reason='account_deletion'/);
  assert.match(storage, /DeleteObjectCommand/);
  assert.match(storage, /AbortSignal\.timeout\(env\.OBJECT_STORAGE_DELETE_TIMEOUT_MS\)/);
  assert.match(service, /DELETE FROM media_files[\s\S]*account_status='deleted'/);
  assert.match(service, /status='completed',object_keys='\[\]'::jsonb,deleted_object_keys='\[\]'::jsonb/);
  assert.doesNotMatch(routes, /status\(200\).*requestAccountDeletion/);
});

test("public deletion and privacy pages are anonymous GET resources with escaped configured contact", async (t) => {
  const { accountDeletionPage, escapeHtml } = require("../src/public/public-pages") as typeof import("../src/public/public-pages");
  assert.equal(escapeHtml(`<script>alert('x')</script>`), "&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
  assert.doesNotMatch(accountDeletionPage(`<x>@example.test`), /<x>/);

  const { buildApp } = require("../src/app") as typeof import("../src/app");
  const app = buildApp();
  t.after(async () => app.close());
  const deletion = await app.inject({ method: "GET", url: "/account-deletion" });
  assert.equal(deletion.statusCode, 200);
  assert.match(deletion.body, /Amoria/);
  assert.match(deletion.body, /release-support@example\.test/);
  assert.match(String(deletion.headers["content-security-policy"]), /default-src 'none'/);
  assert.doesNotMatch(deletion.body, /<form/i);
  const privacy = await app.inject({ method: "GET", url: "/privacy" });
  assert.equal(privacy.statusCode, 200);
  assert.match(privacy.body, /push tokens/);
  assert.match(privacy.body, /anonymized/);
});
