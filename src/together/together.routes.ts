import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { publishRealtimeEventSafely } from "../realtime/realtime-bus";
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
import { notifyUser } from "../notifications/notifications.service";

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
      if (response.moment) await broadcastTurnBasedMoment(response.moment.id, currentUserId(request), request.log);
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
      await broadcastTurnBasedMoment(request.params.id, currentUserId(request), request.log);
      return response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/turn-based/moments/:id/lease",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedMomentRouteSchema) },
    async (request) => {
      const response = await turnBasedService.renewLease(currentUserId(request), request.params.id);
      await broadcastTurnBasedMoment(request.params.id, currentUserId(request), request.log);
      return response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/turn-based/moments/:id/cancel",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedActionRouteSchema) },
    async (request) => {
      const response = await turnBasedService.cancel(currentUserId(request), request.params.id, parseTurnBasedActionBody(request.body));
      await broadcastTurnBasedMoment(request.params.id, currentUserId(request), request.log);
      return response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/turn-based/moments/:id/dismiss",
    { preHandler: authMiddleware, schema: withErrorResponses(turnBasedMomentRouteSchema) },
    async (request) => {
      const response = await turnBasedService.dismiss(currentUserId(request), request.params.id);
      await broadcastTurnBasedMoment(request.params.id, currentUserId(request), request.log);
      return response;
    },
  );

  fastify.post(
    "/queue",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(postTogetherQueueRouteSchema),
    },
    async (request) => {
      const actorUserId = currentUserId(request);
      const response = await togetherService.enqueue(actorUserId, parseTogetherQueueBody(request.body));
      if (response.entry.status === "matched" && response.entry.sessionId) {
        try {
          const recipientIds = await togetherService.listNotificationRecipientIds(response.entry.sessionId);
          await Promise.all(recipientIds.map((recipientId) => notifyUser({
            userId: recipientId,
            type: "together_match",
            titleKey: "notifications.togetherMatch",
            payload: { sessionId: response.entry.sessionId },
            eventKey: `together_match:${response.entry.sessionId}`,
          })));
        } catch (error) {
          request.log.error({ err: error }, "Failed to persist Together match notification");
        }
      }
      return response;
    },
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
      const actorUserId = currentUserId(request);
      const body = parseTogetherEventBody(request.body);
      const result = await togetherService.createEvent(
        actorUserId,
        request.params.id,
        body,
      );

      if (result.created) {
        await publishRealtimeEventSafely({
          type: "together.event",
          sessionId: request.params.id,
          event: result.event,
        }, request.log);
        if (body.type === "story_choice") {
          try {
            const turnBasedMomentId = await turnBasedService.findMomentIdBySession(request.params.id);
            if (turnBasedMomentId) await broadcastTurnBasedMoment(turnBasedMomentId, actorUserId, request.log);
          } catch (error) {
            request.log.error({ err: error }, "Failed to persist Together story-turn notification");
          }
        }
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
      await broadcastSessionUpdate(request.params.id, result, request.log);
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
      await broadcastSessionUpdate(request.params.id, result, request.log);
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
      await broadcastSessionUpdate(request.params.id, result, request.log);
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
      if (turnBasedMomentId) await broadcastTurnBasedMoment(turnBasedMomentId, actorUserId, request.log);

      await publishRealtimeEventSafely({
        type: "together.reveal.updated",
        sessionId: request.params.id,
        revealStates: result.broadcasts,
        actorUserId,
      }, request.log);

      return result.response;
    },
  );

}

async function broadcastSessionUpdate(
  sessionId: string,
  result: TogetherSessionUpdateResult,
  log?: { error: (value: unknown, message?: string) => void },
): Promise<void> {
  if (!result.changed || !result.reason || !result.actorUserId) {
    return;
  }

  await publishRealtimeEventSafely({
    type: "together.session.updated",
    sessionId,
    session: result.response,
    reason: result.reason,
    actorUserId: result.actorUserId,
  }, log);
}

async function broadcastTurnBasedMoment(momentId: string, actorUserId?: string, log?: { error: (value: unknown, message?: string) => void }): Promise<void> {
  const broadcasts = await turnBasedService.getMomentBroadcasts(momentId);
  for (const broadcast of broadcasts) {
    await publishRealtimeEventSafely({
      type: "together.turn_based.updated",
      userIds: [broadcast.userId],
      moment: broadcast.moment,
    }, log);
  }
  const attentionActions = new Set(["continue_draw", "review_draw", "continue_story", "review_story"]);
  const recipients = broadcasts.filter((broadcast) => attentionActions.has(broadcast.moment.action) && broadcast.userId !== actorUserId);
  await Promise.all(recipients.map((broadcast) => notifyUser({
    userId: broadcast.userId,
    type: "together_action",
    titleKey: "notifications.togetherAction",
    payload: { momentId },
    eventKey: `together_action:${momentId}:${broadcast.moment.status}:${broadcast.moment.stage}:${broadcast.moment.currentRoundId ?? "none"}:${broadcast.moment.updatedAt}`,
  }))).catch((error) => log?.error({ err: error }, "Failed to persist Together action notification"));
}
