import pg from "pg";

const connectionString = process.env.SCALE_DATABASE_URL;
if (!connectionString) throw new Error("SCALE_DATABASE_URL is required");
const url = new URL(connectionString);
if (
  !/(test|scale|bench|dev)/i.test(url.pathname) ||
  /prod|production/i.test(`${url.hostname}${url.pathname}`) ||
  process.env.NODE_ENV === "production" ||
  process.env.CONFIRM_EXPLAIN !== "I_CONFIRM_NON_PRODUCTION"
) throw new Error("EXPLAIN ANALYZE is limited to confirmed non-production databases");

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const fixture = await pool.query(`SELECT tm.user_id,tm.thread_id
    FROM thread_members tm JOIN users u ON u.id=tm.user_id
    WHERE u.email LIKE 'scale-%@load.invalid' ORDER BY u.amoria_id LIMIT 1`);
  const { user_id: userId, thread_id: threadId } = fixture.rows[0] || {};
  if (!userId || !threadId) throw new Error("Scale users and threads must be seeded before EXPLAIN");

  const queries = [
    ["auth_access_state", `SELECT id,account_status,auth_version,last_seen_at FROM users WHERE id=$1 LIMIT 1`, [userId]],
    ["chat_messages", `SELECT id FROM messages WHERE thread_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50`, [threadId]],
    ["chat_inbox", `SELECT t.id FROM thread_members tm JOIN threads t ON t.id=tm.thread_id WHERE tm.user_id=$1 ORDER BY t.last_message_at DESC NULLS LAST LIMIT 30`, [userId]],
    ["nearby_feed", `WITH candidates AS MATERIALIZED (
        SELECT id FROM nearby_statuses WHERE expires_at>now()
          AND lat BETWEEN 45.7 AND 45.9 AND lng BETWEEN 15.8 AND 16.1
        ORDER BY point(lng,lat) <-> point(15.95,45.8) LIMIT 500
      )
      SELECT s.id FROM candidates c JOIN nearby_statuses s ON s.id=c.id
      JOIN users u ON u.id=s.author_user_id
      LEFT JOIN blocked_users b ON b.user_id=$1 AND b.blocked_user_id=s.author_user_id
      WHERE u.account_status='active' AND b.blocked_user_id IS NULL
        AND 6371000*2*asin(least(1,sqrt(
          pow(sin(radians(s.lat-45.8)/2),2)+cos(radians(45.8))*cos(radians(s.lat))*
          pow(sin(radians(s.lng-15.95)/2),2)
        )))<=10000
        AND 6371000*2*asin(least(1,sqrt(
          pow(sin(radians(s.lat-45.8)/2),2)+cos(radians(45.8))*cos(radians(s.lat))*
          pow(sin(radians(s.lng-15.95)/2),2)
        )))<=s.radius_meters
      ORDER BY 6371000*2*asin(least(1,sqrt(
        pow(sin(radians(s.lat-45.8)/2),2)+cos(radians(45.8))*cos(radians(s.lat))*
        pow(sin(radians(s.lng-15.95)/2),2)
      ))),s.created_at DESC,s.id DESC LIMIT 100`, [userId]],
    ["nearby_profile_feed", `WITH candidates AS MATERIALIZED (
        SELECT user_id FROM nearby_profile_visibility
        WHERE user_id<>$1 AND status='active' AND expires_at>now()
          AND latitude BETWEEN 45.5889 AND 46.0411 AND longitude BETWEEN 15.6628 AND 16.3012
        ORDER BY point(longitude,latitude) <-> point(15.982,45.815) LIMIT 500
      )
      SELECT v.user_id FROM candidates c
      JOIN nearby_profile_visibility v ON v.user_id=c.user_id
      JOIN users u ON u.id=v.user_id
      LEFT JOIN blocked_users vb ON vb.user_id=$1 AND vb.blocked_user_id=v.user_id
      LEFT JOIN blocked_users cb ON cb.user_id=v.user_id AND cb.blocked_user_id=$1
      WHERE u.account_status='active' AND vb.blocked_user_id IS NULL AND cb.blocked_user_id IS NULL
        AND 6371*2*asin(least(1,sqrt(
          pow(sin(radians(v.latitude-45.815)/2),2)+cos(radians(45.815))*cos(radians(v.latitude))*
          pow(sin(radians(v.longitude-15.982)/2),2)
        )))<=25
      ORDER BY 6371*2*asin(least(1,sqrt(
        pow(sin(radians(v.latitude-45.815)/2),2)+cos(radians(45.815))*cos(radians(v.latitude))*
        pow(sin(radians(v.longitude-15.982)/2),2)
      ))),v.updated_at DESC LIMIT 100`, [userId]],
    ["nearby_summary_refresh", `SELECT
      (SELECT count(*) FROM users WHERE account_status='active') total_users,
      (SELECT count(*) FROM users WHERE account_status='active' AND last_seen_at>now()-interval '5 minutes') online_now,
      (SELECT count(*) FROM nearby_profile_visibility WHERE status='active' AND expires_at>now()) active_nearby`, []],
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
      ORDER BY q.created_at,q.id LIMIT 50 FOR UPDATE OF q SKIP LOCKED`, []],
    ["together_turn_based_candidate", `SELECT m.id FROM together_turn_based_moments m
      JOIN users starter ON starter.id=m.starter_user_id
      WHERE m.status='waiting_for_partner' AND m.waiting_expires_at>now() AND starter.account_status='active'
        AND m.latitude BETWEEN 45.5889 AND 46.0411 AND m.longitude BETWEEN 15.6628 AND 16.3012
        AND 6371*2*asin(least(1,sqrt(
          pow(sin(radians(m.latitude-45.815)/2),2)+cos(radians(45.815))*cos(radians(m.latitude))*
          pow(sin(radians(m.longitude-15.982)/2),2)
        )))<=LEAST(COALESCE(m.radius_km,2147483647),25)
      ORDER BY m.created_at,m.id LIMIT 1 FOR UPDATE OF m SKIP LOCKED`, []],
    ["notifications", `SELECT id FROM notifications WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50`, [userId]],
    ["push_claim", `WITH candidate AS MATERIALIZED (
      SELECT d.id FROM push_deliveries d
      WHERE (((d.status IN ('pending','retry')) AND d.next_attempt_at<=now())
        OR (d.status='sending' AND d.updated_at<=now()-interval '5 minutes'))
        AND EXISTS (SELECT 1 FROM push_tokens t WHERE t.id=d.push_token_id AND t.disabled_at IS NULL)
      ORDER BY d.next_attempt_at LIMIT 100 FOR UPDATE OF d SKIP LOCKED
    ) SELECT d.id FROM candidate c
      JOIN push_deliveries d ON d.id=c.id
      JOIN push_tokens t ON t.id=d.push_token_id
      JOIN notifications n ON n.id=d.notification_id`, []],
  ];

  for (const [name, query, parameters] of queries) {
    const result = await pool.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`, parameters);
    const explained = result.rows[0]["QUERY PLAN"][0];
    process.stdout.write(`${JSON.stringify({ name, ...summarize(explained), plan: explained.Plan })}\n`);
  }
} finally {
  await pool.end();
}

