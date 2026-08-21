import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { AppError, unauthorized } from "../common/errors";
import { hashOpaqueToken } from "./admin-mfa.crypto";
import * as mfaRepo from "./admin-mfa.repo";

export const ADMIN_STEP_UP_COOKIE_NAME = "amoria_admin_step_up";

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    try {
      const value = decodeURIComponent(entry.slice(separator + 1).trim());
      return /^[A-Za-z0-9_-]{32,256}$/u.test(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export const requireRecentStepUp: preHandlerHookHandler = async (
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> => {
  if (!request.admin || !request.adminAuth || !request.admin.security) throw unauthorized();
  const token = readCookie(request.headers.cookie, ADMIN_STEP_UP_COOKIE_NAME);
  if (!token || !await mfaRepo.hasValidStepUp({
    adminUserId: request.admin.adminUser.id,
    adminSessionVersion: request.admin.security.adminSessionVersion,
    tokenHash: hashOpaqueToken(token),
    now: new Date(),
  })) {
    throw new AppError("step_up_required", "Recent MFA confirmation is required", 403);
  }
};
