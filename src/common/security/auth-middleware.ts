import type { FastifyReply, FastifyRequest } from "fastify";
import "../../auth/auth.types";
import { AppError, unauthorized } from "../errors";
import { verifyAccessToken } from "../../auth/jwt";
import { findUserAccessState } from "../../users/users.repo";
import { refreshUserPresence } from "../../users/user-presence.service";

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

  const accessState = await findUserAccessState(payload.sub);
  if (!accessState) {
    throw unauthorized("User no longer exists");
  }
  if (accessState.accountStatus !== "active") {
    throw new AppError("account_suspended", "Account is suspended", 403);
  }
  if (accessState.authVersion !== payload.ver) throw unauthorized("Access has been revoked");

  try {
    await refreshUserPresence(payload.sub, accessState.lastSeenAt);
  } catch (error) {
    request.log.warn({ err: error, event: "presence_update_failed" }, "Failed to update user presence");
  }
}
