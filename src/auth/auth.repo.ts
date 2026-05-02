import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db/client";
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
