import { createHash } from "node:crypto";
import { PutObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import bcrypt from "bcryptjs";
import pg from "pg";
import sharp from "sharp";

const mode = process.argv[2] ?? "seed";
if (!['seed', 'verify'].includes(mode)) throw new Error("Usage: qa-backup-restore-fixture.mjs [seed|verify]");

const required = [
  "DATABASE_URL",
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY",
  "S3_SECRET_KEY",
];
if (mode === "seed") required.push("QA_LOGIN_PASSWORD", "QA_LOCKED_GALLERY_PASSWORD");
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const ids = Object.freeze({
  userA: "05000000-0000-4000-8000-000000000001",
  userB: "05000000-0000-4000-8000-000000000002",
  userC: "05000000-0000-4000-8000-000000000003",
  userD: "05000000-0000-4000-8000-000000000004",
  thread: "05000000-0000-4000-8000-000000000101",
  message: "05000000-0000-4000-8000-000000000201",
  nearbyThread: "05000000-0000-4000-8000-000000000202",
  nearbyRoom: "05000000-0000-4000-8000-000000000301",
  together: "05000000-0000-4000-8000-000000000401",
  publicMedia: "05000000-0000-4000-8000-000000000501",
  lockedMedia: "05000000-0000-4000-8000-000000000502",
  admin: "05000000-0000-4000-8000-000000000601",
  report: "05000000-0000-4000-8000-000000000701",
});

const marker = "AMORIA_AUDIT05_BACKUP_RESTORE";
const publicKey = `qa/audit05/${ids.userA}/public.webp`;
const lockedKey = `qa/audit05/${ids.userA}/locked.webp`;

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY,
    secretAccessKey: process.env.S3_SECRET_KEY,
  },
});
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

