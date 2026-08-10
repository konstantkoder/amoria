import "dotenv/config";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import pg from "pg";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const baseUrl = process.env.PUBLIC_API_URL || "http://localhost:4000";
const outputPath = process.argv[2];
const password = process.env.AMORIA_ADMIN_QA_PASSWORD?.trim();
assert(password, "AMORIA_ADMIN_QA_PASSWORD is required");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: ["1", "true"].includes(String(process.env.S3_FORCE_PATH_STYLE).toLowerCase()),
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
});
const results = { assertions: [], ids: {}, startedAt: new Date().toISOString() };
const qa = (name) => `full-admin-${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function record(name, detail = "pass") { results.assertions.push({ name, detail }); }
function bearer(token) { return { Authorization: `Bearer ${token}` }; }
async function request(path, { token, method = "GET", body, expected = 200 } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? bearer(token) : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  assert.equal(response.status, expected, `${method} ${path}: expected ${expected}, got ${response.status}: ${text.slice(0, 400)}`);
  return data;
}
async function requestStatus(path, { token, method = "GET", body } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { ...(token ? bearer(token) : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await response.arrayBuffer();
  return response.status;
}
async function login(email, expected = 200) {
  return request("/auth/login", { method: "POST", body: { email, password }, expected });
}
async function upsertUser(client, input, passwordHash) {
  const result = await client.query(`
    INSERT INTO users (email,email_verified_at,password_hash,display_name,amoria_id,birth_date,gender,preferred_genders,account_status,updated_at)
    VALUES ($1,now(),$2,$3,$4,'1994-06-15','woman','[]'::jsonb,'active',now())
    ON CONFLICT (email) DO UPDATE SET email_verified_at=now(), password_hash=EXCLUDED.password_hash,
      display_name=EXCLUDED.display_name, amoria_id=EXCLUDED.amoria_id, birth_date=EXCLUDED.birth_date,
      gender=EXCLUDED.gender, account_status='active', suspended_at=NULL, suspension_reason=NULL,
      suspended_by_admin_user_id=NULL, updated_at=now()
    RETURNING id`, [input.email, passwordHash, input.displayName, input.amoriaId]);
  return result.rows[0].id;
}
async function setAdmin(client, userId, role, status = "active") {
  const user = await client.query(`SELECT email, display_name FROM users WHERE id=$1`, [userId]);
  const row = await client.query(`
    INSERT INTO admin_users (user_id,email,display_name,status,updated_at) VALUES ($1,$2,$3,$4,now())
    ON CONFLICT (user_id) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, status=EXCLUDED.status, updated_at=now()
    RETURNING id`, [userId, user.rows[0].email, user.rows[0].display_name, status]);
  await client.query(`DELETE FROM admin_user_roles WHERE admin_user_id=$1`, [row.rows[0].id]);
  await client.query(`INSERT INTO admin_user_roles (admin_user_id,role_id) SELECT $1,id FROM admin_roles WHERE key=$2`, [row.rows[0].id, role]);
  return row.rows[0].id;
}
async function seed() {
  const client = await pool.connect();
  const passwordHash = await bcrypt.hash(password, 8);
  try {
    await client.query("BEGIN");
    // This harness owns the local QA auth state and must remain repeatable after interrupted runs.
    await client.query("DELETE FROM auth_rate_limits WHERE scope LIKE 'login:%'");
    for (const role of ["owner", "moderator", "support", "ops"]) {
      await client.query(`INSERT INTO admin_roles (key,name,description) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING`, [role, role, `QA ${role}`]);
    }
    const specs = {
      owner: ["qa-owner-control@amoria.local", "QA Owner", "QAOWNCTRL"],
      moderator: ["qa-moderator-control@amoria.local", "QA Moderator", "QAMODCTRL"],
      support: ["qa-support-control@amoria.local", "QA Support", "QASUPCTRL"],
      ops: ["qa-ops-control@amoria.local", "QA Ops", "QAOPSCTRL"],
      disabled: ["qa-disabled-control@amoria.local", "QA Disabled", "QADISCTRL"],
      normal: ["qa-normal-control@amoria.local", "QA Normal", "QANORMCTRL"],
      target: ["qa-target-control@amoria.local", "QA Target", "QATARGETCTRL"],
      reporter: ["qa-reporter-control@amoria.local", "QA Reporter", "QAREPORTCTRL"],
    };
    const ids = {};
    for (const [key, [email, displayName, amoriaId]] of Object.entries(specs)) {
      ids[key] = await upsertUser(client, { email, displayName, amoriaId }, passwordHash);
    }
    ids.ownerAdmin = await setAdmin(client, ids.owner, "owner");
    ids.moderatorAdmin = await setAdmin(client, ids.moderator, "moderator");
    ids.supportAdmin = await setAdmin(client, ids.support, "support");
    ids.opsAdmin = await setAdmin(client, ids.ops, "ops");
    ids.disabledAdmin = await setAdmin(client, ids.disabled, "support", "disabled");
    await client.query(`DELETE FROM admin_users WHERE user_id=$1`, [ids.normal]);

    ids.thread = randomUUID();
    ids.flaggedMessage = randomUUID();
    ids.cleanMessage = randomUUID();
    await client.query(`INSERT INTO threads (id,type) VALUES ($1,'direct') ON CONFLICT (id) DO NOTHING`, [ids.thread]);
    await client.query(`INSERT INTO thread_members (thread_id,user_id) VALUES ($1,$2),($1,$3) ON CONFLICT DO NOTHING`, [ids.thread, ids.target, ids.reporter]);
    await client.query(`INSERT INTO messages (id,thread_id,from_user_id,text,client_message_id) VALUES
      ($1,$3,$4,'QA flagged private message','qa-flagged'),($2,$3,$4,'QA clean private message','qa-clean')`,
      [ids.flaggedMessage, ids.cleanMessage, ids.thread, ids.target]);
    await client.query(`INSERT INTO message_moderation_states (message_id,state,source,automation_status)
      VALUES ($1,'needs_review','direct','completed'),($2,'visible','direct','completed')`, [ids.flaggedMessage, ids.cleanMessage]);

    ids.report = randomUUID();
    await client.query(`INSERT INTO safety_reports (id,reporter_user_id,target_type,target_id,target_owner_user_id,reason,comment)
      VALUES ($1,$2,'message',$3,$4,'harassment','QA workflow report')`, [ids.report, ids.reporter, ids.flaggedMessage, ids.target]);

    ids.room = randomUUID();
    await client.query(`INSERT INTO nearby_room_types (key,title,status,admin_approved) VALUES ('qa_control_room','QA control room','active',true) ON CONFLICT (key) DO UPDATE SET status='active',admin_approved=true`, []);
    await client.query(`INSERT INTO nearby_rooms (id,type_key,title,status,geo_bucket,created_by_admin_user_id) VALUES ($1,'qa_control_room','QA control room','active','qa-coarse',$2)`, [ids.room, ids.ownerAdmin]);
    await client.query(`INSERT INTO nearby_room_memberships (room_id,user_id,status,role) VALUES ($1,$2,'active','member')`, [ids.room, ids.target]);
    await client.query(`INSERT INTO nearby_profile_visibility (user_id,status,latitude,longitude,radius_km,nearby_status,status_kind,expires_at,updated_at)
      VALUES ($1,'active',45.81,15.98,25,'QA visible','coffee',now()+interval '1 hour',now())
      ON CONFLICT (user_id) DO UPDATE SET status='active',latitude=45.81,longitude=15.98,radius_km=25,nearby_status='QA visible',status_kind='coffee',expires_at=now()+interval '1 hour',updated_at=now()`, [ids.target]);
    const releaseActivityKeys = [
      "coffee_nearby", "walk_nearby", "bike_nearby", "cinema_today", "talk_nearby", "evening_nearby",
      "roller_skating_nearby", "kayaking_nearby", "fishing_nearby", "sport_nearby", "language_exchange_nearby",
      "local_event_nearby", "lunch_nearby", "dinner_nearby", "dessert_nearby", "board_games_nearby",
      "chess_nearby", "book_club_nearby", "study_work_nearby", "skateboarding_nearby", "running_nearby",
      "gym_nearby", "yoga_nearby", "dance_nearby", "football_nearby", "basketball_nearby", "volleyball_nearby",
      "tennis_nearby", "table_tennis_nearby", "badminton_nearby", "beach_swim_nearby", "picnic_nearby",
      "hiking_nearby", "dog_walk_nearby", "concert_nearby", "museum_exhibition_nearby", "theater_nearby",
      "live_music_nearby", "festival_nearby", "photography_nearby", "cooking_nearby", "volunteering_nearby",
      "gaming_nearby",
    ];
    await client.query(`DELETE FROM user_activity_preferences WHERE user_id=$1 AND source='nearby_questionnaire'`, [ids.target]);
    await client.query(`INSERT INTO user_activity_preferences (user_id,activity_key,status,geo_bucket,source)
      SELECT $1, activity_key, 'active', NULL, 'nearby_questionnaire' FROM unnest($2::text[]) AS activity_key`,
      [ids.target, releaseActivityKeys]);
    await client.query(`DELETE FROM together_queue WHERE user_id=$1 AND status='waiting'`, [ids.target]);
    await client.query(`INSERT INTO together_queue (user_id,activity,status,expires_at,latitude,longitude,radius_km,user_age,preferred_age_min)
      VALUES ($1,'draw','waiting',now()+interval '10 minutes',45.81,15.98,25,32,18)`, [ids.target]);

    ids.publicMedia = randomUUID(); ids.lockedMedia = randomUUID(); ids.reviewMedia = randomUUID();
    ids.purgeMedia = randomUUID(); ids.referencedRemovedMedia = randomUUID();
    const media = [
      [ids.publicMedia, "profile_photo", "approved", "public"],
      [ids.lockedMedia, "profile_photo", "needs_review", "locked"],
      [ids.reviewMedia, "profile_photo", "needs_review", "public"],
      [ids.purgeMedia, "profile_photo", "removed", null],
      [ids.referencedRemovedMedia, "profile_photo", "removed", "public"],
    ];
    for (const [id, type, state, visibility] of media) {
      const path = `qa/full-admin/${id}.png`;
      const url = `${process.env.S3_PUBLIC_BASE_URL}/${path}`;
      await client.query(`INSERT INTO media_files (id,owner_user_id,type,path,url,mime_type,size_bytes,width,height,moderation_state,moderation_origin,created_at)
        VALUES ($1,$2,$3,$4,$5,'image/png',68,1,1,$6,'qa_runtime',CASE WHEN $1::uuid=$7::uuid THEN '2000-01-01'::timestamptz ELSE now() END)`,
        [id, ids.target, type, path, url, state, ids.purgeMedia]);
      if (visibility) await client.query(`INSERT INTO profile_gallery_items (user_id,media_id,visibility,position) VALUES ($1,$2,$3,0)`, [ids.target, id, visibility]);
    }
    await client.query("COMMIT");
    results.ids = ids;
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }

  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  for (const id of [results.ids.publicMedia, results.ids.lockedMedia, results.ids.reviewMedia, results.ids.purgeMedia, results.ids.referencedRemovedMedia]) {
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `qa/full-admin/${id}.png`, Body: png, ContentType: "image/png" }));
  }
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `qa/full-admin/orphan-${randomUUID()}.png`, Body: png, ContentType: "image/png" }));
}

async function run() {
  await request("/health");
  await seed();
  const emails = {
    owner: "qa-owner-control@amoria.local", moderator: "qa-moderator-control@amoria.local",
    support: "qa-support-control@amoria.local", ops: "qa-ops-control@amoria.local",
    disabled: "qa-disabled-control@amoria.local", normal: "qa-normal-control@amoria.local",
    target: "qa-target-control@amoria.local",
  };
  await request("/auth/login", { method: "POST", body: { email: emails.owner, password: "wrong-password" }, expected: 401 });
  record("invalid login rejected");
  const sessions = {};
  for (const role of ["owner", "moderator", "support", "ops", "disabled", "normal", "target"]) sessions[role] = await login(emails[role]);
  await request("/admin/me", { token: sessions.normal.accessToken, expected: 403 });
  await request("/admin/me", { token: sessions.disabled.accessToken, expected: 403 });
  record("non-admin and disabled admin rejected");
  for (const role of ["owner", "moderator", "support", "ops"]) {
    const me = await request("/admin/me", { token: sessions[role].accessToken });
    assert(me.adminUser.roles.includes(role));
  }
  record("admin me role truth");
  const expired = jwt.sign({}, process.env.JWT_SECRET, { subject: results.ids.owner, expiresIn: -1 });
  await request("/admin/me", { token: expired, expected: 401 });
  record("expired access token rejected");
  const refreshed = await request("/auth/refresh", { method: "POST", body: { refreshToken: sessions.support.refreshToken } });
  await request("/auth/logout", { method: "POST", body: { refreshToken: refreshed.refreshToken } });
  await request("/auth/refresh", { method: "POST", body: { refreshToken: refreshed.refreshToken }, expected: 401 });
  record("refresh rotation and logout revocation");

  const matrix = [
    ["/admin/health", ["owner","moderator","support","ops"]],
    [`/admin/users?amoriaId=QATARGETCTRL`, ["owner","moderator","support"]],
    ["/admin/admin-users", ["owner"]],
    ["/admin/client-errors?limit=5", ["owner","support","ops"]],
    ["/admin/audit-log?limit=5", ["owner"]],
    ["/admin/ops/health", ["owner","support","ops"]],
    ["/admin/nearby/diagnostics", ["owner","ops"]],
    ["/admin/nearby-rooms?limit=5", ["owner","moderator","support","ops"]],
    ["/admin/together/queue?limit=5", ["owner","ops"]],
    ["/admin/together/turn-based?limit=5", ["owner","ops","support"]],
    ["/admin/reports?limit=5", ["owner","moderator","support"]],
    ["/admin/media?limit=5", ["owner","moderator","support"]],
    ["/admin/message-moderation?status=all&limit=5", ["owner","moderator","support","ops"]],
  ];
  for (const [path, allowed] of matrix) for (const role of ["owner","moderator","support","ops"]) {
    await request(path, { token: sessions[role].accessToken, expected: allowed.includes(role) ? 200 : 403 });
  }
  record("backend role matrix", `${matrix.length} operations x 4 roles`);
  const country = await request("/admin/country-scope", { token: sessions.owner.accessToken });
  assert.equal(country.status, "COUNTRY_SCOPE_METADATA_MISSING"); assert.equal(country.countryFilteringAvailable, false);
  record("country scope refuses fake metadata");
  await request("/admin/users/not-a-uuid", { token: sessions.owner.accessToken, expected: 400 });
  await request(`/admin/users/${results.ids.target}`, { token: sessions.ops.accessToken, expected: 403 });
  record("new-route input validation and IDOR policy");

  const reportActions = ["assign", "mark_under_review", "escalate", "resolve", "dismiss"];
  for (const action of reportActions) await request(`/admin/reports/${results.ids.report}/actions`, {
    token: sessions.moderator.accessToken, method: "POST", body: { action, reason: `QA ${action}` },
  });
  await request(`/admin/reports/${results.ids.report}/actions`, { token: sessions.support.accessToken, method: "POST", body: { action: "add_note", note: "QA support note" } });
  await request(`/admin/reports/${results.ids.report}/actions`, { token: sessions.moderator.accessToken, method: "POST", body: { action: "resolve" }, expected: 400 });
  const reportDetail = await request(`/admin/reports/${results.ids.report}`, { token: sessions.owner.accessToken });
  assert.equal(reportDetail.report.assignedAdminUserId, results.ids.moderatorAdmin);
  assert(reportDetail.report.reviewActions.length >= 6);
  record("reports workflow, assignment, reason enforcement, and history");

  const lockedList = await request(`/admin/media?visibility=locked&limit=50`, { token: sessions.owner.accessToken });
  const locked = lockedList.items.find((item) => item.id === results.ids.lockedMedia);
  assert(locked); assert.equal(locked.url, null); assert.equal(locked.previewUrl, null);
  await request(`/admin/media/${results.ids.lockedMedia}?reason=QA%20locked%20review`, { token: sessions.support.accessToken, expected: 403 });
  await request(`/admin/media/${results.ids.lockedMedia}/decision`, { token: sessions.moderator.accessToken, method: "POST", body: { action: "restrict", reason: "QA no recent read" }, expected: 409 });
  await request(`/admin/media/${results.ids.lockedMedia}/content?reason=QA%20locked%20review`, { token: sessions.owner.accessToken });
  await request(`/admin/media/${results.ids.lockedMedia}/decision`, { token: sessions.owner.accessToken, method: "POST", body: { action: "mark_under_review", reason: "QA locked decision" } });
  record("locked media reason, role, content-read-before-decision, and URL privacy");

  const scanKey = qa("scan");
  const scanPreview = await request("/admin/bulk-jobs/preview", { token: sessions.moderator.accessToken, method: "POST", body: {
    kind: "media_scan", action: "scan", reason: "QA public media scan", idempotencyKey: scanKey, maxItems: 100, scope: {},
  } });
  assert(!scanPreview.job.items.some((item) => item.targetId === results.ids.lockedMedia));
  await request(`/admin/bulk-jobs/${scanPreview.job.id}/confirm`, { token: sessions.moderator.accessToken, method: "POST", body: { confirmationToken: scanPreview.confirmationToken } });
  const lockedJobs = await pool.query(`SELECT count(*)::int AS count FROM media_moderation_jobs WHERE media_id=$1`, [results.ids.lockedMedia]);
  assert.equal(lockedJobs.rows[0].count, 0);
  record("automatic public scan excludes locked media");

  const mediaDecision = await request("/admin/bulk-jobs/preview", { token: sessions.owner.accessToken, method: "POST", body: {
    kind: "media_decision", action: "restrict", reason: "QA restrict flagged public media", idempotencyKey: qa("media-decision"), maxItems: 100, scope: {},
  } });
  assert(mediaDecision.job.items.some((item) => item.targetId === results.ids.reviewMedia));
  assert(!mediaDecision.job.items.some((item) => item.targetId === results.ids.lockedMedia));
  const mediaResult = await request(`/admin/bulk-jobs/${mediaDecision.job.id}/confirm`, { token: sessions.owner.accessToken, method: "POST", body: { confirmationToken: mediaDecision.confirmationToken } });
  assert.equal(mediaResult.job.failedCount, 0);
  record("bulk public media preview and per-item decision");

  const messageBulk = await request("/admin/bulk-jobs/preview", { token: sessions.owner.accessToken, method: "POST", body: {
    kind: "message_decision", action: "restrict", reason: "QA restrict flagged messages", idempotencyKey: qa("message"), maxItems: 100, scope: {},
  } });
  assert(messageBulk.job.items.some((item) => item.targetId === results.ids.flaggedMessage));
  assert(!messageBulk.job.items.some((item) => item.targetId === results.ids.cleanMessage));
  await request(`/admin/bulk-jobs/${messageBulk.job.id}/confirm`, { token: sessions.owner.accessToken, method: "POST", body: { confirmationToken: messageBulk.confirmationToken } });
  await request(`/admin/message-moderation/${results.ids.flaggedMessage}?reason=QA%20role%20boundary`, { token: sessions.support.accessToken, expected: 403 });
  const messageDetail = await request(`/admin/message-moderation/${results.ids.flaggedMessage}?reason=QA%20private%20message%20review`, { token: sessions.owner.accessToken });
  assert.equal(messageDetail.message.state, "restricted");
  record("message metadata/body privacy and flagged-only bulk selection");

  await Promise.all([
    request(`/admin/media/${results.ids.reviewMedia}/decision`, { token: sessions.owner.accessToken, method: "POST", body: { action: "restrict", reason: "QA concurrent media owner" } }),
    request(`/admin/media/${results.ids.reviewMedia}/decision`, { token: sessions.moderator.accessToken, method: "POST", body: { action: "restrict", reason: "QA concurrent media moderator" } }),
    request(`/admin/message-moderation/${results.ids.flaggedMessage}/decision`, { token: sessions.owner.accessToken, method: "POST", body: { action: "restrict", reason: "QA concurrent message owner" } }),
    request(`/admin/message-moderation/${results.ids.flaggedMessage}/decision`, { token: sessions.moderator.accessToken, method: "POST", body: { action: "restrict", reason: "QA concurrent message moderator" } }),
  ]);
  const concurrencyState = await pool.query(`SELECT
    (SELECT moderation_state FROM media_files WHERE id=$1) AS media_state,
    (SELECT count(*)::int FROM media_moderation_reviews WHERE media_id=$1 AND reason LIKE 'QA concurrent media%') AS media_reviews,
    (SELECT state FROM message_moderation_states WHERE message_id=$2) AS message_state,
    (SELECT count(*)::int FROM message_moderation_reviews WHERE message_id=$2 AND reason LIKE 'QA concurrent message%') AS message_reviews`,
  [results.ids.reviewMedia, results.ids.flaggedMessage]);
  assert.equal(concurrencyState.rows[0].media_state, "restricted");
  assert.equal(concurrencyState.rows[0].media_reviews, 2);
  assert.equal(concurrencyState.rows[0].message_state, "restricted");
  assert.equal(concurrencyState.rows[0].message_reviews, 2);
  const concurrentBulk = await request("/admin/bulk-jobs/preview", { token: sessions.owner.accessToken, method: "POST", body: {
    kind: "media_scan", action: "scan", reason: "QA concurrent confirmation", idempotencyKey: qa("concurrent-confirm"),
    maxItems: 1, scope: { ownerAmoriaId: "QA_NO_MATCH_CONCURRENCY" },
  } });
  const confirmPath = `/admin/bulk-jobs/${concurrentBulk.job.id}/confirm`;
  const confirmBody = { confirmationToken: concurrentBulk.confirmationToken };
  const confirmStatuses = await Promise.all([
    requestStatus(confirmPath, { token: sessions.owner.accessToken, method: "POST", body: confirmBody }),
    requestStatus(confirmPath, { token: sessions.owner.accessToken, method: "POST", body: confirmBody }),
  ]);
  assert(confirmStatuses.includes(200));
  assert(confirmStatuses.every((status) => status === 200 || status === 409));
  const concurrentJob = await request(`/admin/bulk-jobs/${concurrentBulk.job.id}`, { token: sessions.owner.accessToken });
  assert.equal(concurrentJob.job.status, "completed");
  record("concurrent media/message decisions and duplicate bulk confirmation remain serialized and consistent");

  const purgePreview = await request("/admin/bulk-jobs/preview", { token: sessions.owner.accessToken, method: "POST", body: {
    kind: "physical_media_purge", action: "purge", reason: "QA unreferenced removed media purge", idempotencyKey: qa("purge"), maxItems: 1, scope: {},
  } });
  const purgeTargetId = purgePreview.job.items[0]?.targetId;
  assert(purgeTargetId, "physical purge preview must select one eligible object");
  await request("/admin/bulk-jobs/preview", { token: sessions.moderator.accessToken, method: "POST", body: {
    kind: "physical_media_purge", action: "purge", reason: "QA forbidden purge", idempotencyKey: qa("purge-forbidden"), maxItems: 1, scope: {},
  }, expected: 403 });
  const purgeResult = await request(`/admin/bulk-jobs/${purgePreview.job.id}/confirm`, { token: sessions.owner.accessToken, method: "POST", body: { confirmationToken: purgePreview.confirmationToken } });
  assert.equal(purgeResult.job.appliedCount, 1);
  await assert.rejects(() => s3.send(new HeadObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `qa/full-admin/${purgeTargetId}.png` })));
  const refState = await pool.query(`SELECT physically_purged_at FROM media_files WHERE id=$1`, [results.ids.referencedRemovedMedia]);
  assert.equal(refState.rows[0].physically_purged_at, null);
  const orphan = await request("/admin/storage/orphans", { token: sessions.owner.accessToken });
  assert.equal(orphan.status, "diagnostic_only"); assert.equal(orphan.destructiveActionAvailable, false);
  record("owner-only confirmed purge preserves references and orphan diagnostics is non-destructive");

  const targetBeforeSuspend = sessions.target;
  const suspended = await request(`/admin/users/${results.ids.target}/status`, { token: sessions.owner.accessToken, method: "POST", body: { action: "suspend", reason: "QA suspension lifecycle" } });
  assert.equal(suspended.user.accountStatus, "suspended");
  await request("/me", { token: targetBeforeSuspend.accessToken, expected: 403 });
  await request("/nearby/me", { token: targetBeforeSuspend.accessToken, expected: 403 });
  await request("/together/queue", { token: targetBeforeSuspend.accessToken, method: "POST", body: {
    activity: "draw", location: { latitude: 45.81, longitude: 15.98, radiusKm: 25 },
  }, expected: 403 });
  await request("/auth/refresh", { method: "POST", body: { refreshToken: targetBeforeSuspend.refreshToken }, expected: 401 });
  const suspendedState = await pool.query(`SELECT u.account_status, v.status AS nearby_status, v.latitude,
      (SELECT status FROM together_queue WHERE user_id=u.id ORDER BY created_at DESC LIMIT 1) AS queue_status,
      (SELECT status FROM nearby_room_memberships WHERE user_id=u.id ORDER BY joined_at DESC LIMIT 1) AS membership_status,
      (SELECT count(*)::int FROM refresh_tokens WHERE user_id=u.id AND revoked_at IS NULL) AS active_refresh
    FROM users u LEFT JOIN nearby_profile_visibility v ON v.user_id=u.id WHERE u.id=$1`, [results.ids.target]);
  assert.deepEqual(suspendedState.rows[0], { account_status: "suspended", nearby_status: "off", latitude: null, queue_status: "cancelled", membership_status: "removed", active_refresh: 0 });
  await request(`/admin/users/${results.ids.owner}/status`, { token: sessions.owner.accessToken, method: "POST", body: { action: "suspend", reason: "QA active admin guard" }, expected: 409 });
  await request(`/admin/users/${results.ids.target}/status`, { token: sessions.owner.accessToken, method: "POST", body: { action: "restore", reason: "QA restore lifecycle" } });
  await login(emails.target);
  record("suspension revokes auth and hides Nearby/Together/room discovery, restore succeeds");

  const createdAdmin = await request("/admin/admin-users", { token: sessions.owner.accessToken, method: "POST", body: {
    userId: results.ids.normal, roles: ["support"], reason: "QA create admin",
  } });
  const normalAdmin = createdAdmin.items.find((item) => item.userId === results.ids.normal); assert(normalAdmin);
  await request(`/admin/admin-users/${normalAdmin.id}`, { token: sessions.moderator.accessToken, method: "POST", body: { status: "disabled", reason: "QA forbidden admin mutation" }, expected: 403 });
  await request(`/admin/admin-users/${normalAdmin.id}`, { token: sessions.owner.accessToken, method: "POST", body: { status: "disabled", roles: ["support"], reason: "QA disable admin" } });
  const normalSession = await login(emails.normal); await request("/admin/me", { token: normalSession.accessToken, expected: 403 });
  await request(`/admin/admin-users/${normalAdmin.id}`, { token: sessions.owner.accessToken, method: "POST", body: { status: "active", roles: ["ops"], reason: "QA re-enable admin as ops" } });
  const normalReenabled = await login(emails.normal); const normalMe = await request("/admin/me", { token: normalReenabled.accessToken });
  assert.deepEqual(normalMe.adminUser.roles, ["ops"]);
  record("owner-only admin create, disable, enable, and role update");

  const ownerSnapshot = await pool.query(`SELECT au.id,au.status FROM admin_users au JOIN admin_user_roles aur ON aur.admin_user_id=au.id JOIN admin_roles ar ON ar.id=aur.role_id WHERE ar.key='owner' AND au.id<>$1`, [results.ids.ownerAdmin]);
  try {
    await pool.query(`UPDATE admin_users SET status='disabled' WHERE id=ANY($1::uuid[])`, [ownerSnapshot.rows.map((row) => row.id)]);
    await request(`/admin/admin-users/${results.ids.ownerAdmin}`, { token: sessions.owner.accessToken, method: "POST", body: { roles: ["support"], reason: "QA last owner guard" }, expected: 409 });
  } finally {
    for (const row of ownerSnapshot.rows) await pool.query(`UPDATE admin_users SET status=$2 WHERE id=$1`, [row.id, row.status]);
  }
  record("last active owner cannot be removed");

  const dashboard = await request("/admin/dashboard/release-control", { token: sessions.owner.accessToken });
  assert.equal(dashboard.ok, true);
  await request("/client/error-reports", { method: "POST", body: { screen: "Admin QA", action: "runtime", message: "QA client error" }, expected: 201 });
  const clientErrors = await request("/admin/client-errors?screen=Admin%20QA&limit=10", { token: sessions.support.accessToken });
  assert(clientErrors.items.length >= 1);
  record("dashboard real counters and client-error ingestion/listing");
}

try {
  await run();
  results.completedAt = new Date().toISOString();
  results.pass = true;
} catch (error) {
  results.completedAt = new Date().toISOString();
  results.pass = false;
  results.failure = { name: error?.name ?? "Error", message: String(error?.message ?? error), stack: String(error?.stack ?? "").split("\n").slice(0, 8) };
  process.exitCode = 1;
} finally {
  const sanitized = { ...results, ids: Object.fromEntries(Object.entries(results.ids).map(([key, value]) => [key, String(value)])) };
  if (outputPath) await fs.writeFile(outputPath, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
  else process.stdout.write(`${JSON.stringify(sanitized, null, 2)}\n`);
  await pool.end();
}
