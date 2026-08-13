import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { verifyPassword } from "../auth/passwords";
import { hashRateLimitKey, type AuthRateLimitAction } from "../auth/registration-abuse.guard";
import { AppError } from "../common/errors";
import { env } from "../config/env";
import { pool } from "../db/client";
import { deleteObject } from "../media/object-storage";
import { publishRealtimeEventSafely } from "../realtime/realtime-bus";

export const ACCOUNT_DELETION_RETRY_BACKOFF_EXPONENT_CAP = 10;
export const ACCOUNT_DELETION_RETRY_MAX_DELAY_MS = 24 * 60 * 60_000;
const ACCOUNT_DELETION_RETRY_BASE_DELAY_MS = 30_000;
const JOB_BATCH = 10;

type UserForDeletion = { id: string; email: string; password_hash: string; account_status: string };
type DeletionJob = { id: string; user_id: string; object_keys: string[]; deleted_object_keys: string[]; attempt_count: number };
type AccountDeletionErrorCode = "account_cleanup_failed" | "storage_delete_failed";
type DeletionQueryRunner = { query: (text: string, values?: unknown[]) => Promise<unknown> };

export type AccountDeletionCleanupHealth = {
  pending: number;
  retrying: number;
  maxAttemptCount: number;
  degraded: boolean;
};

export const ACCOUNT_DELETION_RETENTION = {
  delete: ["profile", "email", "credentials", "location", "media", "messages", "Together artifacts", "notifications", "push tokens"],
  anonymize: ["safety report reporter/target references", "moderation owner references", "operational client error records"],
  retainMinimum: ["anonymous user tombstone", "safety and admin audit structure without direct identifiers"],
} as const;

export async function requestAccountDeletion(userId: string, password: string): Promise<{ status: "pending" | "completed" }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`account-delete:${userId}`]);
    const result = await client.query<UserForDeletion>("SELECT id,email,password_hash,account_status FROM users WHERE id=$1 FOR UPDATE", [userId]);
    const user = result.rows[0];
    if (!user) throw new AppError("unauthorized", "User no longer exists", 401);
    if (user.account_status === "deleted") {
      await client.query("COMMIT");
      return { status: "completed" };
    }
    if (user.account_status === "deleting") {
      await client.query("COMMIT");
      return { status: "pending" };
    }
    const admin = await client.query<{ status: string }>("SELECT status FROM admin_users WHERE user_id=$1 FOR UPDATE", [userId]);
    if (admin.rows[0]?.status === "active") throw new AppError("active_admin_user", "Disable this user's admin account before deletion", 409);
    if (!password || !await verifyPassword(password, user.password_hash)) {
      throw new AppError("invalid_credentials", "Current password is incorrect", 401);
    }

    const objectKeys = await collectObjectKeys(client, userId);
    await immediatelyDeactivateAccount(client, userId, user.email, objectKeys);
    await client.query("COMMIT");
    await publishRealtimeEventSafely({
      type: "user.access_revoked",
      userId,
      reason: "Account deletion requested",
    });
    return { status: "pending" };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* original error wins */ }
    throw error;
  } finally {
    client.release();
  }
}

async function collectObjectKeys(client: PoolClient, userId: string): Promise<string[]> {
  const rows = await client.query<{ object_key: string }>(`
    SELECT path object_key FROM media_files WHERE owner_user_id=$1 AND physically_purged_at IS NULL
    UNION SELECT object_key FROM media_uploads WHERE owner_user_id=$1
  `, [userId]);
  return [...new Set(rows.rows.map((row) => row.object_key).filter((key) => key.startsWith(`users/${userId}/`)))];
}