async function asset(red, green, blue) {
  return sharp({
    create: { width: 32, height: 32, channels: 3, background: { r: red, g: green, b: blue } },
  }).webp({ quality: 80 }).toBuffer();
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function seed() {
  const [publicBody, lockedBody, passwordHash, folderPasswordHash] = await Promise.all([
    asset(32, 112, 208),
    asset(208, 64, 112),
    bcrypt.hash(process.env.QA_LOGIN_PASSWORD, 12),
    bcrypt.hash(process.env.QA_LOCKED_GALLERY_PASSWORD, 12),
  ]);
  await Promise.all([
    s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: publicKey, Body: publicBody, ContentType: "image/webp" })),
    s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: lockedKey, Body: lockedBody, ContentType: "image/webp" })),
  ]);

  await client.query("BEGIN");
  try {
    const users = [
      [ids.userA, "amoria.audit05.restore.a@gmail.com", "Audit Restore A", "AUDIT05A"],
      [ids.userB, "amoria.audit05.restore.b@gmail.com", "Audit Restore B", "AUDIT05B"],
      [ids.userC, "amoria.audit05.restore.c@gmail.com", "Audit Restore C", "AUDIT05C"],
      [ids.userD, "amoria.audit05.restore.d@gmail.com", "Audit Restore D", "AUDIT05D"],
    ];
    for (const [id, email, displayName, amoriaId] of users) {
      await client.query(
        `INSERT INTO users (id,email,password_hash,display_name,amoria_id,about,email_verified_at,account_status)
         VALUES ($1,$2,$3,$4,$5,$6,now(),'active')
         ON CONFLICT (id) DO UPDATE SET email=EXCLUDED.email,password_hash=EXCLUDED.password_hash,
           display_name=EXCLUDED.display_name,about=EXCLUDED.about,email_verified_at=now(),account_status='active',updated_at=now()`,
        [id, email, passwordHash, displayName, amoriaId, marker],
      );
    }

    await client.query(
      `INSERT INTO threads (id,type,source_type,created_at,updated_at,last_message_at,last_message_text)
       VALUES ($1,'direct','direct',now(),now(),now(),$2)
       ON CONFLICT (id) DO UPDATE SET updated_at=now(),last_message_at=now(),last_message_text=EXCLUDED.last_message_text`,
      [ids.thread, `${marker} message`],
    );
    for (const userId of [ids.userA, ids.userB]) {
      await client.query(
        `INSERT INTO thread_members (thread_id,user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [ids.thread, userId],
      );
    }
    await client.query(
      `INSERT INTO direct_thread_pairs (user_a_id,user_b_id,thread_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
      [ids.userA, ids.userB, ids.thread],
    );
    await client.query(
      `INSERT INTO messages (id,thread_id,from_user_id,text,client_message_id)
       VALUES ($1,$2,$3,$4,'audit05-restore-message')
       ON CONFLICT (id) DO UPDATE SET text=EXCLUDED.text`,
      [ids.message, ids.thread, ids.userA, `${marker} message`],
    );
    await client.query(
      `INSERT INTO message_moderation_states (message_id,state,source,automation_status)
       VALUES ($1,'visible','direct','completed')
       ON CONFLICT (message_id) DO UPDATE SET state='visible',source='direct',automation_status='completed',updated_at=now()`,
      [ids.message],
    );
    await client.query(
      `INSERT INTO message_moderation_reviews (message_id,source,action,reason,metadata)
       SELECT $1,'automated_local_model','allow',$2,$3::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM message_moderation_reviews WHERE message_id=$1 AND reason=$2)`,
      [ids.message, marker, JSON.stringify({ fixture: marker })],
    );

    await client.query(
      `INSERT INTO threads (id,type,source_type,created_at,updated_at)
       VALUES ($1,'nearby','nearby',now(),now()) ON CONFLICT (id) DO UPDATE SET updated_at=now()`,
      [ids.nearbyThread],
    );
    await client.query(
      `INSERT INTO nearby_room_types (key,title,status,admin_approved,sort_order)
       VALUES ('audit05','Audit 05','active',true,905) ON CONFLICT (key) DO UPDATE SET status='active',admin_approved=true`,
    );
    await client.query(
      `INSERT INTO nearby_rooms (id,type_key,thread_id,status,geo_bucket,title,description,location_label)
       VALUES ($1,'audit05',$2,'active','qa-audit05','Audit Restore Room',$3,'Disposable QA')
       ON CONFLICT (id) DO UPDATE SET status='active',updated_at=now(),description=EXCLUDED.description`,
      [ids.nearbyRoom, ids.nearbyThread, marker],
    );
    for (const [userId, role] of [[ids.userA, 'member'], [ids.userC, 'moderator']]) {
      await client.query(
        `INSERT INTO nearby_room_memberships (room_id,user_id,status,role) VALUES ($1,$2,'active',$3)
         ON CONFLICT (room_id,user_id) DO UPDATE SET status='active',role=EXCLUDED.role,left_at=NULL`,
        [ids.nearbyRoom, userId, role],
      );
    }

    await client.query(
      `INSERT INTO together_sessions (id,activity,status,prompt_text,deadline_at,mode,event_count_snapshot)
       VALUES ($1,'conversation','active',$2,now()+interval '1 hour','live',1)
       ON CONFLICT (id) DO UPDATE SET status='active',prompt_text=EXCLUDED.prompt_text,updated_at=now(),event_count_snapshot=1`,
      [ids.together, marker],
    );
    for (const userId of [ids.userB, ids.userD]) {
      await client.query(
        `INSERT INTO together_session_members (session_id,user_id,last_seen_at) VALUES ($1,$2,now())
         ON CONFLICT (session_id,user_id) DO UPDATE SET last_seen_at=now(),left_at=NULL`,
        [ids.together, userId],
      );
    }
    await client.query(
      `INSERT INTO together_events (session_id,from_user_id,client_event_id,type,payload)
       VALUES ($1,$2,'audit05-restore-event','message',$3::jsonb) ON CONFLICT DO NOTHING`,
      [ids.together, ids.userB, JSON.stringify({ text: marker })],
    );

    await client.query(
      `INSERT INTO admin_users (id,user_id,email,display_name,status)
       VALUES ($1,$2,'amoria.audit05.restore.a@gmail.com','Audit Restore Owner','active')
       ON CONFLICT (id) DO UPDATE SET status='active',updated_at=now()`,
      [ids.admin, ids.userA],
    );
    const ownerRole = await client.query(
      `INSERT INTO admin_roles (key,name,description) VALUES ('owner','Owner','Full control')
       ON CONFLICT (key) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
    );
    await client.query(
      `INSERT INTO admin_user_roles (admin_user_id,role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
      [ids.admin, ownerRole.rows[0].id],
    );
    await client.query(
      `INSERT INTO admin_audit_log (admin_user_id,action,target_type,target_id,reason,metadata,request_id)
       SELECT $1,'qa.backup_restore.seed','release_audit',$2,$2,$3::jsonb,'audit05-seed'
       WHERE NOT EXISTS (SELECT 1 FROM admin_audit_log WHERE request_id='audit05-seed')`,
      [ids.admin, marker, JSON.stringify({ fixture: marker })],
    );

    const media = [
      [ids.publicMedia, publicKey, publicBody, 'public'],
      [ids.lockedMedia, lockedKey, lockedBody, 'locked'],
    ];
    for (const [mediaId, key, body, visibility] of media) {
      await client.query(
        `INSERT INTO media_files
           (id,owner_user_id,type,path,url,mime_type,size_bytes,width,height,checksum_sha256,moderation_state,moderation_origin,automated_checked_at)
         VALUES ($1,$2,'profile_photo',$3,$4,'image/webp',$5,32,32,$6,'approved','qa_restore_fixture',now())
         ON CONFLICT (id) DO UPDATE SET path=EXCLUDED.path,url=EXCLUDED.url,size_bytes=EXCLUDED.size_bytes,
           checksum_sha256=EXCLUDED.checksum_sha256,moderation_state='approved',moderation_origin='qa_restore_fixture',moderation_updated_at=now()`,
        [mediaId, ids.userA, key, `/media/public/${mediaId}`, body.length, digest(body)],
      );
      await client.query(
        `INSERT INTO profile_gallery_items (user_id,media_id,visibility,position)
         VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,media_id) DO UPDATE SET visibility=EXCLUDED.visibility,position=EXCLUDED.position,updated_at=now()`,
        [ids.userA, mediaId, visibility, visibility === 'public' ? 0 : 1],
      );
    }
    await client.query(
      `INSERT INTO profile_locked_gallery_settings (user_id,password_hash,password_set_at)
       VALUES ($1,$2,now()) ON CONFLICT (user_id) DO UPDATE SET password_hash=EXCLUDED.password_hash,password_set_at=now(),updated_at=now()`,
      [ids.userA, folderPasswordHash],
    );
    await client.query(
      `INSERT INTO media_moderation_reviews (media_id,owner_user_id,admin_user_id,action,reason,metadata)
       SELECT $1,$2,$3,'approve',$4,$5::jsonb
       WHERE NOT EXISTS (SELECT 1 FROM media_moderation_reviews WHERE media_id=$1 AND reason=$4)`,
      [ids.publicMedia, ids.userA, ids.admin, marker, JSON.stringify({ fixture: marker })],
    );
    await client.query(
      `INSERT INTO safety_reports (id,reporter_user_id,target_type,target_id,target_owner_user_id,reason,comment,status,assigned_admin_user_id)
       VALUES ($1,$2,'message',$3,$4,'other',$5,'under_review',$6)
       ON CONFLICT (id) DO UPDATE SET status='under_review',updated_at=now(),assigned_admin_user_id=EXCLUDED.assigned_admin_user_id`,
      [ids.report, ids.userD, ids.message, ids.userA, marker, ids.admin],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function verify() {
  const checks = {
    users: ["users", "about=$1", marker, 4],
    thread: ["threads", "id=$1", ids.thread, 1],
    message: ["messages", "id=$1", ids.message, 1],
    messageState: ["message_moderation_states", "message_id=$1", ids.message, 1],
    nearby: ["nearby_rooms", "id=$1", ids.nearbyRoom, 1],
    together: ["together_sessions", "id=$1", ids.together, 1],
    togetherEvent: ["together_events", "session_id=$1", ids.together, 1],
    admin: ["admin_users", "id=$1", ids.admin, 1],
    audit: ["admin_audit_log", "request_id=$1", "audit05-seed", 1],
    media: ["media_files", "owner_user_id=$1", ids.userA, 2],
    gallery: ["profile_gallery_items", "user_id=$1", ids.userA, 2],
    report: ["safety_reports", "id=$1", ids.report, 1],
  };
  for (const [name, [table, predicate, parameter, minimum]] of Object.entries(checks)) {
    const result = await client.query(`SELECT count(*)::int AS count FROM ${table} WHERE ${predicate}`, [parameter]);
    if (result.rows[0].count < minimum) throw new Error(`${name} fixture missing`);
  }
  const [publicObject, lockedObject] = await Promise.all([
    s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: publicKey })),
    s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: lockedKey })),
  ]);
  if (!publicObject.Body || !lockedObject.Body) throw new Error("fixture media objects missing");
  console.log(`QA_FIXTURE_DB_CHECKS=${Object.keys(checks).length}`);
  console.log("QA_FIXTURE_MEDIA_OBJECTS=2");
  console.log("QA_FIXTURE_VERIFY=PASS");
}

await client.connect();
try {
  if (mode === "seed") await seed();
  await verify();
} finally {
  await client.end();
  s3.destroy();
}
