import type { FastifyReply, FastifyRequest } from "fastify";
import { unauthorized } from "../common/errors";
import { verifyAdminAccessToken } from "./admin-jwt";

export async function adminAuthMiddleware(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw unauthorized();
  const payload = verifyAdminAccessToken(token);
  request.adminAuth = {
    userId: payload.sub,
    adminUserId: payload.auid,
    adminSessionVersion: payload.aver,
    userAuthVersion: payload.ver,
  };
}
