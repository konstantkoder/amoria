import { randomUUID } from "node:crypto";
import { AppError, forbidden, unauthorized } from "../common/errors";
import { normalizeEmail } from "../common/validators";
import { REFRESH_TOKEN_EXPIRES_MS, verifyPasswordCredentials } from "../auth/auth.service";
import type { AuthRequestContext, LoginBody } from "../auth/auth.types";
import { env } from "../config/env";
import { signAdminAccessTokenWithExpiry } from "./admin-jwt";
import * as adminService from "./admin.service";
import * as auditService from "./admin-audit.service";
import {
  buildOtpAuthUri,
  decryptTotpSecret,
  encryptTotpSecret,
  generateOpaqueToken,
  generateRecoveryCodes,
  generateTotpSecret,
  hashOpaqueToken,
  hashRecoveryCode,
  hashSecurityContext,
} from "./admin-mfa.crypto";
import * as mfaRepo from "./admin-mfa.repo";
import { adminMfaRateLimit } from "./admin-mfa-rate-limit";
import { ADMIN_ROLE_KEYS, type AdminContext, type AdminRequestContext } from "./admin.types";

export type AdminAccessSessionResponse = {
  accessToken: string;
  accessTokenExpiresAt: string;
  user: {
    id: string;
    email: string;
    displayName: string;
    amoriaId: string;
    avatarUrl: string | null;
  };
};

export type AdminPasswordStageResponse =
  | { state: "mfa_required" }
  | { state: "enrollment_required"; enrollment: { manualKey: string; otpauthUri: string } };

export type AdminMfaCompletionResponse = AdminAccessSessionResponse & {
  recoveryCodes?: string[];
  recoveryUsed: boolean;
  remainingRecoveryCodes: number;
};

export type AdminSecurityRequestContext = AuthRequestContext & AdminRequestContext;

const adminRefreshTokenPattern = /^[A-Za-z0-9_-]{32,256}$/u;

function adminAuditContext(context: AdminSecurityRequestContext): AdminRequestContext {
  return {
    requestId: context.requestId,
    ipAddress: context.ip ?? context.ipAddress,
    userAgent: context.userAgent,
  };
}

function invalidAdminCredentials(): AppError {
  return new AppError("invalid_admin_credentials", "Invalid Admin credentials", 401);
}

function invalidMfa(state?: "invalid" | "expired" | "attempts_exceeded"): AppError {
  if (state === "expired") return new AppError("admin_pre_auth_expired", "Admin verification expired", 401);
  if (state === "attempts_exceeded") return new AppError("admin_mfa_attempts_exceeded", "Admin verification failed", 429);
  return new AppError("invalid_admin_mfa", "Admin verification failed", 401);
}

function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + REFRESH_TOKEN_EXPIRES_MS);
}

function accessSession(principal: mfaRepo.AdminSessionPrincipal): AdminAccessSessionResponse {
  return {
    ...signAdminAccessTokenWithExpiry({
      userId: principal.userId,
      adminUserId: principal.adminUserId,
      adminSessionVersion: principal.adminSessionVersion,
      userAuthVersion: principal.userAuthVersion,
    }),
    user: principal.user,
  };
}

function adminSessionVersion(admin: AdminContext): number {
  if (!admin.security?.mfaEnabled) throw unauthorized("Admin MFA is required");
  return admin.security.adminSessionVersion;
}

