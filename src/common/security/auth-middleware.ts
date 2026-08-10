import type { FastifyReply, FastifyRequest } from "fastify";
import "../../auth/auth.types";
import { AppError, unauthorized } from "../errors";
import { verifyAccessToken } from "../../auth/jwt";
import { findUserAccountStatus, touchUserLastSeenAt } from "../../users/users.repo";

const PRESENCE_HEARTBEAT_ENABLED = process.env.NODE_ENV !== "test";

export async function authMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;

  if (!header?.startsWith("Bearer ")) {
    throw unauthorized();
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    throw unauthorized();
  }

  const payload = verifyAccessToken(token);
  request.auth = {
    userId: payload.sub,
  };

  if (!PRESENCE_HEARTBEAT_ENABLED) {
    return;
  }

  const accountStatus = await findUserAccountStatus(payload.sub);
  if (!accountStatus) {
    throw unauthorized("User no longer exists");
  }
  if (accountStatus !== "active") {
    throw new AppError("account_suspended", "Account is suspended", 403);
  }

  try {
    await touchUserLastSeenAt(payload.sub);
  } catch (error) {
    request.log.warn({ err: error, userId: payload.sub }, "Failed to update user presence");
  }
}
