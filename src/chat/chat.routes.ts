import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { publishRealtimeEventSafely } from "../realtime/realtime-bus";
import {
  getThreadMessagesRouteSchema,
  inboxRouteSchema,
  markThreadReadRouteSchema,
  openDirectThreadRouteSchema,
  parseInboxQuery,
  parseMarkThreadReadBody,
  parseMessagesQuery,
  parseOpenDirectThreadBody,
  parseSendMessageBody,
  sendMessageRouteSchema,
} from "./chat.schemas";
import * as chatService from "./chat.service";
import { notifyUser } from "../notifications/notifications.service";
import { incrementMetric } from "../observability/metrics";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function chatRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/threads/direct",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(openDirectThreadRouteSchema),
    },
    async (request) =>
      chatService.openDirectThread(
        currentUserId(request),
        parseOpenDirectThreadBody(request.body),
      ),
  );

  fastify.get(
    "/inbox",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(inboxRouteSchema),
    },
    async (request) => {
      const query = parseInboxQuery(request.query);
      return chatService.getInbox(currentUserId(request), query.limit);
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/threads/:id/messages",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getThreadMessagesRouteSchema),
    },
    async (request) =>
      chatService.getThreadMessages(
        currentUserId(request),
        request.params.id,
        parseMessagesQuery(request.query),
      ),
  );

  fastify.post<{ Params: { id: string } }>(
    "/threads/:id/messages",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(sendMessageRouteSchema),
    },
    async (request) => {
      const result = await chatService.sendMessage(
        currentUserId(request),
        request.params.id,
        parseSendMessageBody(request.body),
      );

      if (result.created && result.deliveryAllowed) {
        await Promise.all([
          publishRealtimeEventSafely({
            type: "thread.message",
            threadId: result.threadId,
            message: result.response.message,
            allowedUserIds: result.participantUserIds,
          }, request.log),
          publishRealtimeEventSafely({
            type: "inbox.updated",
            userIds: result.participantUserIds,
          }, request.log),
        ]);
        const recipientIds = result.participantUserIds.filter((id) => id !== currentUserId(request));
        await Promise.all(recipientIds.map((recipientId) => notifyUser({
          userId: recipientId,
          type: "direct_message",
          titleKey: "notifications.directMessage",
          payload: { threadId: result.threadId },
          eventKey: `direct_message:${result.response.message.id}`,
        }))).catch((error) => {
          incrementMetric("amoria_chat_notification_failures_total");
          request.log.error({ err: error }, "Failed to persist direct-message notification");
        });
      }

      return result.response;
    },
  );

  fastify.post<{ Params: { id: string } }>(
    "/threads/:id/read",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(markThreadReadRouteSchema),
    },
    async (request) =>
      chatService.markThreadRead(
        currentUserId(request),
        request.params.id,
        parseMarkThreadReadBody(request.body),
      ),
  );
}
