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
  ["together_live_candidate", `SELECT q.id FROM together_queue q JOIN users u ON u.id=q.user_id
    WHERE q.status='waiting' AND q.activity='draw' AND q.expires_at>now() AND u.account_status='active'
      AND q.latitude BETWEEN 45.5889 AND 46.0411 AND q.longitude BETWEEN 15.6628 AND 16.3012
      AND q.user_age BETWEEN 18 AND 40 AND q.preferred_age_min<=30
      AND (q.preferred_age_max IS NULL OR q.preferred_age_max>=30)
      AND 6371*2*asin(least(1,sqrt(
        pow(sin(radians(q.latitude-45.815)/2),2)+cos(radians(45.815))*cos(radians(q.latitude))*
        pow(sin(radians(q.longitude-15.982)/2),2)
      )))<=25
      AND (q.radius_km IS NULL OR 6371*2*asin(least(1,sqrt(
        pow(sin(radians(q.latitude-45.815)/2),2)+cos(radians(45.815))*cos(radians(q.latitude))*
        pow(sin(radians(q.longitude-15.982)/2),2)
      )))<=q.radius_km)
    ORDER BY q.created_at,q.id LIMIT 50 FOR UPDATE OF q SKIP LOCKED`],
  ["together_turn_based_candidate", `SELECT m.id FROM together_turn_based_moments m
    JOIN users starter ON starter.id=m.starter_user_id
    WHERE m.status='waiting_for_partner' AND m.waiting_expires_at>now() AND starter.account_status='active'
      AND m.latitude BETWEEN 45.5889 AND 46.0411 AND m.longitude BETWEEN 15.6628 AND 16.3012
      AND 6371*2*asin(least(1,sqrt(
        pow(sin(radians(m.latitude-45.815)/2),2)+cos(radians(45.815))*cos(radians(m.latitude))*
        pow(sin(radians(m.longitude-15.982)/2),2)
      )))<=LEAST(COALESCE(m.radius_km,2147483647),25)
    ORDER BY m.created_at,m.id LIMIT 1 FOR UPDATE OF m SKIP LOCKED`],
  ["nearby_summary_refresh", `SELECT
    (SELECT count(*) FROM users WHERE account_status='active') total_users,
    (SELECT count(*) FROM users WHERE account_status='active' AND last_seen_at>now()-interval '5 minutes') online_now,
    (SELECT count(*) FROM nearby_profile_visibility WHERE status='active' AND expires_at>now()) active_nearby`],
  ["notifications", `SELECT id FROM notifications WHERE user_id=(SELECT user_id FROM notifications LIMIT 1) ORDER BY created_at DESC,id DESC LIMIT 50`],
  ["push_claim", `SELECT id FROM push_deliveries WHERE status IN ('pending','retry') AND next_attempt_at<=now() ORDER BY next_attempt_at LIMIT 100 FOR UPDATE SKIP LOCKED`],
];
try {
  for (const [name, query] of queries) {
    const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
    process.stdout.write(`${JSON.stringify({ name, plan: result.rows[0]["QUERY PLAN"][0] })}\n`);
  }
} finally { await pool.end(); }
