import "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { MAX_AVATAR_INPUT_BYTES } from "../config/constants";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { uploadAvatarRouteSchema } from "./media.schemas";
import * as mediaService from "./media.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
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
}
