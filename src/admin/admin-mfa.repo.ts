import { randomUUID, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../db/client";
import {
  decryptTotpSecret,
  findMatchingTotpCounter,
  hashRecoveryCode,
  type EncryptedTotpSecret,
} from "./admin-mfa.crypto";

type CredentialRow = {
  admin_user_id: string;
  secret_ciphertext: string;
  secret_iv: string;
  secret_auth_tag: string;
  key_version: number;
  status: "pending" | "enabled";
  last_accepted_counter: string | null;
};

type ChallengeRow = CredentialRow & {
  challenge_id: string;
  flow: "enroll" | "verify";
  ip_hash: string | null;
  user_agent_hash: string | null;
  attempt_count: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
  user_id: string;
  email: string;
  display_name: string;
  amoria_id: string;
  avatar_url: string | null;
  admin_status: string;
  admin_session_version: number;
  account_status: string;
  user_auth_version: number;
  has_role: boolean;
};

export type AdminSessionPrincipal = {
  adminUserId: string;
  userId: string;
  adminSessionVersion: number;
  userAuthVersion: number;
  user: {
    id: string;
    email: string;
    displayName: string;
    amoriaId: string;
    avatarUrl: string | null;
  };
};

export type PreparedMfaChallenge = {
  flow: "enroll" | "verify";
  credential?: EncryptedTotpSecret;
};

export type MfaChallengeConsumeResult =
  | { state: "success"; principal: AdminSessionPrincipal; recoveryUsed: boolean; enrolled: boolean; remainingRecoveryCodes: number }
  | { state: "invalid" | "expired" | "attempts_exceeded"; adminUserId?: string };

export async function findChallengeAdminUserId(tokenHash: string): Promise<string | undefined> {
  const result = await pool.query<{ admin_user_id: string }>(
    "SELECT admin_user_id FROM admin_mfa_pre_auth_challenges WHERE token_hash=$1 LIMIT 1",
    [tokenHash],
  );
  return result.rows[0]?.admin_user_id;
}

function credentialFromRow(row: CredentialRow): EncryptedTotpSecret {
  return {
    ciphertext: row.secret_ciphertext,
    iv: row.secret_iv,
    authTag: row.secret_auth_tag,
    keyVersion: row.key_version,
  };
}

function safeHashEqual(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function prepareMfaChallenge(input: {
  adminUserId: string;
  tokenHash: string;
  newCredential: EncryptedTotpSecret;
  ipHash: string | null;
  userAgentHash: string | null;
  maxAttempts: number;
  expiresAt: Date;
  now: Date;
}): Promise<PreparedMfaChallenge> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [`admin-mfa:${input.adminUserId}`]);
    let credential = (await client.query<CredentialRow>(
      "SELECT * FROM admin_mfa_credentials WHERE admin_user_id=$1 FOR UPDATE",
      [input.adminUserId],
    )).rows[0];
    if (!credential) {
      credential = (await client.query<CredentialRow>(
        `INSERT INTO admin_mfa_credentials
          (admin_user_id,secret_ciphertext,secret_iv,secret_auth_tag,key_version,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,'pending',$6,$6) RETURNING *`,
        [
          input.adminUserId,
          input.newCredential.ciphertext,
          input.newCredential.iv,
          input.newCredential.authTag,
          input.newCredential.keyVersion,
          input.now,
        ],
      )).rows[0];
    }
    if (!credential) throw new Error("Failed to create Admin MFA credential");
    const flow = credential.status === "enabled" ? "verify" : "enroll";
    await client.query(
      "UPDATE admin_mfa_pre_auth_challenges SET consumed_at=COALESCE(consumed_at,$2) WHERE admin_user_id=$1 AND consumed_at IS NULL",
      [input.adminUserId, input.now],
    );
    await client.query(
      `INSERT INTO admin_mfa_pre_auth_challenges
        (admin_user_id,token_hash,flow,ip_hash,user_agent_hash,max_attempts,expires_at,created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [input.adminUserId, input.tokenHash, flow, input.ipHash, input.userAgentHash, input.maxAttempts, input.expiresAt, input.now],
    );
    await client.query("COMMIT");
    return { flow, credential: flow === "enroll" ? credentialFromRow(credential) : undefined };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function lockChallenge(client: PoolClient, tokenHash: string): Promise<ChallengeRow | undefined> {
  return (await client.query<ChallengeRow>(`
    SELECT ch.id AS challenge_id, ch.flow, ch.ip_hash, ch.user_agent_hash, ch.attempt_count,
           ch.max_attempts, ch.expires_at, ch.consumed_at,
           cred.admin_user_id, cred.secret_ciphertext, cred.secret_iv, cred.secret_auth_tag,
           cred.key_version, cred.status, cred.last_accepted_counter,
           au.user_id, au.status AS admin_status, au.session_version AS admin_session_version,
           u.email, u.display_name, u.amoria_id, u.avatar_url,
           u.account_status, u.auth_version AS user_auth_version,
           EXISTS (SELECT 1 FROM admin_user_roles aur WHERE aur.admin_user_id=au.id) AS has_role
      FROM admin_mfa_pre_auth_challenges ch
      JOIN admin_mfa_credentials cred ON cred.admin_user_id=ch.admin_user_id
      JOIN admin_users au ON au.id=ch.admin_user_id
      JOIN users u ON u.id=au.user_id
     WHERE ch.token_hash=$1
     FOR UPDATE OF ch,cred,au,u`, [tokenHash])).rows[0];
}

async function rejectChallenge(
  client: PoolClient,
  challenge: ChallengeRow,
  now: Date,
): Promise<"invalid" | "attempts_exceeded"> {
  const nextAttempts = Math.min(challenge.max_attempts, challenge.attempt_count + 1);
  const exceeded = nextAttempts >= challenge.max_attempts;
  await client.query(
    `UPDATE admin_mfa_pre_auth_challenges
        SET attempt_count=$2,consumed_at=CASE WHEN $3 THEN COALESCE(consumed_at,$4) ELSE consumed_at END
      WHERE id=$1`,
    [challenge.challenge_id, nextAttempts, exceeded, now],
  );
  return exceeded ? "attempts_exceeded" : "invalid";
}

async function insertAdminSession(client: PoolClient, input: {
  id: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  principal: AdminSessionPrincipal;
  deviceId?: string;
  userAgent?: string;
  now: Date;
}): Promise<void> {
  await client.query(
    `INSERT INTO admin_sessions
      (id,family_id,admin_user_id,user_id,token_hash,admin_session_version,user_auth_version,
       expires_at,device_id,user_agent,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.id,
      input.familyId,
      input.principal.adminUserId,
      input.principal.userId,
      input.tokenHash,
      input.principal.adminSessionVersion,
      input.principal.userAuthVersion,
      input.expiresAt,
      input.deviceId?.slice(0, 200) ?? null,
      input.userAgent?.slice(0, 500) ?? null,
      input.now,
    ],
  );
}

