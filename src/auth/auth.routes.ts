import type { FastifyInstance, FastifyRequest } from "fastify";
import { withErrorResponses } from "../common/http";
import { AppError, unauthorized } from "../common/errors";
import { authMiddleware } from "../common/security/auth-middleware";
import { env } from "../config/env";
import type {
  AuthRequestContext,
  EmailCodeBody,
  LoginBody,
  LogoutBody,
  PasswordResetConfirmBody,
  PasswordResetRequestBody,
  RefreshBody,
  RegisterBody,
  ResendVerificationBody,
  OkResponse,
  ResendVerificationResponse,
} from "./auth.types";
import {
  loginRouteSchema,
  logoutAllRouteSchema,
  logoutRouteSchema,
  refreshRouteSchema,
  registerRouteSchema,
  passwordResetConfirmRouteSchema,
  passwordResetRequestRouteSchema,
  resendVerificationRouteSchema,
  verifyEmailRouteSchema,
} from "./auth.schemas";
import * as authService from "./auth.service";

type PublicAuthEmailFlow = "password_reset" | "verification_resend";
type PublicAuthEmailLogger = {
  warn(bindings: Record<string, unknown>, message: string): void;
};

const concealedPublicEmailErrors = new Set([
  "email_delivery_unavailable",
  "email_delivery_failed",
  "resend_cooldown",
]);

export async function completePublicAuthEmailRequest<T>(input: {
  flow: PublicAuthEmailFlow;
  response: T;
  operation: () => Promise<unknown>;
  logger: PublicAuthEmailLogger;
}): Promise<T> {
  try {
    await input.operation();
  } catch (error) {
    if (!(error instanceof AppError) || !concealedPublicEmailErrors.has(error.code)) throw error;
    if (error.code === "email_delivery_unavailable" || error.code === "email_delivery_failed") {
      input.logger.warn({
        event: "auth_email_delivery_failed",
        flow: input.flow,
        failureCode: error.code,
      }, "Auth email delivery failed");
    }
  }
  return input.response;
}

function firstHeaderValue(value: string | string[] | undefined): string | undefined {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized ? normalized : undefined;
}

function authRequestContext(request: FastifyRequest): AuthRequestContext {
  return {
    deviceId: firstHeaderValue(request.headers["x-device-id"]),
    userAgent: firstHeaderValue(request.headers["user-agent"]),
    ip: request.ip,
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

  fastify.post<{ Body: EmailCodeBody }>(
    "/verify-email",
    { schema: withErrorResponses(verifyEmailRouteSchema) },
    async (request) => authService.verifyEmail(request.body, authRequestContext(request)),
  );

  fastify.post<{ Body: ResendVerificationBody }>(
    "/resend-verification",
    { schema: withErrorResponses(resendVerificationRouteSchema) },
    async (request, reply) => {
      const response = await completePublicAuthEmailRequest<ResendVerificationResponse>({
        flow: "verification_resend",
        response: { ok: true, resendAfterSec: env.EMAIL_RESEND_COOLDOWN_SEC },
        operation: () => authService.resendVerification(request.body, authRequestContext(request)),
        logger: request.log,
      });
      return reply.status(200).send(response);
    },
  );

  fastify.post<{ Body: PasswordResetRequestBody }>(
    "/password-reset/request",
    { schema: withErrorResponses(passwordResetRequestRouteSchema) },
    async (request, reply) => {
      const response = await completePublicAuthEmailRequest<OkResponse>({
        flow: "password_reset",
        response: { ok: true },
        operation: () => authService.requestPasswordReset(request.body, authRequestContext(request)),
        logger: request.log,
      });
      return reply.status(200).send(response);
    },
  );

  fastify.post<{ Body: PasswordResetConfirmBody }>(
    "/password-reset/confirm",
    { schema: withErrorResponses(passwordResetConfirmRouteSchema) },
    async (request) => authService.confirmPasswordReset(request.body, authRequestContext(request)),
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