async function immediatelyDeactivateAccount(client: PoolClient, userId: string, email: string, objectKeys: string[]) {
  const now = new Date();
  const tombstone = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
  await client.query(`UPDATE users SET email=$3,password_hash=$4,display_name='Deleted user',about=NULL,amoria_id=$5,avatar_url=NULL,photos='[]'::jsonb,
    gender=NULL,preferred_genders='[]'::jsonb,goal=NULL,mood=NULL,interests='[]'::jsonb,flirt_enabled=false,allow_adult_mode=false,mystery_mode=false,
    birth_date=NULL,preferred_age_min=18,preferred_age_max=NULL,account_status='deleting',auth_version=auth_version+1,deleted_at=$2,suspended_at=NULL,suspension_reason=NULL,
    suspended_by_admin_user_id=NULL,last_seen_at=NULL,updated_at=$2 WHERE id=$1`, [userId, now, `deleted-${tombstone.toLowerCase()}@deleted.invalid`, randomBytes(48).toString("base64url"), `DEL${tombstone}`.slice(0, 16)]);
  await client.query("DELETE FROM refresh_tokens WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM auth_email_challenges WHERE user_id=$1", [userId]);
  const rateLimitActions: AuthRateLimitAction[] = ["register", "login", "verify", "resend", "reset_request", "reset_confirm"];
  const emailRateLimitHashes = rateLimitActions.map((action) => hashRateLimitKey(`${action}:email`, email));
  await client.query("DELETE FROM auth_rate_limits WHERE key_hash=ANY($1::text[])", [emailRateLimitHashes]);
  await client.query("DELETE FROM push_tokens WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM notifications WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM profile_gallery_items WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM profile_locked_gallery_settings WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM nearby_profile_visibility WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM nearby_statuses WHERE author_user_id=$1", [userId]);
  await client.query("DELETE FROM user_activity_preferences WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM nearby_room_memberships WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM together_queue WHERE user_id=$1", [userId]);
  await client.query("UPDATE together_sessions SET status='abandoned',finished_at=COALESCE(finished_at,$2),ended_reason='account_deleted',artifact_purge_after=$2,updated_at=$2 WHERE id IN (SELECT session_id FROM together_session_members WHERE user_id=$1) AND status='active'", [userId, now]);
  await client.query("UPDATE together_turn_based_participants SET active=false,dismissed_at=COALESCE(dismissed_at,$2) WHERE user_id=$1 AND active=true", [userId, now]);
  await client.query("UPDATE together_turn_based_moments SET status='cancelled',cancel_reason='account_deleted',artifact_purge_after=$2,current_turn_user_id=NULL,updated_at=$2 WHERE (starter_user_id=$1 OR partner_user_id=$1) AND status IN ('starter_turn','waiting_for_partner','partner_turn','awaiting_draw_reveal','story_turn','awaiting_story_reveal')", [userId, now]);
  await client.query("UPDATE together_turn_based_moments SET latitude=0,longitude=0,radius_km=NULL,client_request_id=NULL,starter_age=18,preferred_age_min=18,preferred_age_max=NULL,starter_gender='nonbinary',preferred_genders='[]'::jsonb WHERE starter_user_id=$1 OR partner_user_id=$1", [userId]);
  await client.query("UPDATE together_session_members SET last_seen_at=NULL,left_at=COALESCE(left_at,$2) WHERE user_id=$1", [userId, now]);
  await client.query("UPDATE safety_reports SET reporter_user_id=NULL WHERE reporter_user_id=$1", [userId]);
  await client.query("UPDATE safety_reports SET target_owner_user_id=NULL WHERE target_owner_user_id=$1", [userId]);
  await client.query("UPDATE media_moderation_reviews SET owner_user_id=NULL WHERE owner_user_id=$1", [userId]);
  await client.query("UPDATE together_turn_based_problems SET user_id=NULL,details=NULL,summary='Anonymized account-related problem' WHERE user_id=$1", [userId]);
  await client.query("UPDATE room_moderation_actions SET target_user_id=NULL WHERE target_user_id=$1", [userId]);
  await client.query("UPDATE client_error_reports SET user_id=NULL,amoria_id=NULL,display_name=NULL,email=NULL,message='Redacted after account deletion',stack=NULL,metadata=NULL,device_model=NULL,os_version=NULL,request_id=NULL WHERE user_id=$1", [userId]);
  await client.query("UPDATE admin_audit_log SET admin_user_id=NULL,ip_address=NULL,user_agent=NULL,request_id=NULL WHERE admin_user_id IN (SELECT id FROM admin_users WHERE user_id=$1)", [userId]);
  await client.query("DELETE FROM admin_users WHERE user_id=$1", [userId]);
  await client.query("UPDATE thread_contexts SET created_by_user_id=NULL WHERE created_by_user_id=$1", [userId]);
  await deleteAuthoredMessagesAndRecomputeThreads(client, userId, now);
  await client.query("DELETE FROM together_events WHERE from_user_id=$1", [userId]);
  await client.query("DELETE FROM together_reveals WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM blocked_users WHERE user_id=$1 OR blocked_user_id=$1", [userId]);
  await client.query("DELETE FROM announcement_responses WHERE from_user_id=$1", [userId]);
  await client.query("DELETE FROM announcements WHERE author_user_id=$1", [userId]);
  await client.query("DELETE FROM message_abuse_events WHERE sender_user_id=$1", [userId]);
  await client.query("DELETE FROM thread_reads WHERE user_id=$1", [userId]);
  await client.query("DELETE FROM media_uploads WHERE owner_user_id=$1", [userId]);
  await client.query("UPDATE media_files SET moderation_state='removed',url='',physical_purge_reason='account_deletion' WHERE owner_user_id=$1", [userId]);
  await client.query(`INSERT INTO account_deletion_jobs(user_id,object_keys,status,next_attempt_at,updated_at)
    VALUES($1,$2::jsonb,'pending',$3,$3)
    ON CONFLICT(user_id) DO UPDATE SET object_keys=EXCLUDED.object_keys,status=CASE WHEN account_deletion_jobs.status='completed' THEN 'completed' ELSE 'pending' END,next_attempt_at=$3,updated_at=$3`, [userId, JSON.stringify(objectKeys), now]);
}