export async function beginAdminLogin(
  input: LoginBody,
  context: AdminSecurityRequestContext,
): Promise<{ response: AdminPasswordStageResponse; preAuthToken: string }> {
  const email = normalizeEmail(input.email);
  await adminMfaRateLimit.check("password", email, context);
  let admin: AdminContext;
  try {
    const user = await verifyPasswordCredentials(input);
    admin = await adminService.getAdminContextByUserId(user.id);
    adminService.assertAdminHasAnyRole(admin, [...ADMIN_ROLE_KEYS]);
  } catch {
    await auditService.writeAuditLog({
      adminUserId: null,
      action: "admin.login.failure",
      targetType: "admin_session",
      metadata: { outcome: "rejected" },
      ...adminAuditContext(context),
    });
    await adminMfaRateLimit.recordFailure("password", email, context);
    throw invalidAdminCredentials();
  }

  const now = new Date();
  const preAuthToken = generateOpaqueToken();
  const generatedSecret = generateTotpSecret();
  const prepared = await mfaRepo.prepareMfaChallenge({
    adminUserId: admin.adminUser.id,
    tokenHash: hashOpaqueToken(preAuthToken),
    newCredential: encryptTotpSecret(generatedSecret, admin.adminUser.id),
    ipHash: hashSecurityContext("ip", context.ip),
    userAgentHash: hashSecurityContext("user-agent", context.userAgent),
    maxAttempts: env.ADMIN_MFA_MAX_ATTEMPTS,
    expiresAt: new Date(now.getTime() + env.ADMIN_PRE_AUTH_TTL_SEC * 1000),
    now,
  });
  if (prepared.flow === "verify") return { response: { state: "mfa_required" }, preAuthToken };
  if (!prepared.credential) throw new Error("Pending MFA credential is missing");
  const manualKey = decryptTotpSecret(prepared.credential, admin.adminUser.id);
  return {
    response: {
      state: "enrollment_required",
      enrollment: { manualKey, otpauthUri: buildOtpAuthUri(manualKey, admin.user.email) },
    },
    preAuthToken,
  };
}

export async function completeAdminMfa(
  input: { preAuthToken: string; method: "totp" | "recovery"; code: string },
  context: AdminSecurityRequestContext,
): Promise<{ response: AdminMfaCompletionResponse; refreshToken: string }> {
  const preAuthHash = hashOpaqueToken(input.preAuthToken);
  const action = input.method === "recovery" ? "recovery" : "totp";
  const rateLimitIdentity = await mfaRepo.findChallengeAdminUserId(preAuthHash) ?? preAuthHash;
  await adminMfaRateLimit.check(action, rateLimitIdentity, context);
  const now = new Date();
  const refreshToken = generateOpaqueToken();
  const recoveryCodes = generateRecoveryCodes();
  const result = await mfaRepo.consumeMfaChallenge({
    tokenHash: preAuthHash,
    ipHash: hashSecurityContext("ip", context.ip),
    userAgentHash: hashSecurityContext("user-agent", context.userAgent),
    method: input.method,
    code: input.code.trim(),
    enrollmentRecoveryCodes: recoveryCodes.map((code) => ({ codeHash: hashRecoveryCode(code) })),
    recoveryGenerationId: mfaRepo.newRecoveryGenerationId(),
    session: {
      id: randomUUID(),
      familyId: randomUUID(),
      tokenHash: hashOpaqueToken(refreshToken),
      expiresAt: sessionExpiry(now),
      deviceId: context.deviceId,
      userAgent: context.userAgent,
    },
    now,
  });
  if (result.state !== "success") {
    await adminMfaRateLimit.recordFailure(action, rateLimitIdentity, context);
    if (result.adminUserId) {
      await auditService.writeAuditLog({
        adminUserId: result.adminUserId,
        action: "admin.mfa.failure",
        targetType: "admin_user",
        targetId: result.adminUserId,
        metadata: { method: input.method, outcome: result.state },
        ...adminAuditContext(context),
      });
    }
    throw invalidMfa(result.state);
  }

  if (result.enrolled) {
    await auditService.writeAuditLog({
      adminUserId: result.principal.adminUserId,
      action: "admin.mfa.enrolled",
      targetType: "admin_user",
      targetId: result.principal.adminUserId,
      metadata: { recoveryCodeCount: recoveryCodes.length },
      ...adminAuditContext(context),
    });
  }
  if (result.recoveryUsed) {
    await auditService.writeAuditLog({
      adminUserId: result.principal.adminUserId,
      action: "admin.mfa.recovery_used",
      targetType: "admin_user",
      targetId: result.principal.adminUserId,
      metadata: { remainingRecoveryCodes: result.remainingRecoveryCodes },
      ...adminAuditContext(context),
    });
  }
  await auditService.writeAuditLog({
    adminUserId: result.principal.adminUserId,
    action: "admin.login.success",
    targetType: "admin_user",
    targetId: result.principal.adminUserId,
    metadata: { method: input.method, enrolled: result.enrolled },
    ...adminAuditContext(context),
  });
  return {
    response: {
      ...accessSession(result.principal),
      ...(result.enrolled ? { recoveryCodes } : {}),
      recoveryUsed: result.recoveryUsed,
      remainingRecoveryCodes: result.remainingRecoveryCodes,
    },
    refreshToken,
  };
}

