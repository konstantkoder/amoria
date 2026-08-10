import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "node:crypto";
import { AppError, validationError } from "../common/errors";
import {
  normalizeDisplayName,
  normalizeEmail,
  normalizePassword,
} from "../common/validators";
import { REFRESH_TOKEN_EXPIRES_IN_DAYS } from "../config/constants";
import { env } from "../config/env";
import { assertSafeText } from "../moderation/text-validation";
import type { UserRow } from "../db/schema";
import { DisposableEmailDomainService } from "../email/disposable-email-domain.service";
import {
  EmailDomainValidationError,
  EmailDomainValidationService,
} from "../email/email-domain-validation.service";
import { emailDeliveryService } from "../email/email-delivery.service";
import {
  normalizeEmailLocale,
  renderAuthEmail,
  type EmailLocale,
  type EmailPurpose,
} from "../email/email-templates";
import { generateAmoriaId } from "../users/amoria-id";
import {
  consumeEmailVerificationChallenge,
  consumePasswordResetChallenge,
  createOrReplaceEmailChallenge,
  createRefreshToken,
  createUser,
  findRecentRefreshReplacement,
  findUserByEmail,
  invalidateEmailChallenge,
  markEmailChallengeSent,
  revokeAllRefreshTokensForUser,
  revokeRefreshTokenByHash,
  rotateRefreshToken,
  uniqueConstraint,
} from "./auth.repo";
import type {
  AuthRequestContext,
  AuthResponse,
  EmailCodeBody,
  LoginBody,
  LogoutBody,
  OkResponse,
  PasswordResetConfirmBody,
  PasswordResetRequestBody,
  RefreshBody,
  RegisterBody,
  ResendVerificationBody,
  ResendVerificationResponse,
  VerificationRequiredResponse,
} from "./auth.types";
import { signAccessTokenWithExpiry } from "./jwt";
import { hashPassword, verifyPassword } from "./passwords";
import { registrationAbuseGuard } from "./registration-abuse.guard";
import { toAuthUserProfile } from "./auth.types";

const amoriaIdRetries = 8;
const refreshTokenBytes = 32;
const refreshTokenExpiresMs = REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000;
const verificationCodePattern = /^[0-9]{6}$/;
const dummyPasswordHash = "$2b$12$C6UzMDM.H6dfI/f/IKcEe.5c0m5QkZkW8O7G6Gf4KfCQ7U1w5t2u.";
export const REFRESH_RETRY_GRACE_MS = 30_000;

const domainValidation = new EmailDomainValidationService();
const disposableDomains = new DisposableEmailDomainService();

function invalidRefresh(): AppError {
  return new AppError("invalid_refresh", "Invalid refresh token", 401);
}

function invalidCredentials(): AppError {
  return new AppError("invalid_credentials", "Invalid email or password", 401);
}

function assertAccountActive(user: Pick<UserRow, "accountStatus">): void {
  if ((user.accountStatus ?? "active") !== "active") {
    throw new AppError("account_suspended", "Account is suspended", 403);
  }
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

export function hashChallengeCode(userId: string, purpose: EmailPurpose, code: string): string {
  return createHmac("sha256", env.AUTH_SECURITY_HMAC_SECRET)
    .update(userId, "utf8")
    .update("\0", "utf8")
    .update(purpose, "utf8")
    .update("\0", "utf8")
    .update(code, "utf8")
    .digest("hex");
}

export function generateChallengeCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

function normalizeCode(code: unknown): string {
  if (typeof code !== "string" || !verificationCodePattern.test(code.trim())) {
    throw validationError("Verification code must contain 6 digits", { code: "invalid" });
  }
  return code.trim();
}

function refreshTokenExpiresAt(now: Date): Date {
  return new Date(now.getTime() + refreshTokenExpiresMs);
}

function normalizeRefreshToken(refreshToken: string): string {
  const normalized = refreshToken.trim();
  if (!normalized) throw invalidRefresh();
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
    deviceId: context.deviceId?.slice(0, 200) ?? null,
    userAgent: context.userAgent?.slice(0, 500) ?? null,
  });
  return refreshToken;
}

async function assertRegistrationEmailAllowed(email: string): Promise<void> {
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (disposableDomains.isBlocked(domain)) {
    throw new AppError("disposable_email_domain", "Disposable email domains are not allowed", 422, {
      email: "disposable_domain",
    });
  }
  try {
    await domainValidation.assertUsable(domain);
  } catch (error) {
    if (error instanceof EmailDomainValidationError && error.kind === "invalid") {
      throw new AppError("invalid_email_domain", "Email domain cannot receive mail", 422, {
        email: "invalid_domain",
      });
    }
    if (error instanceof EmailDomainValidationError) {
      throw new AppError("email_domain_unavailable", "Email domain validation is temporarily unavailable", 503);
    }
    throw error;
  }
}

