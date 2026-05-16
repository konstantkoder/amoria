import path from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyInstance } from "fastify";
import { errorHandler } from "./common/errors";
import { withErrorResponses } from "./common/http";
import { MAX_AVATAR_INPUT_BYTES, MAX_JSON_BODY_BYTES, SERVICE_NAME } from "./config/constants";
import { env } from "./config/env";
import { loggerOptions } from "./config/logger";
import { authRoutes } from "./auth/auth.routes";
import { adminRoutes } from "./admin/admin.routes";
import { announcementsRoutes } from "./announcements/announcements.routes";
import { usersRoutes } from "./users/users.routes";
import { chatRoutes } from "./chat/chat.routes";
import { mediaRoutes } from "./media/media.routes";
import { mediaManagementRoutes, mediaUploadRoutes } from "./media/uploads.routes";
import { nearbyRoutes } from "./nearby/nearby.routes";
import { safetyRoutes } from "./safety/safety.routes";
import { togetherRoutes } from "./together/together.routes";
import { clientErrorsRoutes } from "./client-errors/client-errors.routes";
import { ensureUploadsRootSync } from "./media/local-storage";
import { wsRoutes } from "./realtime/ws.routes";

const healthRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["ok", "service", "time"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean" },
        service: { type: "string" },
        time: { type: "string", format: "date-time" },
      },
    },
  },
} as const;

export function buildApp(): FastifyInstance {
  ensureUploadsRootSync();

  const app = Fastify({
    logger: loggerOptions(),
    bodyLimit: MAX_JSON_BODY_BYTES,
    trustProxy: true,
  });

  app.setErrorHandler(errorHandler);

  void app.register(helmet, {
    contentSecurityPolicy: false,
  });

  void app.register(cors, {
    origin: true,
  });

  void app.register(multipart, {
    limits: {
      fileSize: MAX_AVATAR_INPUT_BYTES,
      files: 1,
    },
    throwFileSizeLimit: true,
  });

  void app.register(fastifyStatic, {
    root: path.resolve(env.UPLOADS_ROOT),
    prefix: "/media/",
    decorateReply: false,
  });

  void app.register(websocket);

  app.get("/health", { schema: withErrorResponses(healthRouteSchema) }, async () => ({
    ok: true,
    service: SERVICE_NAME,
    time: new Date().toISOString(),
  }));

  void app.register(authRoutes, { prefix: "/auth" });
  void app.register(adminRoutes, { prefix: "/admin" });
  void app.register(announcementsRoutes, { prefix: "/announcements" });
  void app.register(usersRoutes);
  void app.register(mediaRoutes, { prefix: "/media" });
  void app.register(mediaUploadRoutes, { prefix: "/media/uploads" });
  void app.register(mediaManagementRoutes, { prefix: "/media" });
  void app.register(clientErrorsRoutes, { prefix: "/client" });
  void app.register(chatRoutes);
  void app.register(safetyRoutes, { prefix: "/safety" });
  void app.register(nearbyRoutes, { prefix: "/nearby" });
  void app.register(togetherRoutes, { prefix: "/together" });
  void app.register(wsRoutes, { prefix: "/ws" });

  return app;
}
