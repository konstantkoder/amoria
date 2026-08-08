import { timingSafeEqual } from "node:crypto";
import { and, eq, gt, gte, isNotNull, isNull } from "drizzle-orm";
import { db, pool } from "../db/client";
import {
  type NewRefreshTokenRow,
  type NewUserRow,
  type RefreshTokenRow,
  type UserRow,
  refreshTokens,
  users,
} from "../db/schema";

export type UniqueConstraint = "users_email_unique" | "users_amoria_id_unique" | string;

type RefreshTokenMetadata = {
  deviceId?: string;
  userAgent?: string;
};

export function uniqueConstraint(error: unknown): UniqueConstraint | undefined {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: string }).code === "23505"
  ) {
    return (error as { constraint?: string }).constraint;
  }

  if (error && typeof error === "object" && "cause" in error) {
    return uniqueConstraint((error as { cause?: unknown }).cause);
  }

  return undefined;
}

export async function findUserByEmail(email: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({
    where: eq(users.email, email),
  });
}

export async function createUser(input: NewUserRow): Promise<UserRow> {
  const [created] = await db.insert(users).values(input).returning();
  return created;
}

export async function createRefreshToken(input: NewRefreshTokenRow): Promise<RefreshTokenRow> {
  const [created] = await db.insert(refreshTokens).values(input).returning();
  if (!created) {
    throw new Error("Failed to create refresh token");
  }
  return created;
}

export async function rotateRefreshToken(input: {
  tokenHash: string;
  newTokenId: string;
  newTokenHash: string;
  newTokenExpiresAt: Date;
  now: Date;
  metadata: RefreshTokenMetadata;
}): Promise<{ user: UserRow; refreshToken: RefreshTokenRow } | undefined> {
  return db.transaction(async (tx) => {
    const [revoked] = await tx
      .update(refreshTokens)
      .set({
        lastUsedAt: input.now,
        revokedAt: input.now,
        replacedByTokenId: input.newTokenId,
      })
      .where(
        and(
          eq(refreshTokens.tokenHash, input.tokenHash),
          isNull(refreshTokens.revokedAt),
          gt(refreshTokens.expiresAt, input.now),
        ),
      )
      .returning();

    if (!revoked) {
      return undefined;
    }

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, revoked.userId))
      .limit(1);

    if (!user) {
      return undefined;
    }

    const [created] = await tx
      .insert(refreshTokens)
      .values({
        id: input.newTokenId,
        userId: revoked.userId,
        tokenHash: input.newTokenHash,
        expiresAt: input.newTokenExpiresAt,
        deviceId: input.metadata.deviceId ?? null,
        userAgent: input.metadata.userAgent ?? null,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to rotate refresh token");
    }

    return {
      user,
      refreshToken: created,
    };
  });
}

export async function findRecentRefreshReplacement(input: {
  tokenHash: string;
  retryAfter: Date;
  now: Date;
  metadata: RefreshTokenMetadata;
}): Promise<{ user: UserRow; refreshToken: RefreshTokenRow } | undefined> {
  const original = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.tokenHash, input.tokenHash),
      isNotNull(refreshTokens.revokedAt),
      isNotNull(refreshTokens.replacedByTokenId),
      gte(refreshTokens.lastUsedAt, input.retryAfter),
    ),
  });

  if (!original?.replacedByTokenId) return undefined;
  if (original.deviceId && original.deviceId !== (input.metadata.deviceId ?? null)) return undefined;
  if (original.userAgent && original.userAgent !== (input.metadata.userAgent ?? null)) return undefined;

  const replacement = await db.query.refreshTokens.findFirst({
    where: and(
      eq(refreshTokens.id, original.replacedByTokenId),
      isNull(refreshTokens.revokedAt),
      gt(refreshTokens.expiresAt, input.now),
    ),
  });
  if (!replacement) return undefined;

  const user = await db.query.users.findFirst({
    where: eq(users.id, replacement.userId),
  });
  return user ? { user, refreshToken: replacement } : undefined;
}

export async function revokeRefreshTokenByHash(tokenHash: string, now: Date): Promise<void> {
  await db
    .update(refreshTokens)
    .set({
      lastUsedAt: now,
      revokedAt: now,
    })
    .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
}

