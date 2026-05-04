import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import {
  createBlockRouteSchema,
  createSafetyReportRouteSchema,
  deleteBlockRouteSchema,
  listBlocksRouteSchema,
  parseBlockUserBody,
  parseCreateSafetyReportBody,
} from "./safety.schemas";
import * as safetyService from "./safety.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function safetyRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/blocks",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(createBlockRouteSchema),
    },
    async (request) =>
      safetyService.blockUser(currentUserId(request), parseBlockUserBody(request.body)),
  );

  fastify.delete<{ Params: { blockedUserId: string } }>(
    "/blocks/:blockedUserId",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(deleteBlockRouteSchema),
    },
    async (request) =>
      safetyService.unblockUser(currentUserId(request), request.params.blockedUserId),
  );

  fastify.get(
    "/blocks",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(listBlocksRouteSchema),
    },
    async (request) => safetyService.listBlocks(currentUserId(request)),
  );

  fastify.post(
    "/reports",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(createSafetyReportRouteSchema),
    },
    async (request) =>
      safetyService.createReport(
        currentUserId(request),
        parseCreateSafetyReportBody(request.body),
      ),
  );
}