async function createAndDeliverChallenge(input: {
  user: UserRow;
  purpose: EmailPurpose;
  locale: EmailLocale;
  enforceCooldown: boolean;
}): Promise<"sent" | "not_eligible"> {
  const code = generateChallengeCode();
  const now = new Date();
  const created = await createOrReplaceEmailChallenge({
    userId: input.user.id,
    purpose: input.purpose,
    codeHash: hashChallengeCode(input.user.id, input.purpose, code),
    expiresAt: new Date(now.getTime() + env.EMAIL_CHALLENGE_TTL_SEC * 1000),
    maxAttempts: env.EMAIL_CHALLENGE_MAX_ATTEMPTS,
    now,
    cooldownSec: env.EMAIL_RESEND_COOLDOWN_SEC,
    enforceCooldown: input.enforceCooldown,
  });
  if (created.state === "not_eligible") return "not_eligible";
  if (created.state === "cooldown") {
    throw new AppError("resend_cooldown", "Please wait before requesting another code", 429, {
      retryAfterSec: String(created.retryAfterSec),
    });
  }

  try {
    await emailDeliveryService().send(
      input.user.email,
      renderAuthEmail({
        purpose: input.purpose,
        locale: input.locale,
        code,
        expiresInMinutes: Math.ceil(env.EMAIL_CHALLENGE_TTL_SEC / 60),
      }),
    );
    await markEmailChallengeSent(created.challengeId, new Date());
    return "sent";
  } catch {
    await invalidateEmailChallenge(created.challengeId, new Date());
    throw new AppError(
      "email_delivery_unavailable",
      "Email delivery is temporarily unavailable. Please try again.",
      503,
    );
  }
}

function verificationRequired(email: string): VerificationRequiredResponse {
  return {
    ok: true,
    verificationRequired: true,
    email,
    resendAfterSec: env.EMAIL_RESEND_COOLDOWN_SEC,
  };
}

