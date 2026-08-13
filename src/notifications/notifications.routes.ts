import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { listNotificationsRouteSchema, markNotificationReadRouteSchema, parsePushTokenBody, registerPushTokenRouteSchema } from "./notifications.schemas";
import * as service from "./notifications.service";

function userId(request: { auth?: { userId: string } }) { if (!request.auth?.userId) throw unauthorized(); return request.auth.userId; }

export async function notificationsRoutes(fastify: FastifyInstance) {
  fastify.get("/notifications", { preHandler: authMiddleware, schema: withErrorResponses(listNotificationsRouteSchema) }, async (request) => service.listForUser(userId(request), Number((request.query as { limit?: number }).limit ?? 50)));
  fastify.post<{ Params: { id: string } }>("/notifications/:id/read", { preHandler: authMiddleware, schema: withErrorResponses(markNotificationReadRouteSchema) }, async (request) => service.markRead(userId(request), request.params.id));
  fastify.put("/push/token", { preHandler: authMiddleware, schema: withErrorResponses(registerPushTokenRouteSchema) }, async (request) => service.registerToken(userId(request), parsePushTokenBody(request.body)));
  fastify.delete<{ Headers: { "x-device-id"?: string } }>("/push/token", { preHandler: authMiddleware }, async (request) => service.unregisterDevice(userId(request), request.headers["x-device-id"] ?? ""));
}
