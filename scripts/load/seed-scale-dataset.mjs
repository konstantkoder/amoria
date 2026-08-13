import pg from "pg";

const count = Number.parseInt(process.env.SCALE_USER_COUNT || process.argv[2] || "200000", 10);
if (!Number.isInteger(count) || count < 1 || count > 5_000_000) throw new Error("SCALE_USER_COUNT must be 1..5000000");
const connectionString = process.env.SCALE_DATABASE_URL;
if (!connectionString) throw new Error("SCALE_DATABASE_URL is required");
const url = new URL(connectionString);
if (!/(test|scale|bench|dev)/i.test(url.pathname) || process.env.CONFIRM_SCALE_DATASET !== "I_CONFIRM_TEST_DATABASE") {
  throw new Error("Refusing database without test/scale/bench/dev in its name and CONFIRM_SCALE_DATASET=I_CONFIRM_TEST_DATABASE");
}

const pool = new pg.Pool({ connectionString, max: 1, statement_timeout: 0 });
try {
  await pool.query("SET application_name='amoria_scale_seed'");
  await pool.query(`
    INSERT INTO users(id,email,password_hash,display_name,amoria_id,email_verified_at,gender,preferred_genders,birth_date,last_seen_at)
    SELECT md5('scale-user-'||n)::uuid,
      'scale-'||n||'@load.invalid',
      '!scale-fixture-no-login!',
      'Scale User '||n,
      'S'||lpad(n::text,9,'0'),
      now(),
      CASE n%3 WHEN 0 THEN 'woman' WHEN 1 THEN 'man' ELSE 'nonbinary' END,
      '["woman","man","nonbinary"]'::jsonb,
      date '1990-01-01' + ((n%5000)::int),
      now() - ((n%3600)||' seconds')::interval
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO nearby_profile_visibility(user_id,status,latitude,longitude,radius_km,nearby_status,status_kind,updated_at,expires_at)
    SELECT md5('scale-user-'||n)::uuid,'active',45.70+(n%2000)/10000.0,15.85+(n%2000)/10000.0,
      25,'Available for scale QA','coffee',now(),now()+interval '24 hours'
    FROM generate_series(1,$1) n WHERE n%5=0
    ON CONFLICT (user_id) DO UPDATE SET status='active',expires_at=excluded.expires_at
  `, [count]);
  await pool.query(`
    INSERT INTO threads(id,type,created_at,updated_at,last_message_at,last_message_text)
    SELECT md5('scale-thread-'||n)::uuid,'direct',now()-((n%86400)||' seconds')::interval,
      now(),now()-((n%3600)||' seconds')::interval,'Synthetic scale message'
    FROM generate_series(10,$1,10) n
    ON CONFLICT (id) DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO direct_thread_pairs(user_a_id,user_b_id,thread_id)
    SELECT md5('scale-user-'||(n-1))::uuid,md5('scale-user-'||n)::uuid,md5('scale-thread-'||n)::uuid
    FROM generate_series(10,$1,10) n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO thread_members(thread_id,user_id)
    SELECT md5('scale-thread-'||n)::uuid,md5('scale-user-'||member_n)::uuid
    FROM generate_series(10,$1,10) n
    CROSS JOIN LATERAL unnest(ARRAY[n-1,n]) member_n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO messages(id,thread_id,from_user_id,text,client_message_id,created_at)
    SELECT md5('scale-message-'||n)::uuid,md5('scale-thread-'||n)::uuid,
      md5('scale-user-'||n)::uuid,'Synthetic scale message','scale-seed-'||n,
      now()-((n%3600)||' seconds')::interval
    FROM generate_series(10,$1,10) n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO together_queue(id,user_id,activity,status,expires_at,latitude,longitude,radius_km,
      location_updated_at,user_age,preferred_age_min,preferred_age_max)
    SELECT md5('scale-queue-'||n)::uuid,md5('scale-user-'||n)::uuid,
      CASE WHEN n%100=0 THEN 'draw' ELSE 'story_sparks' END,'waiting',now()+interval '24 hours',
      45.70+(n%2000)/10000.0,15.85+(n%2000)/10000.0,25,now(),25,18,45
    FROM generate_series(50,$1,50) n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO notifications(id,user_id,type,title_key,payload,event_key,created_at)
    SELECT md5('scale-notification-'||n)::uuid,md5('scale-user-'||n)::uuid,
      'direct_message','notification.direct_message','{}'::jsonb,'scale-seed-'||n,
      now()-((n%86400)||' seconds')::interval
    FROM generate_series(20,$1,20) n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO push_tokens(id,user_id,token,platform,device_id)
    SELECT md5('scale-push-token-'||n)::uuid,md5('scale-user-'||n)::uuid,
      'ExponentPushToken[scale'||n||']',CASE WHEN n%200=0 THEN 'ios' ELSE 'android' END,'scale-device-'||n
    FROM generate_series(100,$1,100) n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO push_deliveries(id,notification_id,push_token_id,status,next_attempt_at)
    SELECT md5('scale-push-delivery-'||n)::uuid,md5('scale-notification-'||n)::uuid,
      md5('scale-push-token-'||n)::uuid,'pending',now()
    FROM generate_series(100,$1,100) n
    ON CONFLICT DO NOTHING
  `, [count]);
  const result = await pool.query(`SELECT
    (SELECT count(*) FROM users WHERE email LIKE 'scale-%@load.invalid')::int users,
    (SELECT count(*) FROM threads WHERE last_message_text='Synthetic scale message')::int threads,
    (SELECT count(*) FROM together_queue WHERE id IN (
      SELECT md5('scale-queue-'||n)::uuid FROM generate_series(50,$1,50) n
    ))::int together_queue,
    (SELECT count(*) FROM push_deliveries WHERE id IN (
      SELECT md5('scale-push-delivery-'||n)::uuid FROM generate_series(100,$1,100) n
    ))::int push_deliveries`, [count]);
  process.stdout.write(`${JSON.stringify({
    requested: count,
    usersPresent: result.rows[0].users,
    threadsPresent: result.rows[0].threads,
    togetherQueuePresent: result.rows[0].together_queue,
    pushDeliveriesPresent: result.rows[0].push_deliveries,
    measured: true,
  })}\n`);
} finally {
  await pool.end();
}