export async function revokeAllRefreshTokensForUser(userId: string, now: Date): Promise<void> {
  await db
    .update(refreshTokens)
    .set({
      revokedAt: now,
    })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export type AuthEmailChallengePurpose = "verify_email" | "password_reset";

type ChallengeRow = {
  id: string;
  code_hash: string;
  attempt_count: number;
  max_attempts: number;
  expires_at: Date;
  consumed_at: Date | null;
};

type LockedUserRow = {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  amoria_id: string;
  avatar_url: string | null;
  email_verified_at: Date | null;
};

export type CreateChallengeResult =
  | { state: "created"; challengeId: string }
  | { state: "cooldown"; retryAfterSec: number }
  | { state: "not_eligible" };

export type ConsumeChallengeResult =
  | { state: "valid"; user: UserRow }
  | { state: "invalid" }
  | { state: "expired" }
  | { state: "max_attempts" };

function rowToUser(row: LockedUserRow): UserRow {
  return {
    id: row.id,
    email: row.email,
    emailVerifiedAt: row.email_verified_at,
    passwordHash: row.password_hash,
    displayName: row.display_name,
    amoriaId: row.amoria_id,
    avatarUrl: row.avatar_url,
    about: null,
    photos: [],
    gender: null,
    preferredGenders: [],
    goal: null,
    mood: null,
    interests: [],
    flirtEnabled: false,
    allowAdultMode: false,
    mysteryMode: false,
    birthDate: null,
    preferredAgeMin: 18,
    preferredAgeMax: null,
    lastSeenAt: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

function codeHashesMatch(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function createOrReplaceEmailChallenge(input: {
  userId: string;
  purpose: AuthEmailChallengePurpose;
  codeHash: string;
  expiresAt: Date;
  maxAttempts: number;
  now: Date;
  cooldownSec: number;
  enforceCooldown: boolean;
}): Promise<CreateChallengeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${input.userId}:${input.purpose}`,
    ]);
    const userResult = await client.query<LockedUserRow>(
      `SELECT id, email, password_hash, display_name, amoria_id, avatar_url, email_verified_at
       FROM users WHERE id = $1 FOR UPDATE`,
      [input.userId],
    );
    const user = userResult.rows[0];
    const eligible = user && (input.purpose === "password_reset"
      ? Boolean(user.email_verified_at)
      : !user.email_verified_at);
    if (!eligible) {
      await client.query("ROLLBACK");
      return { state: "not_eligible" };
    }

    if (input.enforceCooldown) {
      const activeResult = await client.query<{ sent_at: Date | null }>(
        `SELECT sent_at FROM auth_email_challenges
         WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
         ORDER BY created_at DESC LIMIT 1`,
        [input.userId, input.purpose],
      );
      const sentAt = activeResult.rows[0]?.sent_at;
      if (sentAt) {
        const availableAt = sentAt.getTime() + input.cooldownSec * 1000;
        if (availableAt > input.now.getTime()) {
          await client.query("ROLLBACK");
          return {
            state: "cooldown",
            retryAfterSec: Math.max(1, Math.ceil((availableAt - input.now.getTime()) / 1000)),
          };
        }
      }
    }

    await client.query(
      `UPDATE auth_email_challenges SET consumed_at = $3, updated_at = $3
       WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL`,
      [input.userId, input.purpose, input.now],
    );
    const inserted = await client.query<{ id: string }>(
      `INSERT INTO auth_email_challenges
        (user_id, purpose, code_hash, max_attempts, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id`,
      [input.userId, input.purpose, input.codeHash, input.maxAttempts, input.expiresAt, input.now],
    );
    await client.query(
      "DELETE FROM auth_email_challenges WHERE expires_at < $1",
      [new Date(input.now.getTime() - 7 * 24 * 60 * 60 * 1000)],
    );
    await client.query("COMMIT");
    return { state: "created", challengeId: inserted.rows[0].id };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function markEmailChallengeSent(challengeId: string, now: Date): Promise<void> {
  await pool.query(
    `UPDATE auth_email_challenges SET sent_at = $2, updated_at = $2
     WHERE id = $1 AND consumed_at IS NULL`,
    [challengeId, now],
  );
}

export async function invalidateEmailChallenge(challengeId: string, now: Date): Promise<void> {
  await pool.query(
    `UPDATE auth_email_challenges SET consumed_at = $2, updated_at = $2
     WHERE id = $1 AND consumed_at IS NULL`,
    [challengeId, now],
  );
}

async function consumeChallenge(input: {
  userId: string;
  purpose: AuthEmailChallengePurpose;
  codeHash: string;
  now: Date;
  verifiedAt?: Date;
  newPasswordHash?: string;
}): Promise<ConsumeChallengeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))", [
      `${input.userId}:${input.purpose}`,
    ]);
    const userResult = await client.query<LockedUserRow>(
      `SELECT id, email, password_hash, display_name, amoria_id, avatar_url, email_verified_at
       FROM users WHERE id = $1 FOR UPDATE`,
      [input.userId],
    );
    const user = userResult.rows[0];
    if (!user || (input.purpose === "verify_email" && user.email_verified_at)) {
      await client.query("ROLLBACK");
      return { state: "invalid" };
    }

    const challengeResult = await client.query<ChallengeRow>(
      `SELECT id, code_hash, attempt_count, max_attempts, expires_at, consumed_at
       FROM auth_email_challenges
       WHERE user_id = $1 AND purpose = $2 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [input.userId, input.purpose],
    );
    const challenge = challengeResult.rows[0];
    if (!challenge) {
      await client.query("ROLLBACK");
      return { state: "invalid" };
    }
    if (challenge.expires_at.getTime() <= input.now.getTime()) {
      await client.query(
        "UPDATE auth_email_challenges SET consumed_at = $2, updated_at = $2 WHERE id = $1",
        [challenge.id, input.now],
      );
      await client.query("COMMIT");
      return { state: "expired" };
    }
    if (challenge.attempt_count >= challenge.max_attempts) {
      await client.query("ROLLBACK");
      return { state: "max_attempts" };
    }
    if (!codeHashesMatch(challenge.code_hash, input.codeHash)) {
      const attempts = challenge.attempt_count + 1;
      await client.query(
        `UPDATE auth_email_challenges
         SET attempt_count = $2, consumed_at = CASE WHEN $2 >= max_attempts THEN $3::timestamptz ELSE NULL END, updated_at = $3
         WHERE id = $1`,
        [challenge.id, attempts, input.now],
      );
      await client.query("COMMIT");
      return attempts >= challenge.max_attempts ? { state: "max_attempts" } : { state: "invalid" };
    }

    if (input.purpose === "verify_email") {
      await client.query(
        "UPDATE users SET email_verified_at = $2, updated_at = $2 WHERE id = $1",
        [input.userId, input.verifiedAt ?? input.now],
      );
      user.email_verified_at = input.verifiedAt ?? input.now;
    } else {
      if (!input.newPasswordHash) throw new Error("Password hash is required for reset confirmation");
      await client.query(
        "UPDATE users SET password_hash = $2, updated_at = $3 WHERE id = $1",
        [input.userId, input.newPasswordHash, input.now],
      );
      await client.query(
        "UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
        [input.userId, input.now],
      );
      user.password_hash = input.newPasswordHash;
    }
    await client.query(
      "UPDATE auth_email_challenges SET consumed_at = $2, updated_at = $2 WHERE id = $1",
      [challenge.id, input.now],
    );
    await client.query("COMMIT");
    return { state: "valid", user: rowToUser(user) };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export function consumeEmailVerificationChallenge(input: {
  userId: string;
  codeHash: string;
  now: Date;
}): Promise<ConsumeChallengeResult> {
  return consumeChallenge({ ...input, purpose: "verify_email", verifiedAt: input.now });
}

export function consumePasswordResetChallenge(input: {
  userId: string;
  codeHash: string;
  newPasswordHash: string;
  now: Date;
}): Promise<ConsumeChallengeResult> {
  return consumeChallenge({ ...input, purpose: "password_reset" });
}
