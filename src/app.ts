import path from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { errorHandler } from "./common/errors";
import { withErrorResponses } from "./common/http";
import { MAX_AVATAR_INPUT_BYTES, MAX_JSON_BODY_BYTES, SERVICE_NAME } from "./config/constants";
import { env } from "./config/env";
import { loggerOptions } from "./config/logger";
import { authRoutes } from "./auth/auth.routes";
import { usersRoutes } from "./users/users.routes";
import { mediaRoutes } from "./media/media.routes";
import { ensureUploadsRootSync } from "./media/local-storage";

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

  app.get("/health", { schema: withErrorResponses(healthRouteSchema) }, async () => ({
    ok: true,
    service: SERVICE_NAME,
    time: new Date().toISOString(),
  }));

  void app.register(authRoutes, { prefix: "/auth" });
  void app.register(usersRoutes);
  void app.register(mediaRoutes, { prefix: "/media" });

  return app;
}
