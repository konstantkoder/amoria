import "@fastify/multipart";
import type { MultipartFile } from "@fastify/multipart";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { MAX_AVATAR_INPUT_BYTES, MAX_MEDIA_UPLOAD_BYTES } from "../config/constants";
import { AppError, unauthorized, validationError } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { isMultipartFileTooLarge } from "./file-guards";
import { lockedGalleryMediaRouteSchema, uploadAvatarRouteSchema } from "./media.schemas";
import * as mediaService from "./media.service";
import { uploadProfilePhotoRouteSchema } from "./uploads.schemas";
import * as uploadsService from "./uploads.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

function firstHeaderValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

type MultipartImageUpload = {
  file?: MultipartFile;
  crop?: unknown;
  visibility?: "public" | "locked";
};

async function readMultipartImageUpload(
  request: FastifyRequest,
  fileFieldName: string,
  maxFileSize: number,
): Promise<MultipartImageUpload> {
  let file: MultipartFile | undefined;
  let crop: unknown;
  let visibility: "public" | "locked" | undefined;

  for await (const part of request.parts({
    limits: {
      fileSize: maxFileSize,
      files: 1,
      fields: 4,
    },
  })) {
    if (part.type === "file") {
      const buffer = await readMultipartFileBuffer(part, maxFileSize);
      if (part.fieldname !== fileFieldName || file) {
        continue;
      }
      file = {
        ...part,
        toBuffer: async () => buffer,
      } as MultipartFile;
      continue;
    }

    if (part.fieldname === "crop") {
      crop = part.value;
    }
    if (part.fieldname === "visibility") {
      if (part.value !== "public" && part.value !== "locked") {
        throw validationError("Profile photo visibility is invalid", { visibility: "invalid" });
      }
      visibility = part.value;
    }
  }

  return { file, crop, visibility };
}

async function readMultipartFileBuffer(part: MultipartFile, maxFileSize: number): Promise<Buffer> {
  try {
    return await part.toBuffer();
  } catch (error) {
    if (isMultipartFileTooLarge(error)) {
      throw new AppError("file_too_large", "Uploaded image file is too large", 413, {
        file: maxFileSize === MAX_AVATAR_INPUT_BYTES ? "avatar_too_large" : "too_large",
      });
    }

    throw error;
  }
}

export async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { mediaId: string } }>(
    "/public/:mediaId",
    async (request, reply) => {
      const media = await mediaService.getPublicMedia(request.params.mediaId);
      return reply
        .header("content-type", media.contentType)
        .header("cache-control", "public, max-age=0, must-revalidate")
        .send(media.body);
    },
  );

  fastify.get<{ Params: { mediaId: string } }>(
    "/locked/:mediaId",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(lockedGalleryMediaRouteSchema),
    },
    async (request, reply) => {
      const media = await mediaService.getLockedGalleryMedia(
        currentUserId(request),
        request.params.mediaId,
        firstHeaderValue(request.headers["x-amoria-locked-gallery-token"]),
      );
      return reply
        .header("content-type", media.contentType)
        .header("cache-control", "private, no-store")
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
      const upload = await readMultipartImageUpload(request, "avatar", MAX_AVATAR_INPUT_BYTES);
      return mediaService.uploadAvatar(currentUserId(request), upload.file, upload.crop);
    },
  );

  fastify.post(
    "/profile-photo",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(uploadProfilePhotoRouteSchema),
    },
    async (request) => {
      const upload = await readMultipartImageUpload(request, "file", MAX_MEDIA_UPLOAD_BYTES);
      return uploadsService.uploadProfilePhoto(
        currentUserId(request),
        upload.file,
        upload.crop,
        upload.visibility ?? "public",
      );
    },
  );
}