export async function register(
  input: RegisterBody,
  context: AuthRequestContext = {},
): Promise<VerificationRequiredResponse> {
  const email = normalizeEmail(input.email);
  await registrationAbuseGuard.consume("register", email, context);
  await assertRegistrationEmailAllowed(email);
  const password = normalizePassword(input.password);
  const displayName = normalizeDisplayName(input.displayName);
  assertSafeText(displayName, { field: "displayName", maxUrls: 0 });
  const passwordHash = await hashPassword(password);

  for (let attempt = 0; attempt < amoriaIdRetries; attempt += 1) {
    try {
      const user = await createUser({
        email,
        emailVerifiedAt: null,
        passwordHash,
        displayName,
        amoriaId: generateAmoriaId(),
      });
      await createAndDeliverChallenge({
        user,
        purpose: "verify_email",
        locale: normalizeEmailLocale(input.locale),
        enforceCooldown: false,
      });
      return verificationRequired(email);
    } catch (error) {
      const constraint = uniqueConstraint(error);
      if (constraint?.includes("email")) {
        const existing = await findUserByEmail(email);
        if (existing && !existing.emailVerifiedAt) return verificationRequired(email);
        throw new AppError("email_taken", "Email is already registered", 409, { email: "taken" });
      }
      if (constraint?.includes("amoria_id")) continue;
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
  await registrationAbuseGuard.check("login", email, context);
  const user = await findUserByEmail(email);
  const passwordMatches = await verifyPassword(password, user?.passwordHash ?? dummyPasswordHash);
  if (!user || !passwordMatches) {
    await registrationAbuseGuard.recordFailure("login", email, context);
    throw invalidCredentials();
  }
  if (!user.emailVerifiedAt) {
    throw new AppError("email_not_verified", "Email verification is required", 403, {
      email: user.email,
    });
  }
  assertAccountActive(user);
  const refreshToken = await issueRefreshToken(user.id, context);
  return buildAuthResponse(user, refreshToken);
}

export async function verifyEmail(
  input: EmailCodeBody,
  context: AuthRequestContext = {},
): Promise<AuthResponse> {
  const email = normalizeEmail(input.email);
  const code = normalizeCode(input.code);
  await registrationAbuseGuard.check("verify", email, context);
  const user = await findUserByEmail(email);
  if (!user) {
    await registrationAbuseGuard.recordFailure("verify", email, context);
    throw new AppError("invalid_verification_code", "Verification code is invalid", 400);
  }
  const consumed = await consumeEmailVerificationChallenge({
    userId: user.id,
    codeHash: hashChallengeCode(user.id, "verify_email", code),
    now: new Date(),
  });
  if (consumed.state !== "valid") {
    if (consumed.state === "invalid") {
      await registrationAbuseGuard.recordFailure("verify", email, context);
      throw new AppError("invalid_verification_code", "Verification code is invalid", 400);
    }
    if (consumed.state === "expired") {
      throw new AppError("verification_code_expired", "Verification code has expired", 400);
    }
    throw new AppError("verification_attempts_exceeded", "Too many verification attempts", 429, {
      retryAfterSec: String(env.EMAIL_RESEND_COOLDOWN_SEC),
    });
  }
  assertAccountActive(consumed.user);
  const refreshToken = await issueRefreshToken(consumed.user.id, context);
  return buildAuthResponse(consumed.user, refreshToken);
}

export async function resendVerification(
  input: ResendVerificationBody,
  context: AuthRequestContext = {},
): Promise<ResendVerificationResponse> {
  const email = normalizeEmail(input.email);
  await registrationAbuseGuard.consume("resend", email, context);
  const user = await findUserByEmail(email);
  if (user && !user.emailVerifiedAt) {
    await createAndDeliverChallenge({
      user,
      purpose: "verify_email",
      locale: normalizeEmailLocale(input.locale),
      enforceCooldown: true,
    });
  }
  return { ok: true, resendAfterSec: env.EMAIL_RESEND_COOLDOWN_SEC };
}

export async function requestPasswordReset(
  input: PasswordResetRequestBody,
  context: AuthRequestContext = {},
): Promise<OkResponse> {
  const email = normalizeEmail(input.email);
  await registrationAbuseGuard.consume("reset_request", email, context);
  const user = await findUserByEmail(email);
  if (user?.emailVerifiedAt) {
    await createAndDeliverChallenge({
      user,
      purpose: "password_reset",
      locale: normalizeEmailLocale(input.locale),
      enforceCooldown: true,
    });
  }
  return { ok: true };
}

export async function confirmPasswordReset(
  input: PasswordResetConfirmBody,
  context: AuthRequestContext = {},
): Promise<OkResponse> {
  const email = normalizeEmail(input.email);
  const code = normalizeCode(input.code);
  const password = normalizePassword(input.newPassword);
  await registrationAbuseGuard.check("reset_confirm", email, context);
  const user = await findUserByEmail(email);
  if (!user?.emailVerifiedAt) {
    await registrationAbuseGuard.recordFailure("reset_confirm", email, context);
    throw new AppError("invalid_password_reset_code", "Password reset code is invalid", 400);
  }
  const newPasswordHash = await hashPassword(password);
  const consumed = await consumePasswordResetChallenge({
    userId: user.id,
    codeHash: hashChallengeCode(user.id, "password_reset", code),
    newPasswordHash,
    now: new Date(),
  });
  if (consumed.state === "valid") return { ok: true };
  if (consumed.state === "invalid") {
    await registrationAbuseGuard.recordFailure("reset_confirm", email, context);
    throw new AppError("invalid_password_reset_code", "Password reset code is invalid", 400);
  }
  if (consumed.state === "expired") {
    throw new AppError("password_reset_code_expired", "Password reset code has expired", 400);
  }
  throw new AppError("password_reset_attempts_exceeded", "Too many password reset attempts", 429, {
    retryAfterSec: String(env.EMAIL_RESEND_COOLDOWN_SEC),
  });
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
    if (!rotated.user.emailVerifiedAt || (rotated.user.accountStatus ?? "active") !== "active") {
      await revokeAllRefreshTokensForUser(rotated.user.id, now);
      if ((rotated.user.accountStatus ?? "active") !== "active") {
        throw new AppError("account_suspended", "Account is suspended", 403);
      }
      throw invalidRefresh();
    }
    return buildAuthResponse(rotated.user, nextRefreshToken);
  }
  const retry = await findRecentRefreshReplacement({
    tokenHash,
    retryAfter: new Date(now.getTime() - REFRESH_RETRY_GRACE_MS),
    now,
    metadata: context,
  });
  if (!retry?.user.emailVerifiedAt) throw invalidRefresh();
  assertAccountActive(retry.user);
  return buildAuthResponse(
    retry.user,
    deriveRotatedRefreshToken(refreshToken, retry.refreshToken.id),
  );
}

export async function logout(input: LogoutBody): Promise<OkResponse> {
  const refreshToken = input.refreshToken.trim();
  if (refreshToken) await revokeRefreshTokenByHash(hashRefreshToken(refreshToken), new Date());
  return { ok: true };
}

export async function logoutAll(userId: string): Promise<OkResponse> {
  await revokeAllRefreshTokensForUser(userId, new Date());
  return { ok: true };
}
