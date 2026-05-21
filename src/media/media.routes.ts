import "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { MAX_AVATAR_INPUT_BYTES, MAX_MEDIA_UPLOAD_BYTES } from "../config/constants";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { uploadAvatarRouteSchema } from "./media.schemas";
import * as mediaService from "./media.service";
import { uploadProfilePhotoRouteSchema } from "./uploads.schemas";
import * as uploadsService from "./uploads.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { mediaId: string } }>(
    "/public/:mediaId",
    async (request, reply) => {
      const media = await mediaService.getPublicMedia(request.params.mediaId);
      return reply
        .header("content-type", media.contentType)
        .header("cache-control", "public, max-age=31536000, immutable")
        .send(media.body);
    },
  );

  fastify.post(
    "/avatar",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(uploadAvatarRouteSchema),
    },
    async (request) => {
      const file = await request.file({
        limits: {
          fileSize: MAX_AVATAR_INPUT_BYTES,
          files: 1,
        },
      });

      return mediaService.uploadAvatar(currentUserId(request), file);
    },
  );

  fastify.post(
    "/profile-photo",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(uploadProfilePhotoRouteSchema),
    },
    async (request) => {
      const file = await request.file({
        limits: {
          fileSize: MAX_MEDIA_UPLOAD_BYTES,
          files: 1,
        },
      });

      return uploadsService.uploadProfilePhoto(currentUserId(request), file);
    },
  );
}