export async function runAccountDeletionMaintenance(): Promise<number> {
  const jobs = await claimJobs();
  for (const job of jobs) await processJob(job);
  return jobs.length;
}

async function claimJobs(): Promise<DeletionJob[]> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<DeletionJob>(`SELECT id,user_id,object_keys,deleted_object_keys,attempt_count FROM account_deletion_jobs
      WHERE status IN ('pending','retry','processing') AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT $1 FOR UPDATE SKIP LOCKED`, [JOB_BATCH]);
    if (result.rows.length) await client.query("UPDATE account_deletion_jobs SET status='processing',next_attempt_at=now()+interval '5 minutes',updated_at=now() WHERE id=ANY($1::uuid[])", [result.rows.map((row) => row.id)]);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* original error wins */ }
    throw error;
  } finally { client.release(); }
}

async function processJob(job: DeletionJob): Promise<void> {
  const deleted = new Set(job.deleted_object_keys ?? []);
  try {
    for (const key of job.object_keys ?? []) {
      if (deleted.has(key)) continue;
      await deleteObject({ bucket: env.S3_BUCKET, key });
      deleted.add(key);
      await pool.query("UPDATE account_deletion_jobs SET deleted_object_keys=$2::jsonb,updated_at=now() WHERE id=$1", [job.id, JSON.stringify([...deleted])]);
    }
    await finalizeAccountDeletion(job.user_id, job.id);
  } catch {
    const errorCode = deleted.size === (job.object_keys ?? []).length ? "account_cleanup_failed" : "storage_delete_failed";
    await scheduleAccountDeletionRetry(job.id, job.attempt_count, errorCode);
  }
}

