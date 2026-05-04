import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import {
  createNearbyStatusRouteSchema,
  deleteNearbyStatusRouteSchema,
  nearbyFeedRouteSchema,
  parseCreateNearbyStatusBody,
  parseNearbyFeedQuery,
} from "./nearby.schemas";
import * as nearbyService from "./nearby.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function nearbyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/statuses",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(createNearbyStatusRouteSchema),
    },
    async (request, reply) => {
      const response = await nearbyService.createStatus(
        currentUserId(request),
        parseCreateNearbyStatusBody(request.body),
      );
      return reply.status(201).send(response);
    },
  );

  fastify.get(
    "/feed",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(nearbyFeedRouteSchema),
    },
    async (request) =>
      nearbyService.getFeed(currentUserId(request), parseNearbyFeedQuery(request.query)),
  );

  fastify.delete<{ Params: { id: string } }>(
    "/statuses/:id",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(deleteNearbyStatusRouteSchema),
    },
    async (request) => nearbyService.deleteStatus(currentUserId(request), request.params.id),
  );
}
