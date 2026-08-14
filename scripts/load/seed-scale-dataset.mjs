import pg from "pg";

const count = integer("SCALE_USER_COUNT", process.argv[2] || "200000", 1, 5_000_000);
const profile = (process.env.SCALE_DATASET_PROFILE || "light").toLowerCase();
if (!new Set(["light", "representative"]).has(profile)) {
  throw new Error("SCALE_DATASET_PROFILE must be light or representative");
}
const connectionString = process.env.SCALE_DATABASE_URL;
if (!connectionString) throw new Error("SCALE_DATABASE_URL is required");
guardScaleDatabase(connectionString, "CONFIRM_SCALE_DATASET", "I_CONFIRM_TEST_DATABASE");

const threadCount = Math.floor(count / 10);
const messagesPerThread = integer(
  "MESSAGES_PER_THREAD",
  profile === "representative" ? "20" : "1",
  1,
  1_000,
);
const nearbyCount = cardinality("SCALE_NEARBY_ACTIVE_COUNT", Math.floor(count / 5), count);
const liveWaitingCount = cardinality(
  "SCALE_TOGETHER_WAITING_COUNT",
  profile === "representative" ? Math.min(20_000, Math.floor(count / 20)) : Math.floor(count / 50),
  count,
);
const turnWaitingCount = cardinality(
  "SCALE_TURN_BASED_WAITING_COUNT",
  profile === "representative" ? Math.min(20_000, Math.floor(count / 20)) : Math.min(500, Math.floor(count / 100)),
  count,
);
const notificationCount = cardinality(
  "SCALE_NOTIFICATION_COUNT",
  profile === "representative" ? count : Math.floor(count / 20),
  10_000_000,
);
const pushDeliveryCount = cardinality(
  "SCALE_PUSH_DELIVERY_COUNT",
  profile === "representative" ? Math.min(100_000, Math.floor(count / 10)) : Math.floor(count / 100),
  Math.min(notificationCount, count),
);
const photoJobCount = cardinality(
  "SCALE_PHOTO_JOB_COUNT",
  profile === "representative" ? Math.min(50_000, Math.floor(count / 20)) : Math.min(100, Math.floor(count / 1_000)),
  count,
);

