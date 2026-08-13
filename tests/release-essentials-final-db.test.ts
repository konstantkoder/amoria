import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("release essentials final real PostgreSQL deletion retry and chat consistency", { skip: !testDatabaseUrl }, async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL = testDatabaseUrl!;
  process.env.JWT_SECRET = "test-secret-that-is-long-enough";
  process.env.AUTH_SECURITY_HMAC_SECRET = "test-auth-security-secret-that-is-long-enough";
  process.env.SUPPORT_EMAIL = "release-support@example.test";

  const { pool, closeDb } = await import("../src/db/client.js");
  const {
    deleteAuthoredMessagesAndRecomputeThreads,
    scheduleAccountDeletionRetry,
  } = await import("../src/users/account-deletion.service.js");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userA = randomUUID();
    const userB = randomUUID();
    await client.query(`INSERT INTO users(id,email,password_hash,display_name,amoria_id)
      VALUES($1,$2,'test-hash','Delete A',$3),($4,$5,'test-hash','Keep B',$6)`, [
      userA,
      `deletion-a-${userA}@example.invalid`,
      `A${userA.replaceAll("-", "").slice(0, 15)}`,
      userB,
      `deletion-b-${userB}@example.invalid`,
      `B${userB.replaceAll("-", "").slice(0, 15)}`,
    ]);

    const mixedThread = randomUUID();
    const emptyThread = randomUUID();
    await client.query("INSERT INTO threads(id,type,last_message_text,last_message_at) VALUES($1,'direct','A2',$3),($2,'direct','only A',$3)", [
      mixedThread,
      emptyThread,
      new Date("2026-08-13T12:02:00.000Z"),
    ]);
    await client.query("INSERT INTO thread_members(thread_id,user_id) VALUES($1,$3),($1,$4),($2,$3),($2,$4)", [mixedThread, emptyThread, userA, userB]);

    const a1 = randomUUID();
    const b1 = randomUUID();
    const a2 = randomUUID();
    const onlyA = randomUUID();
    await client.query(`INSERT INTO messages(id,thread_id,from_user_id,text,client_message_id,created_at) VALUES
      ($1,$5,$7,'A1','a1','2026-08-13T12:00:00Z'),
      ($2,$5,$8,'B1','b1','2026-08-13T12:01:00Z'),
      ($3,$5,$7,'A2','a2','2026-08-13T12:02:00Z'),
      ($4,$6,$7,'only A','only-a','2026-08-13T12:02:00Z')`, [a1, b1, a2, onlyA, mixedThread, emptyThread, userA, userB]);
    await client.query("INSERT INTO thread_reads(thread_id,user_id,last_read_message_id) VALUES($1,$2,$3)", [mixedThread, userB, a2]);

    const cleanupAt = new Date("2026-08-13T13:00:00.000Z");
    await deleteAuthoredMessagesAndRecomputeThreads(client, userA, cleanupAt);
    let mixed = (await client.query<{ last_message_text: string | null; last_message_at: Date | null }>(
      "SELECT last_message_text,last_message_at FROM threads WHERE id=$1",
      [mixedThread],
    )).rows[0]!;
    const empty = (await client.query<{ last_message_text: string | null; last_message_at: Date | null }>(
      "SELECT last_message_text,last_message_at FROM threads WHERE id=$1",
      [emptyThread],
    )).rows[0]!;
    const remaining = await client.query<{ text: string }>("SELECT text FROM messages WHERE thread_id=$1 ORDER BY created_at,id", [mixedThread]);
    const readState = await client.query<{ last_read_message_id: string | null }>("SELECT last_read_message_id FROM thread_reads WHERE thread_id=$1 AND user_id=$2", [mixedThread, userB]);

    assert.deepEqual(remaining.rows.map((row) => row.text), ["B1"]);
    assert.equal(mixed.last_message_text, "B1");
    assert.equal(mixed.last_message_at?.toISOString(), "2026-08-13T12:01:00.000Z");
    assert.equal(empty.last_message_text, null);
    assert.equal(empty.last_message_at, null);
    assert.equal(readState.rows[0]?.last_read_message_id, null);

    await deleteAuthoredMessagesAndRecomputeThreads(client, userA, cleanupAt);
    mixed = (await client.query<{ last_message_text: string | null; last_message_at: Date | null }>(
      "SELECT last_message_text,last_message_at FROM threads WHERE id=$1",
      [mixedThread],
    )).rows[0]!;
    assert.equal(mixed.last_message_text, "B1");

    const jobId = randomUUID();
    await client.query(`INSERT INTO account_deletion_jobs(id,user_id,object_keys,deleted_object_keys,status,attempt_count,next_attempt_at)
      VALUES($1,$2,'["users/test/private.jpg","users/test/deleted.jpg"]'::jsonb,'["users/test/deleted.jpg"]'::jsonb,'processing',10,now())`, [jobId, userA]);
    const retryNow = Date.parse("2026-08-13T14:00:00.000Z");
    await scheduleAccountDeletionRetry(jobId, 10, "storage_delete_failed", retryNow, client);
    const job = (await client.query<{
      status: string;
      attempt_count: number;
      deleted_object_keys: string[];
      next_attempt_at: Date;
    }>("SELECT status,attempt_count,deleted_object_keys,next_attempt_at FROM account_deletion_jobs WHERE id=$1", [jobId])).rows[0]!;
    assert.equal(job.status, "retry");
    assert.equal(job.attempt_count, 11);
    assert.deepEqual(job.deleted_object_keys, ["users/test/deleted.jpg"]);
    assert.ok(job.next_attempt_at.getTime() > retryNow);
  } finally {
    try { await client.query("ROLLBACK"); } finally {
      client.release();
      await closeDb();
    }
  }
});
