import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError, forbidden, unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { env } from "../config/env";
import { REFRESH_TOKEN_EXPIRES_MS } from "../auth/auth.service";
import type { AuthRequestContext, LoginBody } from "../auth/auth.types";
import { adminAuthMiddleware } from "./admin-auth.middleware";
import { requireAdmin } from "./admin.guard";
import { requireAdminNetworkAccess } from "./admin-network.guard";
import { requireRecentStepUp, ADMIN_STEP_UP_COOKIE_NAME } from "./admin-step-up.guard";
import type { AdminContext, AdminRequestContext } from "./admin.types";
import {
  beginAdminLogin,
  completeAdminMfa,
  createAdminStepUp,
  logoutAdminSession,
  refreshAdminSession,
  regenerateOwnRecoveryCodes,
  resetAdminMfa,
  type AdminAccessSessionResponse,
} from "./admin-session.service";

export const ADMIN_SESSION_HEADER = "x-amoria-admin-session";
export const ADMIN_REFRESH_COOKIE_NAME = "amoria_admin_refresh";
export const ADMIN_PRE_AUTH_COOKIE_NAME = "amoria_admin_pre_auth";
export const ADMIN_REFRESH_COOKIE_PATH = "/admin/session";
export const ADMIN_STEP_UP_COOKIE_PATH = "/admin";

const accessSessionProperties = {
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
} as const;

const accessSessionSchema = {
  type: "object",
  required: ["accessToken", "accessTokenExpiresAt", "user"],
  additionalProperties: false,
  properties: accessSessionProperties,
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
  response: {
    200: {
      oneOf: [
        {
          type: "object", required: ["state"], additionalProperties: false,
          properties: { state: { type: "string", const: "mfa_required" } },
        },
        {
          type: "object", required: ["state", "enrollment"], additionalProperties: false,
          properties: {
            state: { type: "string", const: "enrollment_required" },
            enrollment: {
              type: "object", required: ["manualKey", "otpauthUri"], additionalProperties: false,
              properties: { manualKey: { type: "string" }, otpauthUri: { type: "string" } },
            },
          },
        },
      ],
    },
  },
} as const;

const mfaBodySchema = {
  type: "object",
  required: ["method", "code"],
  additionalProperties: false,
  properties: {
    method: { type: "string", enum: ["totp", "recovery"] },
    code: { type: "string", minLength: 6, maxLength: 64 },
  },
} as const;

const mfaResponseSchema = {
  type: "object",
  required: ["accessToken", "accessTokenExpiresAt", "user", "recoveryUsed", "remainingRecoveryCodes"],
  additionalProperties: false,
  properties: {
    ...accessSessionProperties,
    recoveryCodes: { type: "array", minItems: 10, maxItems: 10, items: { type: "string" } },
    recoveryUsed: { type: "boolean" },
    remainingRecoveryCodes: { type: "integer", minimum: 0, maximum: 10 },
  },
} as const;

const okSchema = {
  type: "object", required: ["ok"], additionalProperties: false,
  properties: { ok: { type: "boolean", const: true } },
} as const;

function allowedAdminSessionOrigins(): Set<string> {
  return new Set(env.CORS_ALLOWED_ORIGINS);
}

export function assertAdminSessionRequest(request: FastifyRequest): void {
  if (request.headers[ADMIN_SESSION_HEADER] !== "1") throw forbidden("Admin session request is not allowed");
  const origin = request.headers.origin;
  if (typeof origin !== "string" || !allowedAdminSessionOrigins().has(origin)) {
    throw forbidden("Admin session request is not allowed");
  }
}

function serializeCookie(input: {
  name: string;
  value: string;
  path: string;
  maxAgeSec: number;
  secure: boolean;
  now?: Date;
}): string {
  const now = input.now ?? new Date();
  return [
    `${input.name}=${encodeURIComponent(input.value)}`,
    `Path=${input.path}`,
    `Max-Age=${input.maxAgeSec}`,
    `Expires=${new Date(now.getTime() + input.maxAgeSec * 1000).toUTCString()}`,
    "HttpOnly",
    "SameSite=Strict",
    ...(input.secure ? ["Secure"] : []),
  ].join("; ");
}

function serializeClearedCookie(name: string, path: string, secure: boolean): string {
  return [
    `${name}=`, `Path=${path}`, "Max-Age=0", "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
    "HttpOnly", "SameSite=Strict", ...(secure ? ["Secure"] : []),
  ].join("; ");
}

export function serializeAdminRefreshCookie(refreshToken: string, input: { secure: boolean; now?: Date }): string {
  return serializeCookie({
    name: ADMIN_REFRESH_COOKIE_NAME,
    value: refreshToken,
    path: ADMIN_REFRESH_COOKIE_PATH,
    maxAgeSec: Math.floor(REFRESH_TOKEN_EXPIRES_MS / 1000),
    secure: input.secure,
    now: input.now,
  });
}