export async function refreshAdminSession(
  refreshToken: string,
  context: AdminSecurityRequestContext,
): Promise<{ response: AdminAccessSessionResponse; refreshToken: string }> {
  if (!adminRefreshTokenPattern.test(refreshToken)) throw unauthorized("Invalid Admin refresh token");
  const now = new Date();
  const replacementToken = generateOpaqueToken();
  const principal = await mfaRepo.rotateAdminSession({
    currentTokenHash: hashOpaqueToken(refreshToken),
    replacement: { id: randomUUID(), tokenHash: hashOpaqueToken(replacementToken) },
    expiresAt: sessionExpiry(now),
    now,
    deviceId: context.deviceId,
    userAgent: context.userAgent,
  });
  if (!principal) throw unauthorized("Invalid Admin refresh token");
  return { response: accessSession(principal), refreshToken: replacementToken };
}

export async function logoutAdminSession(refreshToken: string | undefined): Promise<{ ok: true }> {
  if (refreshToken && adminRefreshTokenPattern.test(refreshToken)) {
    await mfaRepo.revokeAdminSessionByTokenHash(hashOpaqueToken(refreshToken));
  }
  return { ok: true };
}

export async function createAdminStepUp(
  admin: AdminContext,
  code: string,
  context: AdminSecurityRequestContext,
): Promise<{ stepUpToken: string; expiresAt: Date }> {
  await adminMfaRateLimit.check("step_up", admin.adminUser.id, context);
  const now = new Date();
  const stepUpToken = generateOpaqueToken();
  const expiresAt = new Date(now.getTime() + env.ADMIN_STEP_UP_TTL_SEC * 1000);
  const accepted = await mfaRepo.createStepUpSession({
    adminUserId: admin.adminUser.id,
    adminSessionVersion: adminSessionVersion(admin),
    code: code.trim(),
    tokenHash: hashOpaqueToken(stepUpToken),
    expiresAt,
    now,
  });
  if (!accepted) {
    await auditService.writeAuditLog({
      adminUserId: admin.adminUser.id,
      action: "admin.mfa.step_up.failure",
      targetType: "admin_user",
      targetId: admin.adminUser.id,
      metadata: { outcome: "rejected" },
      ...adminAuditContext(context),
    });
    await adminMfaRateLimit.recordFailure("step_up", admin.adminUser.id, context);
    throw invalidMfa();
  }
  await auditService.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.mfa.step_up.success",
    targetType: "admin_user",
    targetId: admin.adminUser.id,
    ...adminAuditContext(context),
  });
  return { stepUpToken, expiresAt };
}

export async function regenerateOwnRecoveryCodes(
  admin: AdminContext,
  context: AdminSecurityRequestContext,
): Promise<{ recoveryCodes: string[] }> {
  const recoveryCodes = generateRecoveryCodes();
  const replaced = await mfaRepo.replaceRecoveryCodes({
    adminUserId: admin.adminUser.id,
    generationId: mfaRepo.newRecoveryGenerationId(),
    codeHashes: recoveryCodes.map(hashRecoveryCode),
    adminSessionVersion: adminSessionVersion(admin),
    now: new Date(),
  });
  if (!replaced) throw unauthorized("Admin access has changed");
  await auditService.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.mfa.recovery_regenerated",
    targetType: "admin_user",
    targetId: admin.adminUser.id,
    metadata: { recoveryCodeCount: recoveryCodes.length },
    ...adminAuditContext(context),
  });
  return { recoveryCodes };
}

export async function resetAdminMfa(input: {
  actor: AdminContext;
  targetAdminUserId: string;
  reason: string;
  context: AdminSecurityRequestContext;
}): Promise<{ ok: true }> {
  if (input.targetAdminUserId !== input.actor.adminUser.id && !input.actor.adminUser.roles.includes("owner")) {
    throw forbidden("Owner role is required");
  }
  const reset = await mfaRepo.resetMfaCredential(input.targetAdminUserId);
  if (!reset) throw new AppError("not_found", "Admin user not found", 404);
  await auditService.writeAuditLog({
    adminUserId: input.actor.adminUser.id,
    action: "admin.mfa.reset",
    targetType: "admin_user",
    targetId: input.targetAdminUserId,
    reason: input.reason,
    metadata: { sessionsRevoked: true, reenrollmentRequired: true },
    ...adminAuditContext(input.context),
  });
  return { ok: true };
}
