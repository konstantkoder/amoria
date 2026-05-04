import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import {
  completeUploadRouteSchema,
  deleteMediaRouteSchema,
  parseCompleteUploadBody,
  parsePrepareUploadBody,
  prepareUploadRouteSchema,
} from "./uploads.schemas";
import * as uploadsService from "./uploads.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function mediaUploadRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    "/prepare",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(prepareUploadRouteSchema),
    },
    async (request) =>
      uploadsService.prepareUpload(currentUserId(request), parsePrepareUploadBody(request.body)),
  );

  fastify.post<{ Params: { uploadId: string } }>(
    "/:uploadId/complete",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(completeUploadRouteSchema),
    },
    async (request) =>
      uploadsService.completeUpload(
        currentUserId(request),
        request.params.uploadId,
        parseCompleteUploadBody(request.body),
      ),
  );
}

export async function mediaManagementRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.delete<{ Params: { mediaId: string } }>(
    "/:mediaId",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(deleteMediaRouteSchema),
    },
    async (request) => uploadsService.deleteMedia(currentUserId(request), request.params.mediaId),
  );
}