export function serializeClearedAdminRefreshCookie(input: { secure: boolean }): string {
  return serializeClearedCookie(ADMIN_REFRESH_COOKIE_NAME, ADMIN_REFRESH_COOKIE_PATH, input.secure);
}

function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const entry of cookieHeader.split(";")) {
    const separator = entry.indexOf("=");
    if (separator < 0 || entry.slice(0, separator).trim() !== name) continue;
    try {
      const value = decodeURIComponent(entry.slice(separator + 1).trim());
      return /^[A-Za-z0-9_-]{32,256}$/u.test(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function readAdminRefreshCookie(cookieHeader: string | undefined): string | undefined {
  return readCookie(cookieHeader, ADMIN_REFRESH_COOKIE_NAME);
}

function requestContext(request: FastifyRequest): AuthRequestContext & AdminRequestContext {
  const first = (value: string | string[] | undefined) => {
    const selected = Array.isArray(value) ? value[0] : value;
    return selected?.trim() || undefined;
  };
  return {
    deviceId: first(request.headers["x-device-id"]),
    userAgent: first(request.headers["user-agent"]),
    ip: request.ip,
    ipAddress: request.ip,
    requestId: request.id,
  };
}

function currentAdmin(request: FastifyRequest): AdminContext {
  if (!request.admin) throw unauthorized();
  return request.admin;
}

function setCookies(reply: FastifyReply, cookies: string[]): void {
  void reply.header("set-cookie", cookies);
  void reply.header("cache-control", "no-store");
  void reply.header("pragma", "no-cache");
}

function missingRefreshCookie(): AppError {
  return new AppError("invalid_refresh", "Invalid Admin refresh token", 401);
}

export async function adminSessionRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("onRequest", requireAdminNetworkAccess);
  fastify.addHook("preHandler", async (request) => assertAdminSessionRequest(request));
  fastify.addHook("onSend", async (_request, reply, payload) => {
    void reply.header("cache-control", "no-store");
    return payload;
  });

  fastify.post<{ Body: LoginBody }>(
    "/login",
    { schema: withErrorResponses(loginSchema) },
    async (request, reply) => {
      const cleared = [
        serializeClearedAdminRefreshCookie({ secure: env.isProduction }),
        serializeClearedCookie(ADMIN_STEP_UP_COOKIE_NAME, ADMIN_STEP_UP_COOKIE_PATH, env.isProduction),
      ];
      try {
        const result = await beginAdminLogin(request.body, requestContext(request));
        setCookies(reply, [
          ...cleared,
          serializeCookie({
            name: ADMIN_PRE_AUTH_COOKIE_NAME,
            value: result.preAuthToken,
            path: ADMIN_REFRESH_COOKIE_PATH,
            maxAgeSec: env.ADMIN_PRE_AUTH_TTL_SEC,
            secure: env.isProduction,
          }),
        ]);
        return result.response;
      } catch (error) {
        setCookies(reply, [
          ...cleared,
          serializeClearedCookie(ADMIN_PRE_AUTH_COOKIE_NAME, ADMIN_REFRESH_COOKIE_PATH, env.isProduction),
        ]);
        throw error;
      }
    },
  );

  async function verifyMfa(
    request: FastifyRequest<{ Body: { method: "totp" | "recovery"; code: string } }>,
    reply: FastifyReply,
    enrollmentOnly: boolean,
  ) {
    const preAuthToken = readCookie(request.headers.cookie, ADMIN_PRE_AUTH_COOKIE_NAME);
    if (!preAuthToken) throw new AppError("admin_pre_auth_required", "Admin verification is required", 401);
    if (enrollmentOnly && request.body.method !== "totp") throw new AppError("invalid_admin_mfa", "Admin verification failed", 401);
    try {
      const result = await completeAdminMfa(
        { preAuthToken, method: request.body.method, code: request.body.code },
        requestContext(request),
      );
      setCookies(reply, [
        serializeAdminRefreshCookie(result.refreshToken, { secure: env.isProduction }),
        serializeClearedCookie(ADMIN_PRE_AUTH_COOKIE_NAME, ADMIN_REFRESH_COOKIE_PATH, env.isProduction),
        serializeClearedCookie(ADMIN_STEP_UP_COOKIE_NAME, ADMIN_STEP_UP_COOKIE_PATH, env.isProduction),
      ]);
      return result.response;
    } catch (error) {
      if (error instanceof AppError && ["admin_pre_auth_expired", "admin_mfa_attempts_exceeded"].includes(error.code)) {
        setCookies(reply, [serializeClearedCookie(ADMIN_PRE_AUTH_COOKIE_NAME, ADMIN_REFRESH_COOKIE_PATH, env.isProduction)]);
      }
      throw error;
    }
  }

  fastify.post<{ Body: { method: "totp" | "recovery"; code: string } }>(
    "/mfa/verify",
    { schema: withErrorResponses({ body: mfaBodySchema, response: { 200: mfaResponseSchema } }) },
    async (request, reply) => verifyMfa(request, reply, false),
  );

  fastify.post<{ Body: { method: "totp" | "recovery"; code: string } }>(
    "/mfa/enroll/confirm",
    { schema: withErrorResponses({ body: mfaBodySchema, response: { 200: mfaResponseSchema } }) },
    async (request, reply) => verifyMfa(request, reply, true),
  );

  fastify.post(
    "/refresh",
    { schema: withErrorResponses({ response: { 200: accessSessionSchema } }) },
    async (request, reply): Promise<AdminAccessSessionResponse> => {
      const refreshToken = readAdminRefreshCookie(request.headers.cookie);
      if (!refreshToken) {
        setCookies(reply, [serializeClearedAdminRefreshCookie({ secure: env.isProduction })]);
        throw missingRefreshCookie();
      }
      try {
        const session = await refreshAdminSession(refreshToken, requestContext(request));
        setCookies(reply, [serializeAdminRefreshCookie(session.refreshToken, { secure: env.isProduction })]);
        return session.response;
      } catch (error) {
        setCookies(reply, [serializeClearedAdminRefreshCookie({ secure: env.isProduction })]);
        throw error;
      }
    },
  );

  fastify.post(
    "/logout",
    { schema: withErrorResponses({ response: { 200: okSchema } }) },
    async (request, reply) => {
      const refreshToken = readAdminRefreshCookie(request.headers.cookie);
      try {
        return await logoutAdminSession(refreshToken);
      } finally {
        setCookies(reply, [
          serializeClearedAdminRefreshCookie({ secure: env.isProduction }),
          serializeClearedCookie(ADMIN_PRE_AUTH_COOKIE_NAME, ADMIN_REFRESH_COOKIE_PATH, env.isProduction),
          serializeClearedCookie(ADMIN_STEP_UP_COOKIE_NAME, ADMIN_STEP_UP_COOKIE_PATH, env.isProduction),
        ]);
      }
    },
  );

  fastify.post<{ Body: { code: string } }>(
    "/step-up",
    {
      preHandler: [adminAuthMiddleware, requireAdmin()],
      schema: withErrorResponses({
        body: {
          type: "object", required: ["code"], additionalProperties: false,
          properties: { code: { type: "string", pattern: "^[0-9]{6}$" } },
        },
        response: {
          200: {
            type: "object", required: ["ok", "expiresAt"], additionalProperties: false,
            properties: { ok: { type: "boolean", const: true }, expiresAt: { type: "string", format: "date-time" } },
          },
        },
      }),
    },
    async (request, reply) => {
      const result = await createAdminStepUp(currentAdmin(request), request.body.code, requestContext(request));
      setCookies(reply, [serializeCookie({
        name: ADMIN_STEP_UP_COOKIE_NAME,
        value: result.stepUpToken,
        path: ADMIN_STEP_UP_COOKIE_PATH,
        maxAgeSec: env.ADMIN_STEP_UP_TTL_SEC,
        secure: env.isProduction,
      })]);
      return { ok: true, expiresAt: result.expiresAt.toISOString() };
    },
  );

  fastify.post(
    "/recovery-codes/regenerate",
    {
      preHandler: [adminAuthMiddleware, requireAdmin(), requireRecentStepUp],
      schema: withErrorResponses({
        response: {
          200: {
            type: "object", required: ["recoveryCodes"], additionalProperties: false,
            properties: { recoveryCodes: { type: "array", minItems: 10, maxItems: 10, items: { type: "string" } } },
          },
        },
      }),
    },
    async (request) => regenerateOwnRecoveryCodes(currentAdmin(request), requestContext(request)),
  );

  fastify.post<{ Body: { reason: string } }>(
    "/mfa/reset",
    {
      preHandler: [adminAuthMiddleware, requireAdmin(), requireRecentStepUp],
      schema: withErrorResponses({
        body: {
          type: "object", required: ["reason"], additionalProperties: false,
          properties: { reason: { type: "string", minLength: 3, maxLength: 500 } },
        },
        response: { 200: okSchema },
      }),
    },
    async (request, reply) => {
      const admin = currentAdmin(request);
      const result = await resetAdminMfa({
        actor: admin,
        targetAdminUserId: admin.adminUser.id,
        reason: request.body.reason.trim(),
        context: requestContext(request),
      });
      setCookies(reply, [
        serializeClearedAdminRefreshCookie({ secure: env.isProduction }),
        serializeClearedCookie(ADMIN_STEP_UP_COOKIE_NAME, ADMIN_STEP_UP_COOKIE_PATH, env.isProduction),
      ]);
      return result;
    },
  );
}