export function calculateAccountDeletionRetry(
  currentAttemptCount: number,
  nowMs = Date.now(),
): { attemptCount: number; delayMs: number; nextAttemptAt: Date } {
  const attemptCount = Math.max(0, Math.trunc(currentAttemptCount)) + 1;
  const exponent = Math.min(attemptCount, ACCOUNT_DELETION_RETRY_BACKOFF_EXPONENT_CAP);
  const delayMs = Math.min(
    ACCOUNT_DELETION_RETRY_MAX_DELAY_MS,
    ACCOUNT_DELETION_RETRY_BASE_DELAY_MS * 2 ** exponent,
  );
  return {
    attemptCount,
    delayMs,
    nextAttemptAt: new Date(nowMs + delayMs),
  };
}

export async function scheduleAccountDeletionRetry(
  jobId: string,
  currentAttemptCount: number,
  errorCode: AccountDeletionErrorCode,
  nowMs = Date.now(),
  queryRunner: DeletionQueryRunner = pool,
): Promise<void> {
  const retry = calculateAccountDeletionRetry(currentAttemptCount, nowMs);
  await queryRunner.query(
    "UPDATE account_deletion_jobs SET status='retry',attempt_count=$2,next_attempt_at=$3,last_error_code=$4,updated_at=now() WHERE id=$1",
    [jobId, retry.attemptCount, retry.nextAttemptAt, errorCode],
  );
}

export async function getAccountDeletionCleanupHealth(): Promise<AccountDeletionCleanupHealth> {
  const result = await pool.query<{
    pending: number;
    retrying: number;
    max_attempt_count: number;
  }>(`SELECT
    count(*) FILTER (WHERE status IN ('pending','processing'))::integer AS pending,
    count(*) FILTER (WHERE status='retry')::integer AS retrying,
    COALESCE(max(attempt_count) FILTER (WHERE status<>'completed'),0)::integer AS max_attempt_count
    FROM account_deletion_jobs`);
  const row = result.rows[0];
  const pending = Number(row?.pending ?? 0);
  const retrying = Number(row?.retrying ?? 0);
  const maxAttemptCount = Number(row?.max_attempt_count ?? 0);
  return { pending, retrying, maxAttemptCount, degraded: retrying > 0 };
}

export async function deleteAuthoredMessagesAndRecomputeThreads(
  client: Pick<PoolClient, "query">,
  userId: string,
  now: Date,
): Promise<void> {
  await client.query("DELETE FROM messages WHERE from_user_id=$1", [userId]);
  await client.query(`WITH affected_threads AS (
      SELECT thread_id FROM thread_members WHERE user_id=$1
    ), latest_messages AS (
      SELECT DISTINCT ON (m.thread_id) m.thread_id,m.text,m.created_at
      FROM messages m
      JOIN affected_threads affected ON affected.thread_id=m.thread_id
      ORDER BY m.thread_id,m.created_at DESC,m.id DESC
    )
    UPDATE threads t
    SET last_message_text=latest.text,last_message_at=latest.created_at,updated_at=$2
    FROM affected_threads affected
    LEFT JOIN latest_messages latest ON latest.thread_id=affected.thread_id
    WHERE t.id=affected.thread_id`, [userId, now]);
}

async function finalizeAccountDeletion(userId: string, jobId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`account-delete:${userId}`]);
    await client.query("DELETE FROM media_files WHERE owner_user_id=$1", [userId]);
    await client.query("DELETE FROM media_uploads WHERE owner_user_id=$1", [userId]);
    await client.query("UPDATE users SET account_status='deleted',updated_at=now() WHERE id=$1", [userId]);
    await client.query("UPDATE account_deletion_jobs SET status='completed',object_keys='[]'::jsonb,deleted_object_keys='[]'::jsonb,completed_at=now(),last_error_code=NULL,updated_at=now() WHERE id=$1", [jobId]);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* original error wins */ }
    throw error;
  } finally { client.release(); }
}
