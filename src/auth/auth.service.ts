import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { AppError } from "../common/errors";
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizePassword,
} from "../common/validators";
import { REFRESH_TOKEN_EXPIRES_IN_DAYS } from "../config/constants";
import {
  type AuthRequestContext,
  type AuthResponse,
  type LoginBody,
  type LogoutBody,
  type OkResponse,
  type RefreshBody,
  type RegisterBody,
  toAuthUserProfile,
} from "./auth.types";
import {
  createRefreshToken,
  createUser,
  findRecentRefreshReplacement,
  findUserByEmail,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenByHash,
  rotateRefreshToken,
  uniqueConstraint,
} from "./auth.repo";
import { env } from "../config/env";
import { signAccessTokenWithExpiry } from "./jwt";
import { hashPassword, verifyPassword } from "./passwords";
import { generateAmoriaId } from "../users/amoria-id";
import type { UserRow } from "../db/schema";

const amoriaIdRetries = 8;
const refreshTokenBytes = 32;
const refreshTokenExpiresMs = REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;
export const REFRESH_RETRY_GRACE_MS = 30_000;

function invalidRefresh(): AppError {
  return new AppError("invalid_refresh", "Invalid refresh token", 401);
}

function hashRefreshToken(refreshToken: string): string {
  return createHash("sha256").update(refreshToken, "utf8").digest("hex");
}

function generateRefreshToken(): string {
  return randomBytes(refreshTokenBytes).toString("base64url");
}

export function deriveRotatedRefreshToken(refreshToken: string, replacementId: string): string {
  return createHmac("sha256", env.JWT_SECRET)
    .update(refreshToken, "utf8")
    .update("\0", "utf8")
    .update(replacementId, "utf8")
    .digest("base64url");
}

function refreshTokenExpiresAt(now: Date): Date {
  return new Date(now.getTime() + refreshTokenExpiresMs);
}

function normalizeRefreshToken(refreshToken: string): string {
  const normalized = refreshToken.trim();
  if (!normalized) {
    throw invalidRefresh();
  }
  return normalized;
}

function buildAuthResponse(user: UserRow, refreshToken: string): AuthResponse {
  return {
    ...signAccessTokenWithExpiry(user.id),
    refreshToken,
    user: toAuthUserProfile(user),
  };
}

async function issueRefreshToken(
  userId: string,
  context: AuthRequestContext = {},
  now = new Date(),
): Promise<string> {
  const refreshToken = generateRefreshToken();
  await createRefreshToken({
    userId,
    tokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshTokenExpiresAt(now),
    deviceId: context.deviceId ?? null,
    userAgent: context.userAgent ?? null,
  });
  return refreshToken;
}

export async function register(
  input: RegisterBody,
  context: AuthRequestContext = {},
): Promise<AuthResponse> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const displayName = normalizeDisplayName(input.displayName);
  const passwordHash = await hashPassword(password);

  for (let attempt = 0; attempt < amoriaIdRetries; attempt += 1) {
    try {
      const user = await createUser({
        email,
        passwordHash,
        displayName,
        amoriaId: generateAmoriaId(),
      });
      const refreshToken = await issueRefreshToken(user.id, context);

      return buildAuthResponse(user, refreshToken);
    } catch (error) {
      const constraint = uniqueConstraint(error);

      if (constraint?.includes("email")) {
        throw new AppError("email_taken", "Email is already registered", 409, {
          email: "taken",
        });
      }

      if (constraint?.includes("amoria_id")) {
        continue;
      }

      throw error;
    }
  }

  throw new AppError("internal_error", "Could not allocate Amoria ID", 500);
}

export async function login(
  input: LoginBody,
  context: AuthRequestContext = {},
): Promise<AuthResponse> {
  const email = normalizeEmail(input.email);
  const password = normalizePassword(input.password);
  const user = await findUserByEmail(email);

  if (!user) {
    throw new AppError("invalid_credentials", "Invalid email or password", 401);
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    throw new AppError("invalid_credentials", "Invalid email or password", 401);
  }

  const refreshToken = await issueRefreshToken(user.id, context);
  return buildAuthResponse(user, refreshToken);
}

export async function refresh(
  input: RefreshBody,
  context: AuthRequestContext = {},
): Promise<AuthResponse> {
  const refreshToken = normalizeRefreshToken(input.refreshToken);
  const tokenHash = hashRefreshToken(refreshToken);
  const replacementId = randomUUID();
  const nextRefreshToken = deriveRotatedRefreshToken(refreshToken, replacementId);
  const now = new Date();
  const rotated = await rotateRefreshToken({
    tokenHash,
    newTokenId: replacementId,
    newTokenHash: hashRefreshToken(nextRefreshToken),
    newTokenExpiresAt: refreshTokenExpiresAt(now),
    now,
    metadata: context,
  });

  if (rotated) {
    return buildAuthResponse(rotated.user, nextRefreshToken);
  }

  const retry = await findRecentRefreshReplacement({
    tokenHash,
    retryAfter: new Date(now.getTime() - REFRESH_RETRY_GRACE_MS),
    now,
    metadata: context,
  });
  if (!retry) throw invalidRefresh();

  return buildAuthResponse(
    retry.user,
    deriveRotatedRefreshToken(refreshToken, retry.refreshToken.id),
  );
}

export async function logout(input: LogoutBody): Promise<OkResponse> {
  const refreshToken = input.refreshToken.trim();
  if (refreshToken) {
    await revokeRefreshTokenByHash(hashRefreshToken(refreshToken), new Date());
  }

  return { ok: true };
}

export async function logoutAll(userId: string): Promise<OkResponse> {
  await revokeAllRefreshTokensForUser(userId, new Date());
  return { ok: true };
}
