import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/client";
import type { JsonValue } from "../db/schema";
import type {
  AdminBulkJob,
  AdminBulkJobDetail,
  AdminBulkJobItem,
  AdminBulkPreviewBody,
} from "./admin-bulk.types";

type JobRow = {
  id: string; admin_user_id: string | null; kind: AdminBulkJob["kind"]; action: string;
  scope: JsonValue; reason: string; idempotency_key: string; max_items: number; status: AdminBulkJob["status"];
  confirmation_token_hash: string; confirmed_at: Date | null; completed_at: Date | null;
  preview_count: number; applied_count: number; skipped_count: number; failed_count: number;
  created_at: Date; updated_at: Date;
};
type ItemRow = {
  id: string; target_type: string; target_id: string; proposed_action: string;
  status: AdminBulkJobItem["status"]; error_code: string | null; metadata: JsonValue | null;
  applied_at: Date | null; created_at: Date;
};

export async function createPreview(input: {
  adminUserId: string;
  body: AdminBulkPreviewBody;
  confirmationTokenHash: string;
  jobId?: string;
}): Promise<AdminBulkJobDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<JobRow>(`
      SELECT * FROM admin_bulk_jobs WHERE admin_user_id = $1 AND idempotency_key = $2 FOR UPDATE`,
      [input.adminUserId, input.body.idempotencyKey]);
    if (existing.rows[0]) {
      assertSamePreview(existing.rows[0], input.body);
      await client.query("COMMIT");
      return loadJob(existing.rows[0].id);
    }
    const jobId = input.jobId ?? randomUUID();
    await client.query(`
      INSERT INTO admin_bulk_jobs
        (id, admin_user_id, kind, action, scope, reason, idempotency_key, max_items, confirmation_token_hash)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9)`, [
      jobId, input.adminUserId, input.body.kind, input.body.action, JSON.stringify(input.body.scope),
      input.body.reason, input.body.idempotencyKey, input.body.maxItems, input.confirmationTokenHash,
    ]);
    const candidates = await selectCandidates(client, input.body);
    for (const candidate of candidates) {
      await client.query(`
        INSERT INTO admin_bulk_job_items (job_id, target_type, target_id, proposed_action, metadata)
        VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT DO NOTHING`, [
        jobId, candidate.target_type, candidate.target_id, input.body.action, JSON.stringify(candidate.metadata),
      ]);
    }
    await client.query(`UPDATE admin_bulk_jobs SET preview_count = $2, updated_at = now() WHERE id = $1`, [jobId, candidates.length]);
    await client.query("COMMIT");
    return loadJob(jobId);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function findJobIdentity(adminUserId: string, idempotencyKey: string): Promise<string | undefined> {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM admin_bulk_jobs WHERE admin_user_id = $1 AND idempotency_key = $2`,
    [adminUserId, idempotencyKey],
  );
  return result.rows[0]?.id;
}

export async function loadJob(jobId: string, adminUserId?: string): Promise<AdminBulkJobDetail> {
  const values: unknown[] = [jobId];
  const ownerClause = adminUserId ? " AND admin_user_id = $2" : "";
  if (adminUserId) values.push(adminUserId);
  const jobResult = await pool.query<JobRow>(`SELECT * FROM admin_bulk_jobs WHERE id = $1${ownerClause}`, values);
  const job = jobResult.rows[0];
  if (!job) throw new Error("bulk_job_not_found");
  const items = await pool.query<ItemRow>(`SELECT * FROM admin_bulk_job_items WHERE job_id = $1 ORDER BY created_at, id`, [jobId]);
  return { ...toJob(job), items: items.rows.map(toItem) };
}

export async function claimJob(jobId: string, adminUserId: string, confirmationTokenHash: string): Promise<AdminBulkJobDetail> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<JobRow>(`
      SELECT * FROM admin_bulk_jobs WHERE id = $1 AND admin_user_id = $2 FOR UPDATE`, [jobId, adminUserId]);
    const job = result.rows[0];
    if (!job) throw new Error("bulk_job_not_found");
    if (job.confirmation_token_hash !== confirmationTokenHash) throw new Error("invalid_confirmation");
    if (job.status === "completed" || job.status === "partially_failed") {
      await client.query("COMMIT");
      return loadJob(jobId, adminUserId);
    }
    if (job.status !== "awaiting_confirmation") throw new Error("bulk_job_busy");
    await client.query(`UPDATE admin_bulk_jobs SET status = 'running', confirmed_at = now(), updated_at = now() WHERE id = $1`, [jobId]);
    await client.query("COMMIT");
    return loadJob(jobId, adminUserId);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function markItem(itemId: string, status: "applied" | "skipped" | "failed", errorCode?: string): Promise<void> {
  await pool.query(`
    UPDATE admin_bulk_job_items SET status = $2, error_code = $3,
      applied_at = CASE WHEN $2 = 'applied' THEN now() ELSE NULL END
    WHERE id = $1 AND status = 'pending'`, [itemId, status, errorCode ?? null]);
}

export async function finalizeJob(jobId: string): Promise<AdminBulkJobDetail> {
  await pool.query(`
    UPDATE admin_bulk_jobs j SET
      applied_count = x.applied_count, skipped_count = x.skipped_count, failed_count = x.failed_count,
      status = CASE WHEN x.failed_count > 0 THEN 'partially_failed' ELSE 'completed' END,
      completed_at = now(), updated_at = now()
    FROM (
      SELECT job_id, count(*) FILTER (WHERE status='applied')::int AS applied_count,
        count(*) FILTER (WHERE status='skipped')::int AS skipped_count,
        count(*) FILTER (WHERE status='failed')::int AS failed_count
      FROM admin_bulk_job_items WHERE job_id = $1 GROUP BY job_id
    ) x WHERE j.id = x.job_id`, [jobId]);
  await pool.query(`
    UPDATE admin_bulk_jobs SET status='completed', completed_at=now(), updated_at=now()
    WHERE id=$1 AND preview_count=0`, [jobId]);
  return loadJob(jobId);
}

export async function purgePhysicalMedia(
  mediaId: string,
  adminUserId: string,
  reason: string,
  deletePath: (path: string) => Promise<void>,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const media = await client.query<{ path: string; owner_user_id: string; url: string }>(`
      SELECT path, owner_user_id, url FROM media_files
      WHERE id=$1 AND moderation_state='removed' AND physically_purged_at IS NULL
      FOR UPDATE`, [mediaId]);
    if (!media.rows[0]) { await client.query("ROLLBACK"); return false; }
    await client.query(`SELECT id FROM users WHERE id=$1 FOR UPDATE`, [media.rows[0].owner_user_id]);
    const references = await client.query<{ blocked: boolean }>(`
      SELECT EXISTS (SELECT 1 FROM profile_gallery_items WHERE media_id=$1)
          OR EXISTS (SELECT 1 FROM users WHERE avatar_url=$2) AS blocked`, [mediaId, media.rows[0].url]);
    if (references.rows[0]?.blocked) { await client.query("ROLLBACK"); return false; }
    await deletePath(media.rows[0].path);
    await client.query(`UPDATE media_files SET physically_purged_at=now(), physically_purged_by_admin_user_id=$2,
      physical_purge_reason=$3 WHERE id=$1`, [mediaId, adminUserId, reason]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function listKnownObjectPaths(limit: number): Promise<Array<{ id: string; path: string; physicallyPurgedAt: Date | null }>> {
  const result = await pool.query<{ id: string; path: string; physically_purged_at: Date | null }>(`
    SELECT id, path, physically_purged_at FROM media_files ORDER BY created_at DESC LIMIT $1`, [limit]);
  return result.rows.map((row) => ({ id: row.id, path: row.path, physicallyPurgedAt: row.physically_purged_at }));
}

async function selectCandidates(client: PoolClient, body: AdminBulkPreviewBody): Promise<Array<{ target_type: string; target_id: string; metadata: JsonValue }>> {
  const owner = body.scope.ownerAmoriaId ?? null;
  const status = body.scope.moderationStatus ?? null;
  if (body.kind === "media_scan") {
    const result = await client.query(`
      SELECT DISTINCT mf.id::text AS target_id, 'media_file'::text AS target_type,
        jsonb_build_object('moderationStatus', mf.moderation_state, 'visibility', CASE WHEN mf.type='avatar' THEN 'avatar' ELSE 'public' END, 'ownerAmoriaId', u.amoria_id) AS metadata
      FROM media_files mf JOIN users u ON u.id=mf.owner_user_id
      LEFT JOIN profile_gallery_items g ON g.media_id=mf.id AND g.visibility='public'
      WHERE (mf.type='avatar' OR g.media_id IS NOT NULL) AND mf.physically_purged_at IS NULL
        AND mf.moderation_state IN ('pending','approved','needs_review')
        AND ($1::text IS NULL OR u.amoria_id=$1) AND ($2::text IS NULL OR mf.moderation_state=$2)
      ORDER BY target_id LIMIT $3`, [owner, status, body.maxItems]);
    return result.rows;
  }
  if (body.kind === "media_decision") {
    const states = body.action === "mark_under_review" ? ["pending", "needs_review"] : ["needs_review", "restricted"];
    const result = await client.query(`
      SELECT DISTINCT mf.id::text AS target_id, 'media_file'::text AS target_type,
        jsonb_build_object('moderationStatus', mf.moderation_state, 'visibility', CASE WHEN mf.type='avatar' THEN 'avatar' ELSE 'public' END, 'ownerAmoriaId', u.amoria_id) AS metadata
      FROM media_files mf JOIN users u ON u.id=mf.owner_user_id
      LEFT JOIN profile_gallery_items g ON g.media_id=mf.id AND g.visibility='public'
      WHERE (mf.type='avatar' OR g.media_id IS NOT NULL) AND mf.physically_purged_at IS NULL
        AND mf.moderation_state = ANY($4::text[])
        AND ($1::text IS NULL OR u.amoria_id=$1) AND ($2::text IS NULL OR mf.moderation_state=$2)
      ORDER BY target_id LIMIT $3`, [owner, status, body.maxItems, states]);
    return result.rows;
  }
  if (body.kind === "message_decision") {
    const result = await client.query(`
      SELECT DISTINCT m.id::text AS target_id, 'message'::text AS target_type,
        jsonb_build_object('moderationStatus', s.state, 'source', s.source) AS metadata
      FROM message_moderation_states s JOIN messages m ON m.id=s.message_id
      WHERE s.state IN ('held','needs_review','restricted') OR EXISTS (
        SELECT 1 FROM safety_reports r WHERE r.target_id=m.id::text AND lower(r.target_type) IN ('message','chat_message')
          AND r.status IN ('open','under_review','escalated'))
      ORDER BY target_id LIMIT $1`, [body.maxItems]);
    return result.rows;
  }
  const result = await client.query(`
    SELECT mf.id::text AS target_id, 'media_file'::text AS target_type,
      jsonb_build_object('moderationStatus', mf.moderation_state, 'references', 0) AS metadata
    FROM media_files mf
    WHERE mf.moderation_state='removed' AND mf.physically_purged_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM profile_gallery_items g WHERE g.media_id=mf.id)
      AND NOT EXISTS (SELECT 1 FROM users u WHERE u.avatar_url=mf.url)
    ORDER BY mf.created_at LIMIT $1`, [body.maxItems]);
  return result.rows;
}

function assertSamePreview(row: JobRow, body: AdminBulkPreviewBody): void {
  if (row.kind !== body.kind || row.action !== body.action || row.reason !== body.reason || row.max_items !== body.maxItems || JSON.stringify(row.scope) !== JSON.stringify(body.scope)) {
    throw new Error("idempotency_conflict");
  }
}

function toJob(row: JobRow): AdminBulkJob {
  return {
    id: row.id, adminUserId: row.admin_user_id, kind: row.kind, action: row.action, scope: row.scope,
    reason: row.reason, idempotencyKey: row.idempotency_key, maxItems: row.max_items, status: row.status,
    confirmedAt: row.confirmed_at?.toISOString() ?? null, completedAt: row.completed_at?.toISOString() ?? null,
    previewCount: row.preview_count, appliedCount: row.applied_count, skippedCount: row.skipped_count, failedCount: row.failed_count,
    createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString(),
  };
}

function toItem(row: ItemRow): AdminBulkJobItem {
  return {
    id: row.id, targetType: row.target_type, targetId: row.target_id, proposedAction: row.proposed_action,
    status: row.status, errorCode: row.error_code, metadata: row.metadata,
    appliedAt: row.applied_at?.toISOString() ?? null, createdAt: row.created_at.toISOString(),
  };
}
