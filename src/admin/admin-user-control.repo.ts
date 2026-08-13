import { pool } from "../db/client";
import type {
  AdminCreateAdminUserBody,
  AdminRoleKey,
  AdminStatus,
  AdminUpdateAdminUserBody,
  AdminUserDetail,
  AdminUserListItem,
} from "./admin.types";

type UserDetailDbRow = {
  id: string;
  amoria_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  email_verified_at: Date | null;
  account_status: "active" | "suspended";
  suspended_at: Date | null;
  suspension_reason: string | null;
  gender: string | null;
  goal: string | null;
  mood: string | null;
  last_seen_at: Date | null;
  admin_user_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export async function findUserDetail(userId: string): Promise<AdminUserDetail | undefined> {
  const result = await pool.query<UserDetailDbRow>(`
    SELECT u.id, u.amoria_id, u.display_name, u.email, u.avatar_url,
           u.email_verified_at, u.account_status, u.suspended_at, u.suspension_reason,
           u.gender, u.goal, u.mood, u.last_seen_at, au.id AS admin_user_id,
           u.created_at, u.updated_at
      FROM users u
      LEFT JOIN admin_users au ON au.user_id = u.id
     WHERE u.id = $1
     LIMIT 1`, [userId]);
  return result.rows[0] ? toUserDetail(result.rows[0]) : undefined;
}

export async function setUserAccountStatus(input: {
  userId: string;
  status: "active" | "suspended";
  adminUserId: string;
  reason: string;
}): Promise<AdminUserDetail | undefined> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query<{ id: string; admin_status: string | null }>(`
      SELECT u.id, au.status AS admin_status
        FROM users u
        LEFT JOIN admin_users au ON au.user_id = u.id
       WHERE u.id = $1
       FOR UPDATE OF u`, [input.userId]);
    if (!existing.rows[0]) {
      await client.query("ROLLBACK");
      return undefined;
    }
    if (input.status === "suspended" && existing.rows[0].admin_status === "active") {
      const error = new Error("active_admin_user");
      (error as Error & { code?: string }).code = "active_admin_user";
      throw error;
    }

    const now = new Date();
    await client.query(`
      UPDATE users
       SET account_status = $2,
             auth_version = CASE WHEN $2 = 'suspended' THEN auth_version + 1 ELSE auth_version END,
             suspended_at = CASE WHEN $2 = 'suspended' THEN $3::timestamptz ELSE NULL END,
             suspension_reason = CASE WHEN $2 = 'suspended' THEN $4 ELSE NULL END,
             suspended_by_admin_user_id = CASE WHEN $2 = 'suspended' THEN $5::uuid ELSE NULL END,
             updated_at = $3::timestamptz
       WHERE id = $1`, [input.userId, input.status, now, input.reason, input.adminUserId]);

    if (input.status === "suspended") {
      await client.query(`UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, $2) WHERE user_id = $1`, [input.userId, now]);
      await client.query(`
        UPDATE nearby_profile_visibility
           SET status = 'off', latitude = NULL, longitude = NULL, radius_km = NULL,
               nearby_status = NULL, status_kind = NULL, expires_at = NULL, updated_at = $2
         WHERE user_id = $1`, [input.userId, now]);
      await client.query(`DELETE FROM nearby_statuses WHERE author_user_id = $1`, [input.userId]);
      await client.query(`
        UPDATE nearby_room_memberships SET status = 'removed', left_at = $2
         WHERE user_id = $1 AND status = 'active'`, [input.userId, now]);
      await client.query(`
        UPDATE together_queue
           SET status = 'cancelled', cancelled_at = $2, cancel_source = 'admin_cancel',
               cancel_reason = 'user_suspended'
         WHERE user_id = $1 AND status = 'waiting'`, [input.userId, now]);
      await client.query(`
        UPDATE together_turn_based_participants SET active = false, dismissed_at = $2
         WHERE user_id = $1 AND active = true`, [input.userId, now]);
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  return findUserDetail(input.userId);
}

export async function createAdminUser(input: AdminCreateAdminUserBody): Promise<string | undefined> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query<{ id: string; email: string; display_name: string }>(
      `SELECT id, email, display_name FROM users WHERE id = $1 FOR UPDATE`, [input.userId],
    );
    if (!user.rows[0]) {
      await client.query("ROLLBACK");
      return undefined;
    }
    const created = await client.query<{ id: string }>(`
      INSERT INTO admin_users (user_id, email, display_name, status, updated_at)
      VALUES ($1, $2, $3, 'active', now())
      ON CONFLICT (user_id) DO UPDATE SET status = 'active', email = EXCLUDED.email,
        display_name = EXCLUDED.display_name, updated_at = now()
      RETURNING id`, [input.userId, user.rows[0].email, user.rows[0].display_name]);
    const adminUserId = created.rows[0]?.id;
    if (!adminUserId) throw new Error("Failed to create admin user");
    await replaceRoles(client, adminUserId, input.roles);
    await client.query("COMMIT");
    return adminUserId;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAdminUser(
  adminUserId: string,
  input: AdminUpdateAdminUserBody,
): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Serialize cross-row owner changes so two owners cannot concurrently remove
    // each other after both observe a second active owner.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('amoria_admin_owner_control'))");
    const current = await client.query<{ id: string; status: AdminStatus; is_owner: boolean }>(`
      SELECT au.id, au.status, EXISTS (
        SELECT 1 FROM admin_user_roles aur JOIN admin_roles ar ON ar.id = aur.role_id
         WHERE aur.admin_user_id = au.id AND ar.key = 'owner'
      ) AS is_owner
      FROM admin_users au WHERE au.id = $1 FOR UPDATE`, [adminUserId]);
    if (!current.rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    const removesActiveOwner = current.rows[0].status === "active" && current.rows[0].is_owner && (
      input.status === "disabled" || (input.roles !== undefined && !input.roles.includes("owner"))
    );
    if (removesActiveOwner) {
      const owners = await client.query<{ count: string }>(`
        SELECT count(*)::text AS count FROM admin_users au
        JOIN admin_user_roles aur ON aur.admin_user_id = au.id
        JOIN admin_roles ar ON ar.id = aur.role_id
        WHERE au.status = 'active' AND ar.key = 'owner' AND au.id <> $1`, [adminUserId]);
      if (Number(owners.rows[0]?.count ?? 0) === 0) {
        const error = new Error("last_owner");
        (error as Error & { code?: string }).code = "last_owner";
        throw error;
      }
    }
    if (input.status) {
      await client.query(`UPDATE admin_users SET status = $2, updated_at = now() WHERE id = $1`, [adminUserId, input.status]);
    }
    if (input.roles) await replaceRoles(client, adminUserId, input.roles);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function replaceRoles(
  client: { query: (text: string, values?: unknown[]) => Promise<unknown> },
  adminUserId: string,
  roles: AdminRoleKey[],
): Promise<void> {
  await client.query(`DELETE FROM admin_user_roles WHERE admin_user_id = $1`, [adminUserId]);
  await client.query(`
    INSERT INTO admin_user_roles (admin_user_id, role_id)
    SELECT $1, id FROM admin_roles WHERE key = ANY($2::text[])`, [adminUserId, roles]);
}

function toUserDetail(row: UserDetailDbRow): AdminUserDetail {
  return {
    id: row.id,
    amoriaId: row.amoria_id,
    displayName: row.display_name,
    email: row.email,
    avatarUrl: row.avatar_url,
    emailVerifiedAt: row.email_verified_at?.toISOString() ?? null,
    accountStatus: row.account_status,
    suspendedAt: row.suspended_at?.toISOString() ?? null,
    suspensionReason: row.suspension_reason,
    gender: row.gender,
    goal: row.goal,
    mood: row.mood,
    lastSeenAt: row.last_seen_at?.toISOString() ?? null,
    adminUserId: row.admin_user_id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}
