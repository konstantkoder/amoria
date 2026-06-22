import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { wsHub } from "../realtime/ws.hub";
import {
  createNearbyStatusRouteSchema,
  deleteNearbyStatusRouteSchema,
  getNearbyMeRouteSchema,
  getNearbySummaryRouteSchema,
  legacyNearbyStatusFeedRouteSchema,
  nearbyProfileFeedRouteSchema,
  patchNearbyProfileStatusRouteSchema,
  parseCreateNearbyStatusBody,
  parseNearbyProfileFeedQuery,
  parseNearbyFeedQuery,
  parsePatchNearbyProfileStatusBody,
  parseUpdateNearbyVisibilityBody,
  updateNearbyVisibilityRouteSchema,
} from "./nearby.schemas";
import * as nearbyService from "./nearby.service";
import {
  getNearbyActivityPreferencesRouteSchema,
  parseUpdateNearbyActivityPreferencesBody,
  updateNearbyActivityPreferencesRouteSchema,
} from "./nearby-activity-preferences.schemas";
import * as nearbyActivityPreferencesService from "./nearby-activity-preferences.service";
import {
  getNearbyRoomMessagesRouteSchema,
  openNearbyRoomChatRouteSchema,
  parseNearbyRoomMessagesQuery,
  parseSendNearbyRoomMessageBody,
  sendNearbyRoomMessageRouteSchema,
} from "./nearby-room-chat.schemas";
import * as nearbyRoomChatService from "./nearby-room-chat.service";
import {
  nearbyRoomJoinRouteSchema,
  nearbyRoomLeaveRouteSchema,
  nearbyRoomsRouteSchema,
} from "./nearby-rooms.schemas";
import * as nearbyRoomsService from "./nearby-rooms.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function nearbyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/rooms",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(nearbyRoomsRouteSchema),
    },
    async (request) => nearbyRoomsService.listNearbyRooms(currentUserId(request)),
  );

  fastify.post<{ Params: { roomId: string } }>(
    "/rooms/:roomId/join",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(nearbyRoomJoinRouteSchema),
    },
    async (request) =>
      nearbyRoomsService.joinNearbyRoom(currentUserId(request), request.params.roomId),
  );

  fastify.post<{ Params: { roomId: string } }>(
    "/rooms/:roomId/leave",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(nearbyRoomLeaveRouteSchema),
    },
    async (request) =>
      nearbyRoomsService.leaveNearbyRoom(currentUserId(request), request.params.roomId),
  );

  fastify.post<{ Params: { roomId: string } }>(
    "/rooms/:roomId/open",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(openNearbyRoomChatRouteSchema),
    },
    async (request) =>
      nearbyRoomChatService.openNearbyRoomChat(
        currentUserId(request),
        request.params.roomId,
      ),
  );

  fastify.get<{ Params: { roomId: string } }>(
    "/rooms/:roomId/messages",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getNearbyRoomMessagesRouteSchema),
    },
    async (request) =>
      nearbyRoomChatService.getNearbyRoomMessages(
        currentUserId(request),
        request.params.roomId,
        parseNearbyRoomMessagesQuery(request.query),
      ),
  );

  fastify.post<{ Params: { roomId: string } }>(
    "/rooms/:roomId/messages",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(sendNearbyRoomMessageRouteSchema),
    },
    async (request) => {
      const result = await nearbyRoomChatService.sendNearbyRoomMessage(
        currentUserId(request),
        request.params.roomId,
        parseSendNearbyRoomMessageBody(request.body),
      );

      if (result.created) {
        wsHub.broadcastThreadMessage(result.threadId, result.response.message);
      }

      return result.response;
    },
  );

  fastify.get(
    "/activity-preferences",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getNearbyActivityPreferencesRouteSchema),
    },
    async (request) =>
      nearbyActivityPreferencesService.getActivityPreferences(currentUserId(request)),
  );

  fastify.put(
    "/activity-preferences",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(updateNearbyActivityPreferencesRouteSchema),
    },
    async (request) =>
      nearbyActivityPreferencesService.updateActivityPreferences(
        currentUserId(request),
        parseUpdateNearbyActivityPreferencesBody(request.body),
      ),
  );

  fastify.get(
    "/me",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getNearbyMeRouteSchema),
    },
    async (request) => nearbyService.getNearbyMe(currentUserId(request)),
  );

  fastify.get(
    "/summary",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getNearbySummaryRouteSchema),
    },
    async (request) => nearbyService.getNearbySummary(currentUserId(request)),
  );

  fastify.put(
    "/me/visibility",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(updateNearbyVisibilityRouteSchema),
    },
    async (request) =>
      nearbyService.updateNearbyVisibility(
        currentUserId(request),
        parseUpdateNearbyVisibilityBody(request.body),
      ),
  );

  fastify.patch(
    "/me/status",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(patchNearbyProfileStatusRouteSchema),
    },
    async (request) =>
      nearbyService.patchNearbyProfileStatus(
        currentUserId(request),
        parsePatchNearbyProfileStatusBody(request.body),
      ),
  );

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
    "/statuses/feed",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(legacyNearbyStatusFeedRouteSchema),
    },
    async (request) =>
      nearbyService.getFeed(currentUserId(request), parseNearbyFeedQuery(request.query)),
  );

  fastify.get(
    "/feed",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(nearbyProfileFeedRouteSchema),
    },
    async (request) =>
      nearbyService.getProfileFeed(
        currentUserId(request),
        parseNearbyProfileFeedQuery(request.query),
      ),
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
