import type { FastifyInstance } from "fastify";
import { authMiddleware } from "../common/security/auth-middleware";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import type { UpdateProfileBody } from "./users.service";
import { getMeRouteSchema, updateProfileRouteSchema } from "./users.schemas";
import * as usersService from "./users.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/me",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getMeRouteSchema),
    },
    async (request) => usersService.getCurrentUser(currentUserId(request)),
  );

  fastify.patch<{ Body: UpdateProfileBody }>(
    "/me/profile",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(updateProfileRouteSchema),
    },
    async (request) =>
      usersService.updateCurrentUserProfile(currentUserId(request), request.body),
  );
}
