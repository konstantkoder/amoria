import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  MAX_MEDIA_UPLOAD_BYTES,
  MEDIA_UPLOAD_MIME_TYPES,
  MEDIA_UPLOAD_PURPOSES,
} from "../config/constants";

const checksumSha256Pattern = /^[a-fA-F0-9]{64}$/;

export const prepareUploadBodySchema = z
  .object({
    purpose: z.enum(MEDIA_UPLOAD_PURPOSES),
    mimeType: z.enum(MEDIA_UPLOAD_MIME_TYPES),
    sizeBytes: z.number().int().positive().max(MAX_MEDIA_UPLOAD_BYTES),
    checksumSha256: z.string().regex(checksumSha256Pattern).optional(),
  })
  .strict();

export const completeUploadBodySchema = z
  .object({
    sizeBytes: z.number().int().positive().max(MAX_MEDIA_UPLOAD_BYTES),
    checksumSha256: z.string().regex(checksumSha256Pattern).optional(),
  })
  .strict();

export type PrepareUploadBody = z.infer<typeof prepareUploadBodySchema>;
export type CompleteUploadBody = z.infer<typeof completeUploadBodySchema>;
export type MediaUploadPurpose = (typeof MEDIA_UPLOAD_PURPOSES)[number];
export type MediaUploadMimeType = (typeof MEDIA_UPLOAD_MIME_TYPES)[number];

export function parsePrepareUploadBody(input: unknown): PrepareUploadBody {
  return parseWithValidation(prepareUploadBodySchema, input);
}

export function parseCompleteUploadBody(input: unknown): CompleteUploadBody {
  return parseWithValidation(completeUploadBodySchema, input);
}

const mediaResponseSchema = {
  type: "object",
  required: ["id", "url", "mimeType", "sizeBytes", "purpose"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    url: { type: "string", format: "uri" },
    mimeType: { type: "string", enum: MEDIA_UPLOAD_MIME_TYPES },
    sizeBytes: { type: "integer", minimum: 1, maximum: MAX_MEDIA_UPLOAD_BYTES },
    purpose: { type: "string", enum: MEDIA_UPLOAD_PURPOSES },
  },
} as const;

export const uploadProfilePhotoRouteSchema = {
  consumes: ["multipart/form-data"],
  response: {
    200: {
      type: "object",
      required: ["media"],
      additionalProperties: false,
      properties: {
        media: mediaResponseSchema,
      },
    },
  },
} as const;

export const prepareUploadRouteSchema = {
  body: {
    type: "object",
    required: ["purpose", "mimeType", "sizeBytes"],
    additionalProperties: false,
    properties: {
      purpose: { type: "string", enum: MEDIA_UPLOAD_PURPOSES },
      mimeType: { type: "string", enum: MEDIA_UPLOAD_MIME_TYPES },
      sizeBytes: { type: "integer", minimum: 1, maximum: MAX_MEDIA_UPLOAD_BYTES },
      checksumSha256: {
        type: "string",
        pattern: checksumSha256Pattern.source,
      },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["uploadId", "method", "uploadUrl", "headers", "expiresAt"],
      additionalProperties: false,
      properties: {
        uploadId: { type: "string", format: "uuid" },
        method: { type: "string", enum: ["PUT"] },
        uploadUrl: { type: "string", format: "uri" },
        headers: {
          type: "object",
          required: ["content-type"],
          additionalProperties: false,
          properties: {
            "content-type": { type: "string", enum: MEDIA_UPLOAD_MIME_TYPES },
          },
        },
        expiresAt: { type: "string", format: "date-time" },
      },
    },
  },
} as const satisfies FastifySchema;

export const completeUploadRouteSchema = {
  params: {
    type: "object",
    required: ["uploadId"],
    additionalProperties: false,
    properties: {
      uploadId: { type: "string", format: "uuid" },
    },
  },
  body: {
    type: "object",
    required: ["sizeBytes"],
    additionalProperties: false,
    properties: {
      sizeBytes: { type: "integer", minimum: 1, maximum: MAX_MEDIA_UPLOAD_BYTES },
      checksumSha256: {
        type: "string",
        pattern: checksumSha256Pattern.source,
      },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["media"],
      additionalProperties: false,
      properties: {
        media: mediaResponseSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const deleteMediaRouteSchema = {
  params: {
    type: "object",
    required: ["mediaId"],
    additionalProperties: false,
    properties: {
      mediaId: { type: "string", format: "uuid" },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean" },
      },
    },
  },
} as const satisfies FastifySchema;

function parseWithValidation<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (parsed.success) {
    return parsed.data;
  }

  const details: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    details[issue.path.join(".") || "body"] = issue.message;
  }

  throw validationError("Request validation failed", details);
}