function summarize(explained) {
  const indexes = new Set();
  const sequentialScans = [];
  const sorts = [];
  let actualRows = 0;
  let rowsRemoved = 0;
  let sharedHitBlocks = 0;
  let sharedReadBlocks = 0;
  walk(explained.Plan, (node) => {
    actualRows += Number(node["Actual Rows"] || 0) * Number(node["Actual Loops"] || 1);
    rowsRemoved += Number(node["Rows Removed by Filter"] || 0) + Number(node["Rows Removed by Join Filter"] || 0);
    sharedHitBlocks += Number(node["Shared Hit Blocks"] || 0);
    sharedReadBlocks += Number(node["Shared Read Blocks"] || 0);
    if (node["Index Name"]) indexes.add(node["Index Name"]);
    if (node["Node Type"] === "Seq Scan") sequentialScans.push(node["Relation Name"]);
    if (node["Node Type"] === "Sort") sorts.push(node["Sort Method"] || "unknown");
  });
  return {
    planningMs: explained["Planning Time"],
    executionMs: explained["Execution Time"],
    actualRows,
    rowsRemoved,
    sharedHitBlocks,
    sharedReadBlocks,
    indexes: [...indexes],
    sequentialScans,
    sorts,
  };
}

function walk(node, visit) {
  visit(node);
  for (const child of node.Plans || []) walk(child, visit);
}