function principalFromChallenge(row: ChallengeRow): AdminSessionPrincipal {
  return {
    adminUserId: row.admin_user_id,
    userId: row.user_id,
    adminSessionVersion: row.admin_session_version,
    userAuthVersion: row.user_auth_version,
    user: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name,
      amoriaId: row.amoria_id,
      avatarUrl: row.avatar_url,
    },
  };
}

export async function consumeMfaChallenge(input: {
  tokenHash: string;
  ipHash: string | null;
  userAgentHash: string | null;
  method: "totp" | "recovery";
  code: string;
  enrollmentRecoveryCodes?: Array<{ codeHash: string }>;
  recoveryGenerationId?: string;
  session: { id: string; familyId: string; tokenHash: string; expiresAt: Date; deviceId?: string; userAgent?: string };
  now: Date;
}): Promise<MfaChallengeConsumeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const challenge = await lockChallenge(client, input.tokenHash);
    if (!challenge) {
      await client.query("ROLLBACK");
      return { state: "invalid" };
    }
    if (challenge.consumed_at || challenge.attempt_count >= challenge.max_attempts) {
      await client.query("ROLLBACK");
      return { state: "attempts_exceeded", adminUserId: challenge.admin_user_id };
    }
    if (challenge.expires_at.getTime() <= input.now.getTime()) {
      await client.query("UPDATE admin_mfa_pre_auth_challenges SET consumed_at=$2 WHERE id=$1", [challenge.challenge_id, input.now]);
      await client.query("COMMIT");
      return { state: "expired", adminUserId: challenge.admin_user_id };
    }
    if (
      !safeHashEqual(challenge.ip_hash, input.ipHash) ||
      !safeHashEqual(challenge.user_agent_hash, input.userAgentHash) ||
      challenge.admin_status !== "active" ||
      challenge.account_status !== "active" ||
      !challenge.has_role
    ) {
      const state = await rejectChallenge(client, challenge, input.now);
      await client.query("COMMIT");
      return { state, adminUserId: challenge.admin_user_id };
    }

    let recoveryUsed = false;
    if (input.method === "recovery") {
      if (challenge.flow !== "verify" || challenge.status !== "enabled") {
        const state = await rejectChallenge(client, challenge, input.now);
        await client.query("COMMIT");
        return { state, adminUserId: challenge.admin_user_id };
      }
      const consumed = await client.query(
        `UPDATE admin_mfa_recovery_codes SET used_at=$3
          WHERE admin_user_id=$1 AND code_hash=$2 AND used_at IS NULL RETURNING id`,
        [challenge.admin_user_id, hashRecoveryCode(input.code), input.now],
      );
      if (consumed.rowCount !== 1) {
        const state = await rejectChallenge(client, challenge, input.now);
        await client.query("COMMIT");
        return { state, adminUserId: challenge.admin_user_id };
      }
      recoveryUsed = true;
    } else {
      const secret = decryptTotpSecret(credentialFromRow(challenge), challenge.admin_user_id);
      const counter = findMatchingTotpCounter(secret, input.code, input.now, 1);
      const lastCounter = challenge.last_accepted_counter === null ? -1 : Number(challenge.last_accepted_counter);
      if (counter === undefined || counter <= lastCounter) {
        const state = await rejectChallenge(client, challenge, input.now);
        await client.query("COMMIT");
        return { state, adminUserId: challenge.admin_user_id };
      }
      const accepted = await client.query(
        `UPDATE admin_mfa_credentials SET
           last_accepted_counter=$2,
           status=CASE WHEN status='pending' THEN 'enabled' ELSE status END,
           enabled_at=CASE WHEN status='pending' THEN $3 ELSE enabled_at END,
           updated_at=$3
         WHERE admin_user_id=$1 AND (last_accepted_counter IS NULL OR last_accepted_counter < $2)
         RETURNING admin_user_id`,
        [challenge.admin_user_id, counter, input.now],
      );
      if (accepted.rowCount !== 1) {
        const state = await rejectChallenge(client, challenge, input.now);
        await client.query("COMMIT");
        return { state, adminUserId: challenge.admin_user_id };
      }
    }

    if (challenge.flow === "enroll") {
      if (!input.enrollmentRecoveryCodes?.length || !input.recoveryGenerationId) {
        throw new Error("Enrollment recovery codes are required");
      }
      await client.query("DELETE FROM admin_mfa_recovery_codes WHERE admin_user_id=$1", [challenge.admin_user_id]);
      for (const recovery of input.enrollmentRecoveryCodes) {
        await client.query(
          `INSERT INTO admin_mfa_recovery_codes (admin_user_id,generation_id,code_hash,created_at)
           VALUES ($1,$2,$3,$4)`,
          [challenge.admin_user_id, input.recoveryGenerationId, recovery.codeHash, input.now],
        );
      }
    }

    await client.query("UPDATE admin_mfa_pre_auth_challenges SET consumed_at=$2 WHERE id=$1", [challenge.challenge_id, input.now]);
    const principal = principalFromChallenge(challenge);
    await insertAdminSession(client, { ...input.session, principal, now: input.now });
    const remaining = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM admin_mfa_recovery_codes WHERE admin_user_id=$1 AND used_at IS NULL",
      [challenge.admin_user_id],
    );
    await client.query("COMMIT");
    return {
      state: "success",
      principal,
      recoveryUsed,
      enrolled: challenge.flow === "enroll",
      remainingRecoveryCodes: Number(remaining.rows[0]?.count ?? 0),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

type SessionRow = {
  id: string;
  family_id: string;
  admin_user_id: string;
  user_id: string;
  admin_session_version: number;
  user_auth_version: number;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_session_id: string | null;
  current_admin_session_version: number;
  current_user_auth_version: number;
  admin_status: string;
  account_status: string;
  mfa_status: string | null;
  email: string;
  display_name: string;
  amoria_id: string;
  avatar_url: string | null;
  has_role: boolean;
};

export async function rotateAdminSession(input: {
  currentTokenHash: string;
  replacement: { id: string; tokenHash: string };
  expiresAt: Date;
  now: Date;
  deviceId?: string;
  userAgent?: string;
}): Promise<AdminSessionPrincipal | undefined> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query<SessionRow>(`
      SELECT s.*, au.session_version AS current_admin_session_version,
             u.auth_version AS current_user_auth_version,au.status AS admin_status,
             u.account_status,cred.status AS mfa_status,u.email,u.display_name,u.amoria_id,u.avatar_url,
             EXISTS (SELECT 1 FROM admin_user_roles aur WHERE aur.admin_user_id=au.id) AS has_role
        FROM admin_sessions s
        JOIN admin_users au ON au.id=s.admin_user_id
        JOIN users u ON u.id=s.user_id
        LEFT JOIN admin_mfa_credentials cred ON cred.admin_user_id=au.id
       WHERE s.token_hash=$1 FOR UPDATE OF s,au,u`, [input.currentTokenHash])).rows[0];
    if (!row) {
      await client.query("ROLLBACK");
      return undefined;
    }
    if (row.revoked_at) {
      if (row.replaced_by_session_id) {
        await client.query("UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE family_id=$1", [row.family_id, input.now]);
        await client.query("UPDATE admin_step_up_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE admin_user_id=$1", [row.admin_user_id, input.now]);
        await client.query("COMMIT");
      } else {
        await client.query("ROLLBACK");
      }
      return undefined;
    }
    const valid =
      row.expires_at.getTime() > input.now.getTime() &&
      row.admin_status === "active" &&
      row.account_status === "active" &&
      row.mfa_status === "enabled" &&
      row.has_role &&
      row.admin_session_version === row.current_admin_session_version &&
      row.user_auth_version === row.current_user_auth_version;
    if (!valid) {
      await client.query("UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE id=$1", [row.id, input.now]);
      await client.query("COMMIT");
      return undefined;
    }
    const principal: AdminSessionPrincipal = {
      adminUserId: row.admin_user_id,
      userId: row.user_id,
      adminSessionVersion: row.current_admin_session_version,
      userAuthVersion: row.current_user_auth_version,
      user: {
        id: row.user_id,
        email: row.email,
        displayName: row.display_name,
        amoriaId: row.amoria_id,
        avatarUrl: row.avatar_url,
      },
    };
    await insertAdminSession(client, {
      ...input.replacement,
      familyId: row.family_id,
      expiresAt: input.expiresAt,
      principal,
      deviceId: input.deviceId,
      userAgent: input.userAgent,
      now: input.now,
    });
    await client.query("UPDATE admin_sessions SET revoked_at=$2,replaced_by_session_id=$3 WHERE id=$1", [row.id, input.now, input.replacement.id]);
    await client.query("COMMIT");
    return principal;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeAdminSessionByTokenHash(tokenHash: string, now = new Date()): Promise<void> {
  await pool.query("UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE token_hash=$1", [tokenHash, now]);
}

