import type { FastifyInstance, FastifyRequest } from "fastify";
import { withErrorResponses } from "../common/http";
import { unauthorized } from "../common/errors";
import { authMiddleware } from "../common/security/auth-middleware";
import type { AuthRequestContext, LoginBody, LogoutBody, RefreshBody, RegisterBody } from "./auth.types";
import {
  loginRouteSchema,
  logoutAllRouteSchema,
  logoutRouteSchema,
  refreshRouteSchema,
  registerRouteSchema,
} from "./auth.schemas";
import * as authService from "./auth.service";

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized ? normalized : undefined;
}

function authRequestContext(request: FastifyRequest): AuthRequestContext {
  return {
    deviceId: firstHeaderValue(request.headers["x-device-id"]),
    userAgent: firstHeaderValue(request.headers["user-agent"]),
  };
}

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }
  return request.auth.userId;
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RegisterBody }>(
    "/register",
    { schema: withErrorResponses(registerRouteSchema) },
    async (request, reply) => {
      const response = await authService.register(request.body, authRequestContext(request));
      return reply.status(201).send(response);
    },
  );

  fastify.post<{ Body: LoginBody }>(
    "/login",
    { schema: withErrorResponses(loginRouteSchema) },
    async (request) => authService.login(request.body, authRequestContext(request)),
  );

  fastify.post<{ Body: RefreshBody }>(
    "/refresh",
    { schema: withErrorResponses(refreshRouteSchema) },
    async (request) => authService.refresh(request.body, authRequestContext(request)),
  );

  fastify.post<{ Body: LogoutBody }>(
    "/logout",
    { schema: withErrorResponses(logoutRouteSchema) },
    async (request) => authService.logout(request.body),
  );

  fastify.post(
    "/logout-all",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(logoutAllRouteSchema),
    },
    async (request) => authService.logoutAll(currentUserId(request)),
  );
}
