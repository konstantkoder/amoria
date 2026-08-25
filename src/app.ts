import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import websocket from "@fastify/websocket";
import Fastify, { type FastifyError, type FastifyInstance } from "fastify";
import { errorHandler } from "./common/errors";
import { isWebSocketUpgradeRequest } from "./common/http-admission";
import { withErrorResponses } from "./common/http";
import { boundedDependencyStatus } from "./common/dependency-readiness";
import { MAX_JSON_BODY_BYTES, MAX_MEDIA_UPLOAD_BYTES, SERVICE_NAME } from "./config/constants";
import { env } from "./config/env";
import { loggerOptions } from "./config/logger";
import { authRoutes } from "./auth/auth.routes";
import { adminRoutes } from "./admin/admin.routes";
import { adminSessionRoutes } from "./admin/admin-session.routes";
import { announcementsRoutes } from "./announcements/announcements.routes";
import { usersRoutes } from "./users/users.routes";
import { chatRoutes } from "./chat/chat.routes";
import { mediaRoutes } from "./media/media.routes";
import { mediaManagementRoutes, mediaUploadRoutes } from "./media/uploads.routes";
import { nearbyRoutes } from "./nearby/nearby.routes";
import { safetyRoutes } from "./safety/safety.routes";
import { togetherRoutes } from "./together/together.routes";
import { clientErrorsRoutes } from "./client-errors/client-errors.routes";
import { wsRoutes } from "./realtime/ws.routes";
import { pool } from "./db/client";
import { checkObjectStorageHealth } from "./media/object-storage";
import { verifyEmailDeliveryReadiness } from "./email/email-delivery.service";
import { publicPagesRoutes } from "./public/public-pages";
import { notificationsRoutes } from "./notifications/notifications.routes";
import { recordPotentialDatabaseFailure, registerMetrics } from "./observability/metrics";
import { realtimeBusReady } from "./realtime/realtime-bus";
import { monetizationRoutes } from "./monetization/monetization.routes";
import { growthRoutes } from "./growth/growth.routes";
import { adminMonetizationRoutes } from "./admin/admin-monetization.routes";

export const EXPECTED_MIGRATION = "0040_release_monetization_founder_growth.sql";
export const WS_MAX_PAYLOAD_BYTES = 16 * 1024;

export function isCorsOriginAllowed(origin: string | undefined, allowedOrigins: string[]): boolean {
  return origin === undefined || allowedOrigins.includes(origin);
}

type DependencyReadiness = "ok" | "error";

export function summarizeReadiness(
  database: DependencyReadiness,
  objectStorage: DependencyReadiness,
  smtp: DependencyReadiness,
): { ok: boolean; degraded: boolean } {
  const ok = database === "ok" && objectStorage === "ok";
  return { ok, degraded: !ok || smtp !== "ok" };
}

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
  const app = Fastify({
    logger: loggerOptions(),
    bodyLimit: MAX_JSON_BODY_BYTES,
    trustProxy: env.TRUST_PROXY,
  });

  app.setErrorHandler((error, request, reply) => {
    recordPotentialDatabaseFailure(error);
    errorHandler(error as FastifyError, request, reply);
  });
  registerMetrics(app);
  let admittedInFlight = 0;
  const admitted = new WeakSet<object>();
  const releaseAdmission = (request: object) => {
    if (admitted.delete(request)) admittedInFlight = Math.max(0, admittedInFlight - 1);
  };
  app.addHook("onRequest", async (request, reply) => {
    if (isWebSocketUpgradeRequest(request)) return;
    if (
      admittedInFlight >= env.API_MAX_IN_FLIGHT_REQUESTS &&
      !request.url.startsWith("/health/") &&
      request.url !== "/internal/metrics"
    ) {
      return reply.status(503).header("Retry-After", "1").send({
        error: { code: "temporarily_unavailable", message: "Server is at capacity" },
      });
    }
    admittedInFlight += 1;
    admitted.add(request);
  });
  app.addHook("onResponse", async (request) => {
    releaseAdmission(request);
  });
  app.addHook("onError", async (request) => { releaseAdmission(request); });
  app.addHook("onRequestAbort", async (request) => { releaseAdmission(request); });

  void app.register(helmet, {
    contentSecurityPolicy: false,
  });

  void app.register(cors, {
    origin(origin, callback) {
      callback(null, isCorsOriginAllowed(origin, env.CORS_ALLOWED_ORIGINS));
    },
    credentials: true,
  });

  void app.register(multipart, {
    limits: {
      fileSize: MAX_MEDIA_UPLOAD_BYTES,
      files: 1,
    },
    throwFileSizeLimit: true,
  });

  void app.register(websocket, {
    options: {
      maxPayload: WS_MAX_PAYLOAD_BYTES,
    },
  });

  app.get("/health", { schema: withErrorResponses(healthRouteSchema) }, async () => ({
    ok: true,
    service: SERVICE_NAME,
    time: new Date().toISOString(),
  }));

  app.get("/health/live", { schema: withErrorResponses(healthRouteSchema) }, async () => ({
    ok: true,
    service: SERVICE_NAME,
    time: new Date().toISOString(),
  }));

  app.get("/health/ready", async (_request, reply) => {
    const [database, objectStorage, smtp] = await Promise.all([
      boundedDependencyStatus(async () => {
        await pool.query("SELECT 1");
      }),
      boundedDependencyStatus(async () => {
        const status = await checkObjectStorageHealth();
        if (status.status !== "ok") throw new Error("object_storage_unavailable");
      }),
      boundedDependencyStatus(verifyEmailDeliveryReadiness),
    ]);
    const bus = realtimeBusReady() ? "ok" : "error";
    const base = summarizeReadiness(database, objectStorage, smtp);
    const ok = base.ok && bus === "ok";
    const degraded = base.degraded || bus !== "ok";
    return reply.status(ok ? 200 : 503).send({
      ok,
      degraded,
      service: SERVICE_NAME,
      time: new Date().toISOString(),
      dependencies: { database, objectStorage, smtp, realtimeBus: bus },
    });
  });

  app.get("/version", async () => ({
    service: SERVICE_NAME,
    version: env.APP_VERSION,
    releaseSha: env.RELEASE_SHA,
    migration: EXPECTED_MIGRATION,
  }));

  void app.register(authRoutes, { prefix: "/auth" });
  void app.register(adminSessionRoutes, { prefix: "/admin/session" });
  void app.register(adminRoutes, { prefix: "/admin" });
  void app.register(adminMonetizationRoutes, { prefix: "/admin" });
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
  void app.register(publicPagesRoutes);
  void app.register(notificationsRoutes);
  void app.register(monetizationRoutes);
  void app.register(growthRoutes);

  return app;
}