export async function revokeAllAdminSecuritySessions(
  adminUserId: string,
  now = new Date(),
  client: Pick<PoolClient, "query"> = pool,
): Promise<void> {
  await client.query("UPDATE admin_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE admin_user_id=$1", [adminUserId, now]);
  await client.query("UPDATE admin_step_up_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE admin_user_id=$1", [adminUserId, now]);
  await client.query("UPDATE admin_mfa_pre_auth_challenges SET consumed_at=COALESCE(consumed_at,$2) WHERE admin_user_id=$1", [adminUserId, now]);
}

export async function createStepUpSession(input: {
  adminUserId: string;
  adminSessionVersion: number;
  code: string;
  tokenHash: string;
  expiresAt: Date;
  now: Date;
}): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const row = (await client.query<CredentialRow & { session_version: number; admin_status: string; account_status: string; has_role: boolean }>(`
      SELECT cred.*,au.session_version,au.status AS admin_status,u.account_status,
             EXISTS (SELECT 1 FROM admin_user_roles aur WHERE aur.admin_user_id=au.id) AS has_role
        FROM admin_mfa_credentials cred JOIN admin_users au ON au.id=cred.admin_user_id
        JOIN users u ON u.id=au.user_id WHERE cred.admin_user_id=$1
        FOR UPDATE OF cred,au,u`, [input.adminUserId])).rows[0];
    if (
      !row || row.status !== "enabled" || row.session_version !== input.adminSessionVersion ||
      row.admin_status !== "active" || row.account_status !== "active" || !row.has_role
    ) {
      await client.query("ROLLBACK");
      return false;
    }
    const secret = decryptTotpSecret(credentialFromRow(row), input.adminUserId);
    const counter = findMatchingTotpCounter(secret, input.code, input.now, 1);
    const lastCounter = row.last_accepted_counter === null ? -1 : Number(row.last_accepted_counter);
    if (counter === undefined || counter <= lastCounter) {
      await client.query("ROLLBACK");
      return false;
    }
    const accepted = await client.query(
      `UPDATE admin_mfa_credentials SET last_accepted_counter=$2,updated_at=$3
        WHERE admin_user_id=$1 AND (last_accepted_counter IS NULL OR last_accepted_counter < $2) RETURNING admin_user_id`,
      [input.adminUserId, counter, input.now],
    );
    if (accepted.rowCount !== 1) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("UPDATE admin_step_up_sessions SET revoked_at=COALESCE(revoked_at,$2) WHERE admin_user_id=$1", [input.adminUserId, input.now]);
    await client.query(
      `INSERT INTO admin_step_up_sessions (admin_user_id,token_hash,admin_session_version,expires_at,created_at)
       VALUES ($1,$2,$3,$4,$5)`,
      [input.adminUserId, input.tokenHash, input.adminSessionVersion, input.expiresAt, input.now],
    );
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function hasValidStepUp(input: {
  adminUserId: string;
  adminSessionVersion: number;
  tokenHash: string;
  now: Date;
}): Promise<boolean> {
  const result = await pool.query(`
    SELECT 1 FROM admin_step_up_sessions
     WHERE admin_user_id=$1 AND admin_session_version=$2 AND token_hash=$3
       AND revoked_at IS NULL AND expires_at>$4 LIMIT 1`,
    [input.adminUserId, input.adminSessionVersion, input.tokenHash, input.now],
  );
  return result.rowCount === 1;
}

