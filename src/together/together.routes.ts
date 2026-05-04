import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { wsHub } from "../realtime/ws.hub";
import {
  deleteTogetherQueueRouteSchema,
  getTogetherHistoryRouteSchema,
  getTogetherQueueRouteSchema,
  getTogetherSessionRouteSchema,
  parseTogetherEventBody,
  parseTogetherHistoryQuery,
  parseTogetherQueueBody,
  parseTogetherRevealBody,
  postTogetherEventRouteSchema,
  postTogetherFinishRouteSchema,
  postTogetherQueueRouteSchema,
  postTogetherRevealRouteSchema,
} from "./together.schemas";
import * as togetherService from "./together.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function togetherRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/queue",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherQueueRouteSchema),
    },
    async (request) =>
      togetherService.enqueue(currentUserId(request), parseTogetherQueueBody(request.body)),
  );

  fastify.get<{ Params: { id: string } }>(
    "/queue/:id",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getTogetherQueueRouteSchema),
    },
    async (request) => togetherService.getQueueEntry(currentUserId(request), request.params.id),
  );

  fastify.delete<{ Params: { id: string } }>(
    "/queue/:id",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(deleteTogetherQueueRouteSchema),
    },
    async (request) => togetherService.cancelQueueEntry(currentUserId(request), request.params.id),
  );

  fastify.get<{ Params: { id: string } }>(
    "/sessions/:id",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getTogetherSessionRouteSchema),
    },
    async (request) => togetherService.getSession(currentUserId(request), request.params.id),
  );

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/events",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherEventRouteSchema),
    },
    async (request) => {
      const result = await togetherService.createEvent(
        currentUserId(request),
        request.params.id,
        parseTogetherEventBody(request.body),
      );

      if (result.created) {
        wsHub.broadcastTogetherEvent(request.params.id, result.event);
      }

      return result.response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/finish",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherFinishRouteSchema),
    },
    async (request) => togetherService.finishSession(currentUserId(request), request.params.id),
  );

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/reveal",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherRevealRouteSchema),
    },
    async (request) =>
      togetherService.reveal(
        currentUserId(request),
        request.params.id,
        parseTogetherRevealBody(request.body),
      ),
  );

  fastify.get(
    "/history",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getTogetherHistoryRouteSchema),
    },
    async (request) => {
      const query = parseTogetherHistoryQuery(request.query);
      return togetherService.getHistory(currentUserId(request), query.limit);
    },
  );
}
