import "dotenv/config";
import { randomUUID } from "node:crypto";
import process from "node:process";
import pg from "pg";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index];
  if (!key?.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(key, next);
    index += 1;
  } else {
    args.set(key, "true");
  }
}

const adminUserId = args.get("--admin-user-id");
const email = args.get("--email")?.trim().toLowerCase();
const reason = args.get("--reason")?.trim();
const confirmed = args.get("--confirm-reset-mfa") === "true";
if ((!adminUserId && !email) || (adminUserId && email)) {
  throw new Error("Provide exactly one of --admin-user-id or --email");
}
if (!reason || reason.length < 10 || reason.length > 500) {
  throw new Error("--reason must contain 10-500 characters");
}
if (!confirmed) {
  throw new Error("Explicit --confirm-reset-mfa is required");
}

const connectionString = process.env.DATABASE_MIGRATION_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_MIGRATION_URL or DATABASE_URL is required");
const pool = new pg.Pool({ connectionString, max: 1 });
const client = await pool.connect();
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('amoria_admin_owner_control'))");
  const target = await client.query(`
    SELECT au.id,au.user_id,u.email
      FROM admin_users au JOIN users u ON u.id=au.user_id
     WHERE (($1::uuid IS NOT NULL AND au.id=$1::uuid) OR ($2::text IS NOT NULL AND lower(u.email)=$2))
       AND au.status='active'
       AND EXISTS (
         SELECT 1 FROM admin_user_roles aur JOIN admin_roles ar ON ar.id=aur.role_id
          WHERE aur.admin_user_id=au.id AND ar.key='owner'
       )
     FOR UPDATE OF au,u`, [adminUserId ?? null, email ?? null]);
  if (target.rowCount !== 1) throw new Error("Exactly one active owner Admin target was not found");
  const row = target.rows[0];
  const now = new Date();
  await client.query("UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE admin_user_id=$1", [row.id, now]);
  await client.query("UPDATE admin_step_up_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE admin_user_id=$1", [row.id, now]);
  await client.query("UPDATE admin_mfa_pre_auth_challenges SET consumed_at=COALESCE(consumed_at,$2) WHERE admin_user_id=$1", [row.id, now]);
  await client.query("DELETE FROM admin_mfa_recovery_codes WHERE admin_user_id=$1", [row.id]);
  await client.query("DELETE FROM admin_mfa_credentials WHERE admin_user_id=$1", [row.id]);
  await client.query("UPDATE admin_users SET session_version=session_version+1,updated_at=$2 WHERE id=$1", [row.id, now]);
  await client.query(`
    INSERT INTO admin_audit_log
      (admin_user_id,action,target_type,target_id,reason,metadata,request_id,user_agent,created_at)
    VALUES (NULL,'admin.mfa.emergency_reset','admin_user',$1,$2,$3::jsonb,$4,'offline-admin-security-cli',$5)`,
    [row.id, reason, JSON.stringify({ sessionsRevoked: true, reenrollmentRequired: true, operatorShellRequired: true }), `cli:${randomUUID()}`, now]);
  await client.query("COMMIT");
  process.stdout.write(`MFA reset completed for owner Admin ${row.id}. All Admin sessions were revoked; next login requires enrollment.\n`);
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