export async function replaceRecoveryCodes(input: {
  adminUserId: string;
  generationId: string;
  codeHashes: string[];
  adminSessionVersion: number;
  now: Date;
}): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const current = await client.query<{ session_version: number }>(
      "SELECT session_version FROM admin_users WHERE id=$1 AND status='active' FOR UPDATE",
      [input.adminUserId],
    );
    if (current.rows[0]?.session_version !== input.adminSessionVersion) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("DELETE FROM admin_mfa_recovery_codes WHERE admin_user_id=$1", [input.adminUserId]);
    for (const codeHash of input.codeHashes) {
      await client.query(
        "INSERT INTO admin_mfa_recovery_codes (admin_user_id,generation_id,code_hash,created_at) VALUES ($1,$2,$3,$4)",
        [input.adminUserId, input.generationId, codeHash, input.now],
      );
    }
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resetMfaCredential(adminUserId: string, now = new Date()): Promise<{ userId: string; sessionVersion: number } | undefined> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const target = await client.query<{ user_id: string; session_version: number }>(
      "SELECT user_id,session_version FROM admin_users WHERE id=$1 FOR UPDATE",
      [adminUserId],
    );
    if (!target.rows[0]) {
      await client.query("ROLLBACK");
      return undefined;
    }
    await revokeAllAdminSecuritySessions(adminUserId, now, client);
    await client.query("DELETE FROM admin_mfa_recovery_codes WHERE admin_user_id=$1", [adminUserId]);
    await client.query("DELETE FROM admin_mfa_credentials WHERE admin_user_id=$1", [adminUserId]);
    const updated = await client.query<{ session_version: number }>(
      "UPDATE admin_users SET session_version=session_version+1,updated_at=$2 WHERE id=$1 RETURNING session_version",
      [adminUserId, now],
    );
    await client.query("COMMIT");
    return { userId: target.rows[0].user_id, sessionVersion: updated.rows[0]?.session_version ?? target.rows[0].session_version + 1 };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function newRecoveryGenerationId(): string {
  return randomUUID();
}
