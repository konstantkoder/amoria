import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { withErrorResponses } from "../common/http";
import { verifyAccessToken } from "../auth/jwt";
import {
  createClientErrorReportRouteSchema,
  parseClientErrorReportBody,
} from "./client-errors.schemas";
import * as clientErrorsService from "./client-errors.service";

async function optionalAuthMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header) {
    return;
  }

  if (!header.startsWith("Bearer ")) {
    verifyAccessToken("");
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    verifyAccessToken("");
    return;
  }

  const payload = verifyAccessToken(token);
  request.auth = {
    userId: payload.sub,
  };
}

export async function clientErrorsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/error-reports",
    {
      preHandler: optionalAuthMiddleware,
      schema: withErrorResponses(createClientErrorReportRouteSchema),
    },
    async (request, reply) => {
      const response = await clientErrorsService.createClientErrorReport(
        parseClientErrorReportBody(request.body),
        { userId: request.auth?.userId },
      );

      return reply.status(201).send(response);
    },
  );
}
