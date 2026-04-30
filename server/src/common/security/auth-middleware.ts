import type { FastifyReply, FastifyRequest } from "fastify";
import "../../auth/auth.types";
import { unauthorized } from "../errors";
import { verifyAccessToken } from "../../auth/jwt";

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
}