const pool = new pg.Pool({ connectionString, max: 1, statement_timeout: 0 });
try {
  await pool.query("SET application_name='amoria_scale_seed'");
  await pool.query(`CREATE OR REPLACE FUNCTION pg_temp.scale_uuid(seed_value text) RETURNS uuid
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
      SELECT overlay(overlay(md5(seed_value) placing '4' from 13 for 1) placing '8' from 17 for 1)::uuid
    $$`);
  await pool.query(`
    INSERT INTO users(id,email,password_hash,display_name,amoria_id,email_verified_at,gender,preferred_genders,
      preferred_age_min,preferred_age_max,birth_date,last_seen_at,auth_version)
    SELECT pg_temp.scale_uuid('scale-user-'||n),
      'scale-'||n||'@load.invalid','!scale-fixture-no-login!','Scale User '||n,
      'S'||lpad(n::text,9,'0'),now(),
      CASE n%3 WHEN 0 THEN 'woman' WHEN 1 THEN 'man' ELSE 'nonbinary' END,
      '["woman","man","nonbinary"]'::jsonb,18,65,
      date '1990-01-01' + ((n%5000)::int),now() - ((n%3600)||' seconds')::interval,0
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [count]);

  await pool.query(`
    INSERT INTO nearby_profile_visibility(user_id,status,latitude,longitude,radius_km,nearby_status,status_kind,updated_at,expires_at)
    SELECT pg_temp.scale_uuid('scale-user-'||n),'active',
      45.75+((n%1000)/10000.0),15.90+((n%1000)/10000.0),
      25,'Available for scale QA','coffee',now(),now()+interval '24 hours'
    FROM generate_series(1,$1) n
    ON CONFLICT (user_id) DO UPDATE SET status='active',latitude=excluded.latitude,
      longitude=excluded.longitude,expires_at=excluded.expires_at
  `, [nearbyCount]);
  await pool.query(`
    INSERT INTO nearby_statuses(id,author_user_id,text,lat,lng,radius_meters,expires_at,created_at)
    SELECT pg_temp.scale_uuid('scale-nearby-status-'||n),pg_temp.scale_uuid('scale-user-'||n),
      'Synthetic Nearby scale status '||n,
      45.75+((n%1000)/10000.0),15.90+((n%1000)/10000.0),25000,
      now()+interval '24 hours',now()-((n%3600)||' seconds')::interval
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [nearbyCount]);

  await pool.query(`
    INSERT INTO threads(id,type,created_at,updated_at,last_message_at,last_message_text)
    SELECT pg_temp.scale_uuid('scale-thread-'||n),'direct',now()-((n%86400)||' seconds')::interval,
      now(),now()-((n%3600)||' seconds')::interval,'Synthetic scale message'
    FROM generate_series(10,$1,10) n
    ON CONFLICT (id) DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO direct_thread_pairs(user_a_id,user_b_id,thread_id)
    SELECT LEAST(pg_temp.scale_uuid('scale-user-'||(n-1)),pg_temp.scale_uuid('scale-user-'||n)),
      GREATEST(pg_temp.scale_uuid('scale-user-'||(n-1)),pg_temp.scale_uuid('scale-user-'||n)),
      pg_temp.scale_uuid('scale-thread-'||n)
    FROM generate_series(10,$1,10) n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO thread_members(thread_id,user_id)
    SELECT pg_temp.scale_uuid('scale-thread-'||n),pg_temp.scale_uuid('scale-user-'||member_n)
    FROM generate_series(10,$1,10) n CROSS JOIN LATERAL unnest(ARRAY[n-1,n]) member_n
    ON CONFLICT DO NOTHING
  `, [count]);
  await pool.query(`
    INSERT INTO messages(id,thread_id,from_user_id,text,client_message_id,created_at)
    SELECT pg_temp.scale_uuid('scale-message-'||n||'-'||message_n),pg_temp.scale_uuid('scale-thread-'||n),
      pg_temp.scale_uuid('scale-user-'||(CASE WHEN message_n%2=0 THEN n-1 ELSE n END)),
      'Synthetic scale message '||message_n,'scale-seed-'||n||'-'||message_n,
      now()-(((n+message_n)%86400)||' seconds')::interval
    FROM generate_series(10,$1,10) n
    CROSS JOIN generate_series(1,$2) message_n
    ON CONFLICT DO NOTHING
  `, [count, messagesPerThread]);

  await pool.query(`
    INSERT INTO together_queue(id,user_id,activity,status,expires_at,latitude,longitude,radius_km,
      location_updated_at,user_age,preferred_age_min,preferred_age_max)
    SELECT pg_temp.scale_uuid('scale-queue-'||n),pg_temp.scale_uuid('scale-user-'||n),
      CASE WHEN n%10=0 THEN 'draw' ELSE 'story_sparks' END,'waiting',now()+interval '24 hours',
      CASE WHEN n%5<3 THEN 45.75+((n%1000)/10000.0) ELSE 40.70+((n%500)/10000.0) END,
      CASE WHEN n%5<3 THEN 15.90+((n%1000)/10000.0) ELSE -74.05+((n%500)/10000.0) END,
      25,now(),25,18,65
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [liveWaitingCount]);

  await pool.query(`
    INSERT INTO together_sessions(id,mode,activity,status,prompt_text,deadline_at,created_at,updated_at)
    SELECT pg_temp.scale_uuid('scale-turn-session-'||n),'turn_based','draw','active',
      'Synthetic scale turn-based drawing',now()+interval '24 hours',
      CASE WHEN n%5>=3 THEN now()-interval '2 days'-(n||' milliseconds')::interval ELSE now()-(n||' milliseconds')::interval END,
      now()
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [turnWaitingCount]);
  await pool.query(`
    INSERT INTO together_turn_based_moments(
      id,status,stage,starter_user_id,draw_session_id,current_turn_user_id,
      latitude,longitude,radius_km,starter_age,preferred_age_min,preferred_age_max,
      starter_gender,preferred_genders,starter_submitted_at,waiting_expires_at,
      last_transition,client_request_id,created_at,updated_at)
    SELECT pg_temp.scale_uuid('scale-turn-moment-'||n),'waiting_for_partner','draw',
      pg_temp.scale_uuid('scale-user-'||n),pg_temp.scale_uuid('scale-turn-session-'||n),NULL,
      CASE WHEN n%5<3 THEN 45.75+((n%1000)/10000.0) ELSE 40.70+((n%500)/10000.0) END,
      CASE WHEN n%5<3 THEN 15.90+((n%1000)/10000.0) ELSE -74.05+((n%500)/10000.0) END,
      25,25,18,65,
      CASE n%3 WHEN 0 THEN 'woman' WHEN 1 THEN 'man' ELSE 'nonbinary' END,
      '["woman","man","nonbinary"]'::jsonb,now(),now()+interval '24 hours',
      'scale_waiting_seed','scale-turn-'||n,
      CASE WHEN n%5>=3 THEN now()-interval '2 days'-(n||' milliseconds')::interval ELSE now()-(n||' milliseconds')::interval END,
      now()
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [turnWaitingCount]);
  await pool.query(`
    INSERT INTO together_turn_based_participants(moment_id,user_id,role,active)
    SELECT pg_temp.scale_uuid('scale-turn-moment-'||n),pg_temp.scale_uuid('scale-user-'||n),'starter',true
    FROM generate_series(1,$1) n
    ON CONFLICT DO NOTHING
  `, [turnWaitingCount]);

  await pool.query(`
    INSERT INTO notifications(id,user_id,type,title_key,payload,event_key,created_at)
    SELECT pg_temp.scale_uuid('scale-notification-'||n),
      pg_temp.scale_uuid('scale-user-'||(((n-1)%$2)+1)),'direct_message','notification.direct_message',
      '{}'::jsonb,'scale-seed-'||n,now()-((n%86400)||' seconds')::interval
    FROM generate_series(1,$1) n
    ON CONFLICT DO NOTHING
  `, [notificationCount, count]);
  await pool.query(`
    INSERT INTO push_tokens(id,user_id,token,platform,device_id)
    SELECT pg_temp.scale_uuid('scale-push-token-'||n),pg_temp.scale_uuid('scale-user-'||n),
      'ExponentPushToken[scale'||n||']',CASE WHEN n%2=0 THEN 'ios' ELSE 'android' END,'scale-device-'||n
    FROM generate_series(1,$1) n
    ON CONFLICT DO NOTHING
  `, [pushDeliveryCount]);
  await pool.query(`
    INSERT INTO push_deliveries(id,notification_id,push_token_id,status,next_attempt_at)
    SELECT pg_temp.scale_uuid('scale-push-delivery-'||n),pg_temp.scale_uuid('scale-notification-'||n),
      pg_temp.scale_uuid('scale-push-token-'||n),'pending',now()
    FROM generate_series(1,$1) n
    ON CONFLICT DO NOTHING
  `, [pushDeliveryCount]);

  await pool.query(`
    INSERT INTO media_files(id,owner_user_id,type,path,url,mime_type,size_bytes,width,height,
      checksum_sha256,moderation_state,moderation_origin,created_at)
    SELECT pg_temp.scale_uuid('scale-photo-'||n),pg_temp.scale_uuid('scale-user-'||n),'profile_photo',
      'scale-fixture/not-materialized/'||n||'.jpg',
      'http://minio:9000/amoria-scale-fixtures/not-materialized/'||n||'.jpg',
      'image/jpeg',1,1,1,repeat('0',64),'pending','unclassified',now()-((n%86400)||' seconds')::interval
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [photoJobCount]);
  await pool.query(`
    INSERT INTO media_moderation_jobs(id,media_id,status,next_attempt_at,provider_engine,model_version,policy_version,created_at,updated_at)
    SELECT pg_temp.scale_uuid('scale-photo-job-'||n),pg_temp.scale_uuid('scale-photo-'||n),'queued',now(),
      'scale_fixture_claim_only','not_materialized','scale-v1',now()-((n%86400)||' seconds')::interval,now()
    FROM generate_series(1,$1) n
    ON CONFLICT (id) DO NOTHING
  `, [photoJobCount]);

  await pool.query(`ANALYZE users, nearby_profile_visibility, nearby_statuses,
    threads, direct_thread_pairs, thread_members, messages, together_queue,
    together_sessions, together_turn_based_moments, together_turn_based_participants,
    notifications, push_tokens, push_deliveries, media_files, media_moderation_jobs`);

  const result = await pool.query(`SELECT
    (SELECT count(*) FROM users WHERE email LIKE 'scale-%@load.invalid')::int users,
    (SELECT count(*) FROM messages WHERE client_message_id LIKE 'scale-seed-%')::int messages,
    (SELECT count(*) FROM nearby_profile_visibility v JOIN users u ON u.id=v.user_id WHERE u.email LIKE 'scale-%@load.invalid' AND v.status='active')::int nearby_active,
    (SELECT count(*) FROM nearby_statuses WHERE id IN (SELECT pg_temp.scale_uuid('scale-nearby-status-'||n) FROM generate_series(1,$3) n))::int nearby_statuses,
    (SELECT count(*) FROM together_queue WHERE id IN (SELECT pg_temp.scale_uuid('scale-queue-'||n) FROM generate_series(1,$1) n))::int together_waiting,
    (SELECT count(*) FROM together_turn_based_moments WHERE client_request_id LIKE 'scale-turn-%' AND status='waiting_for_partner')::int turn_waiting,
    (SELECT count(*) FROM notifications WHERE event_key LIKE 'scale-seed-%')::int notifications,
    (SELECT count(*) FROM push_deliveries WHERE id IN (SELECT pg_temp.scale_uuid('scale-push-delivery-'||n) FROM generate_series(1,$2) n))::int push_deliveries,
    (SELECT count(*) FROM media_moderation_jobs WHERE provider_engine='scale_fixture_claim_only')::int photo_jobs`,
  [liveWaitingCount, pushDeliveryCount, nearbyCount]);
  process.stdout.write(`${JSON.stringify({
    profile,
    requestedUsers: count,
    messagesPerThread,
    ...result.rows[0],
    measured: true,
  })}\n`);
} finally {
  await pool.end();
}

function integer(name, fallback, min, max) {
  const value = Number.parseInt(process.env[name] || String(fallback), 10);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be ${min}..${max}`);
  }
  return value;
}

function cardinality(name, fallback, max) {
  return integer(name, fallback, 0, max);
}

function guardScaleDatabase(value, confirmationName, confirmationValue) {
  const url = new URL(value);
  if (
    !/(test|scale|bench|dev)/i.test(url.pathname) ||
    /prod|production/i.test(`${url.hostname}${url.pathname}`) ||
    process.env.NODE_ENV === "production" ||
    process.env[confirmationName] !== confirmationValue
  ) {
    throw new Error(`Refusing non-scale database; require a test/scale/bench/dev name and ${confirmationName}=${confirmationValue}`);
  }
}
