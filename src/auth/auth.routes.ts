import type { FastifyInstance } from "fastify";
import { withErrorResponses } from "../common/http";
import type { LoginBody, RegisterBody } from "./auth.types";
import { loginRouteSchema, registerRouteSchema } from "./auth.schemas";
import * as authService from "./auth.service";

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post<{ Body: RegisterBody }>(
    "/register",
    { schema: withErrorResponses(registerRouteSchema) },
    async (request, reply) => {
      const response = await authService.register(request.body);
      return reply.status(201).send(response);
    },
  );

  fastify.post<{ Body: LoginBody }>(
    "/login",
    { schema: withErrorResponses(loginRouteSchema) },
    async (request) => authService.login(request.body),
  );
}
