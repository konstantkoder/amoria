import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError, forbidden } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { env } from "../config/env";
import { REFRESH_TOKEN_EXPIRES_MS } from "../auth/auth.service";
import type { AuthRequestContext, LoginBody } from "../auth/auth.types";
import {
  loginAdminSession,
  logoutAdminSession,
  refreshAdminSession,
  type AdminAccessSessionResponse,
} from "./admin-session.service";

export const ADMIN_SESSION_HEADER = "x-amoria-admin-session";
export const ADMIN_REFRESH_COOKIE_NAME = "amoria_admin_refresh";
export const ADMIN_REFRESH_COOKIE_PATH = "/admin/session";

const accessSessionSchema = {
  type: "object",
  required: ["accessToken", "accessTokenExpiresAt", "user"],
  additionalProperties: false,
  properties: {
    accessToken: { type: "string" },
    accessTokenExpiresAt: { type: "string", format: "date-time" },
    user: {
      type: "object",
      required: ["id", "email", "displayName", "amoriaId", "avatarUrl"],
      additionalProperties: false,
      properties: {
        id: { type: "string", format: "uuid" },
        email: { type: "string", format: "email" },
        displayName: { type: "string" },
        amoriaId: { type: "string" },
        avatarUrl: { type: ["string", "null"] },
      },
    },
  },
} as const;

const loginSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email", maxLength: 320 },
      password: { type: "string", minLength: 1, maxLength: 1024 },
    },
  },
  response: { 200: accessSessionSchema },
} as const;

const refreshSchema = { response: { 200: accessSessionSchema } } as const;
const logoutSchema = {
  response: {
    200: {
      type: "object",
      required: ["ok"],
      additionalProperties: false,
      properties: { ok: { type: "boolean", const: true } },
    },
  },
} as const;

function allowedAdminSessionOrigins(): Set<string> {
  const allowed = new Set(env.CORS_ALLOWED_ORIGINS);
  allowed.add(new URL(env.PUBLIC_API_URL).origin);
  return allowed;
}

export function assertAdminSessionRequest(request: FastifyRequest): void {
  if (request.headers[ADMIN_SESSION_HEADER] !== "1") {
    throw forbidden("Admin session request is not allowed");
  }
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !allowedAdminSessionOrigins().has(origin)) {
    throw forbidden("Admin session request is not allowed");
  }
}

function encodeCookieValue(value: string): string {
  return encodeURIComponent(value);
}

export function serializeAdminRefreshCookie(
  refreshToken: string,
  input: { secure: boolean; now?: Date },
): string {
  const now = input.now ?? new Date();
  const expires = new Date(now.getTime() + REFRESH_TOKEN_EXPIRES_MS);
  return [
    `${ADMIN_REFRESH_COOKIE_NAME}=${encodeCookieValue(refreshToken)}`,
    `Path=${ADMIN_REFRESH_COOKIE_PATH}`,
    `Max-Age=${Math.floor(REFRESH_TOKEN_EXPIRES_MS / 1000)}`,
    `Expires=${expires.toUTCString()}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(input.secure ? ["Secure"] : []),
  ].join("; ");
}

export function serializeClearedAdminRefreshCookie(input: { secure: boolean }): string {
  return [
    `${ADMIN_REFRESH_COOKIE_NAME}=`,
    `Path=${ADMIN_REFRESH_COOKIE_PATH}`,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly",
    "SameSite=Strict",
    ...(input.secure ? ["Secure"] : []),
  ].join("; ");
}

export function readAdminRefreshCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== ADMIN_REFRESH_COOKIE_NAME) continue;
    try {
      const value = decodeURIComponent(entry.slice(separator + 1).trim());
      return /^[A-Za-z0-9_-]{32,256}$/.test(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function requestContext(request: FastifyRequest): AuthRequestContext {
  const first = (value: string | string[] | undefined) => {
    const selected = Array.isArray(value) ? value[0] : value;
    return selected?.trim() || undefined;
  };
  return {
    deviceId: first(request.headers["x-device-id"]),
    userAgent: first(request.headers["user-agent"]),
    ip: request.ip,
  };
}

function setRefreshCookie(reply: FastifyReply, refreshToken: string): void {
  void reply.header("set-cookie", serializeAdminRefreshCookie(refreshToken, { secure: env.isProduction }));
  void reply.header("cache-control", "no-store");
}

function clearRefreshCookie(reply: FastifyReply): void {
  void reply.header("set-cookie", serializeClearedAdminRefreshCookie({ secure: env.isProduction }));
  void reply.header("cache-control", "no-store");
}

function missingRefreshCookie(): AppError {
  return new AppError("invalid_refresh", "Invalid refresh token", 401);
}

export async function adminSessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("preHandler", async (request) => assertAdminSessionRequest(request));

  fastify.post<{ Body: LoginBody }>(
    "/login",
    { schema: withErrorResponses(loginSchema) },
    async (request, reply): Promise<AdminAccessSessionResponse> => {
      try {
        const session = await loginAdminSession(request.body, requestContext(request));
        setRefreshCookie(reply, session.refreshToken);
        return session.response;
      } catch (error) {
        clearRefreshCookie(reply);
        throw error;
      }
    },
  );

  fastify.post(
    "/refresh",
    { schema: withErrorResponses(refreshSchema) },
    async (request, reply): Promise<AdminAccessSessionResponse> => {
      const refreshToken = readAdminRefreshCookie(request.headers.cookie);
      if (!refreshToken) {
        clearRefreshCookie(reply);
        throw missingRefreshCookie();
      }
      try {
        const session = await refreshAdminSession(refreshToken, requestContext(request));
        setRefreshCookie(reply, session.refreshToken);
        return session.response;
      } catch (error) {
        clearRefreshCookie(reply);
        throw error;
      }
    },
  );

  fastify.post(
    "/logout",
    { schema: withErrorResponses(logoutSchema) },
    async (request, reply) => {
      const refreshToken = readAdminRefreshCookie(request.headers.cookie);
      try {
        return await logoutAdminSession(refreshToken);
      } finally {
        clearRefreshCookie(reply);
      }
    },
  );
}
