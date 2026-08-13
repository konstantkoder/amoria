import pg from "pg";

const connectionString = process.env.SCALE_DATABASE_URL;
if (!connectionString) throw new Error("SCALE_DATABASE_URL is required");
const url = new URL(connectionString);
if (!/(test|scale|bench|dev)/i.test(url.pathname) || process.env.CONFIRM_EXPLAIN !== "I_CONFIRM_NON_PRODUCTION") {
  throw new Error("EXPLAIN ANALYZE is limited to confirmed non-production databases");
}
const pool = new pg.Pool({ connectionString, max: 1 });
const queries = [
  ["chat_messages", `SELECT id FROM messages WHERE thread_id=(SELECT thread_id FROM messages LIMIT 1) ORDER BY created_at DESC,id DESC LIMIT 50`],
  ["chat_inbox", `SELECT t.id FROM thread_members tm JOIN threads t ON t.id=tm.thread_id WHERE tm.user_id=(SELECT user_id FROM thread_members LIMIT 1) ORDER BY t.last_message_at DESC NULLS LAST LIMIT 30`],
  ["nearby_geo", `SELECT user_id FROM nearby_profile_visibility WHERE status='active' AND expires_at>now() AND latitude BETWEEN 45.7 AND 45.9 AND longitude BETWEEN 15.8 AND 16.1 LIMIT 100`],
  ["together_queue", `SELECT id FROM together_queue WHERE status='waiting' AND activity='draw' AND expires_at>now() ORDER BY created_at LIMIT 50 FOR UPDATE SKIP LOCKED`],
  ["notifications", `SELECT id FROM notifications WHERE user_id=(SELECT user_id FROM notifications LIMIT 1) ORDER BY created_at DESC,id DESC LIMIT 50`],
  ["push_claim", `SELECT id FROM push_deliveries WHERE status IN ('pending','retry') AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 100 FOR UPDATE SKIP LOCKED`],
];
try {
  for (const [name, query] of queries) {
    const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
    process.stdout.write(`${JSON.stringify({ name, plan: result.rows[0]["QUERY PLAN"][0] })}\n`);
  }
} finally { await pool.end(); }
