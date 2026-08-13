import { env } from "../config/env";
import { pool } from "../db/client";
import { incrementMetric, setMetric } from "../observability/metrics";

const BATCH = 500;

export async function runRetentionMaintenance(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const lock = await client.query<{ locked: boolean }>(
      "SELECT pg_try_advisory_xact_lock(hashtext('amoria_retention_worker')) locked",
    );
    if (!lock.rows[0]?.locked) {
      incrementMetric("amoria_worker_lock_contention_total", { worker: "retention" });
      await client.query("ROLLBACK");
      return;
    }
    await boundedDelete(client, "auth_rate_limits", "expires_at <= now()");
    await boundedDelete(client, "message_abuse_events", "expires_at <= now()");
    await boundedDelete(client, "notifications", `read_at IS NOT NULL AND created_at <= now() - interval '${env.READ_NOTIFICATION_RETENTION_DAYS} days'`);
    await boundedDelete(client, "push_deliveries", `status IN ('delivered','failed') AND updated_at <= now() - interval '${env.PUSH_DELIVERY_RETENTION_DAYS} days'`);
    await boundedDelete(client, "media_moderation_jobs", `status IN ('completed','failed','cancelled') AND updated_at <= now() - interval '${env.PHOTO_JOB_RETENTION_DAYS} days'`);
    await client.query("COMMIT");
    await updateOperationalMetrics(client);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function boundedDelete(
  client: { query: (text: string) => Promise<unknown> },
  table: string,
  predicate: string,
): Promise<void> {
  const allowedTables = new Set([
    "auth_rate_limits", "message_abuse_events", "notifications", "push_deliveries", "media_moderation_jobs",
  ]);
  if (!allowedTables.has(table)) throw new Error("retention_table_not_allowed");
  await client.query(`DELETE FROM ${table} WHERE ctid IN (
    SELECT ctid FROM ${table} WHERE ${predicate} ORDER BY ctid LIMIT ${BATCH}
  )`);
}

async function updateOperationalMetrics(client: { query: <T>(text: string) => Promise<{ rows: T[] }> }): Promise<void> {
  const queueQueries = [
    ["photo", "SELECT status,count(*)::int count,extract(epoch from now()-min(created_at)) age FROM media_moderation_jobs WHERE status IN ('queued','running') GROUP BY status"],
    ["push", "SELECT status,count(*)::int count,extract(epoch from now()-min(created_at)) age FROM push_deliveries WHERE status IN ('pending','sending','receipt_pending','retry') GROUP BY status"],
    ["deletion", "SELECT status,count(*)::int count,extract(epoch from now()-min(requested_at)) age FROM account_deletion_jobs WHERE status IN ('pending','processing','retry') GROUP BY status"],
    ["together", "SELECT status,count(*)::int count,extract(epoch from now()-min(created_at)) age FROM together_queue WHERE status='waiting' GROUP BY status"],
  ] as const;
  for (const [queue, query] of queueQueries) {
    const result = await client.query<{ status: string; count: number; age: number | null }>(query);
    for (const row of result.rows) {
      setMetric("amoria_queue_depth", Number(row.count), { queue, status: row.status });
      setMetric("amoria_queue_oldest_age_seconds", Number(row.age ?? 0), { queue, status: row.status });
    }
  }
  const photo = await client.query<{ throughput: number; latency: number; errors: number }>(`
    SELECT
      count(*) FILTER (WHERE status='completed')::float/300 throughput,
      COALESCE(avg(extract(epoch from completed_at-started_at)) FILTER (WHERE status='completed'),0) latency,
      count(*) FILTER (WHERE status='failed')::int errors
    FROM media_moderation_jobs WHERE updated_at>=now()-interval '5 minutes'
  `);
  const photoRow = photo.rows[0];
  setMetric("amoria_photo_jobs_throughput_per_second", Number(photoRow?.throughput ?? 0));
  setMetric("amoria_photo_jobs_latency_seconds", Number(photoRow?.latency ?? 0));
  setMetric("amoria_photo_jobs_errors_recent", Number(photoRow?.errors ?? 0));
  const deletion = await client.query<{ max_attempt_count: number }>(`
    SELECT COALESCE(max(attempt_count) FILTER (WHERE status <> 'completed'),0)::int max_attempt_count
      FROM account_deletion_jobs
  `);
  setMetric("amoria_account_deletion_max_attempt_count", Number(deletion.rows[0]?.max_attempt_count ?? 0));
}
