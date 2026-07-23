import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { wsHub } from "../realtime/ws.hub";
import {
  deleteTogetherQueueRouteSchema,
  getTogetherQueueRouteSchema,
  getTogetherSessionEventsRouteSchema,
  getTogetherSessionRouteSchema,
  parseTogetherEventBody,
  parseTogetherQueueBody,
  parseTogetherQueueCancelBody,
  parseTogetherRevealBody,
  postTogetherEventRouteSchema,
  postTogetherFinishRouteSchema,
  postTogetherHeartbeatRouteSchema,
  postTogetherLeaveRouteSchema,
  postTogetherQueueRouteSchema,
  postTogetherRevealRouteSchema,
} from "./together.schemas";
import {
  parseTurnBasedActionBody,
  parseTurnBasedStartBody,
  turnBasedActionRouteSchema,
  turnBasedCurrentRouteSchema,
  turnBasedMomentRouteSchema,
  turnBasedStartRouteSchema,
} from "./together-turn-based.schemas";
import * as turnBasedService from "./together-turn-based.service";
import * as togetherService from "./together.service";
import type { TogetherSessionUpdateResult } from "./together.types";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function togetherRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/turn-based/start",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedStartRouteSchema) },
    async (request) => {
      const response = await turnBasedService.start(
        currentUserId(request),
        parseTurnBasedStartBody(request.body),
      );
      if (response.moment) await broadcastTurnBasedMoment(response.moment.id);
      return response;
    },
  );

  fastify.get(
    "/turn-based/current",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedCurrentRouteSchema) },
    async (request) => turnBasedService.getCurrent(currentUserId(request)),
  );

  fastify.get<{ Params: { id: string } }>(
    "/turn-based/moments/:id",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedMomentRouteSchema) },
    async (request) => turnBasedService.getMoment(currentUserId(request), request.params.id),
  );

  fastify.post<{ Params: { id: string } }>(
    "/turn-based/moments/:id/submit-draw",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedActionRouteSchema) },
    async (request) => {
      const response = await turnBasedService.submitDraw(currentUserId(request), request.params.id, parseTurnBasedActionBody(request.body));
      await broadcastTurnBasedMoment(request.params.id);
      return response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/turn-based/moments/:id/lease",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedMomentRouteSchema) },
    async (request) => {
      const response = await turnBasedService.renewLease(currentUserId(request), request.params.id);
      await broadcastTurnBasedMoment(request.params.id);
      return response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/turn-based/moments/:id/cancel",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedActionRouteSchema) },
    async (request) => {
      const response = await turnBasedService.cancel(currentUserId(request), request.params.id, parseTurnBasedActionBody(request.body));
      await broadcastTurnBasedMoment(request.params.id);
      return response;
    },
  );

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
    async (request) =>
      togetherService.cancelQueueEntry(
        currentUserId(request),
        request.params.id,
        parseTogetherQueueCancelBody(request.body),
      ),
  );

  fastify.get<{ Params: { id: string } }>(
    "/sessions/:id",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getTogetherSessionRouteSchema),
    },
    async (request) => togetherService.getSession(currentUserId(request), request.params.id),
  );

  fastify.get<{ Params: { id: string } }>(
    "/sessions/:id/events",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getTogetherSessionEventsRouteSchema),
    },
    async (request) =>
      togetherService.listSessionEventsForMember(currentUserId(request), request.params.id),
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
    async (request) => {
      const result = await togetherService.finishSession(
        currentUserId(request),
        request.params.id,
      );
      broadcastSessionUpdate(request.params.id, result);
      return result.response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/leave",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherLeaveRouteSchema),
    },
    async (request) => {
      const result = await togetherService.leaveSession(
        currentUserId(request),
        request.params.id,
      );
      broadcastSessionUpdate(request.params.id, result);
      return result.response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/heartbeat",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherHeartbeatRouteSchema),
    },
    async (request) => {
      const result = await togetherService.heartbeatSession(
        currentUserId(request),
        request.params.id,
      );
      broadcastSessionUpdate(request.params.id, result);
      return result.response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/sessions/:id/reveal",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherRevealRouteSchema),
    },
    async (request) => {
      const actorUserId = currentUserId(request);
      const result = await togetherService.reveal(
        actorUserId,
        request.params.id,
        parseTogetherRevealBody(request.body),
      );
      await turnBasedService.syncReveal(request.params.id);
      const turnBasedMomentId = await turnBasedService.findMomentIdBySession(request.params.id);
      if (turnBasedMomentId) await broadcastTurnBasedMoment(turnBasedMomentId);

      wsHub.broadcastTogetherRevealUpdated(
        request.params.id,
        result.broadcasts,
        actorUserId,
      );

      return result.response;
    },
  );

}

function broadcastSessionUpdate(
  sessionId: string,
  result: TogetherSessionUpdateResult,
): void {
  if (!result.changed || !result.reason || !result.actorUserId) {
    return;
  }

  wsHub.broadcastTogetherSessionUpdated(sessionId, {
    sessionId,
    session: result.response,
    reason: result.reason,
    actorUserId: result.actorUserId,
  });
}

async function broadcastTurnBasedMoment(momentId: string): Promise<void> {
  const broadcasts = await turnBasedService.getMomentBroadcasts(momentId);
  for (const broadcast of broadcasts) {
    wsHub.broadcastTurnBasedUpdated([broadcast.userId], broadcast.moment);
  }
}
