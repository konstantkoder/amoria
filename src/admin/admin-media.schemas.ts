import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  MEDIA_MODERATION_ACTIONS,
  MEDIA_MODERATION_STATUSES,
  type AdminMediaDecisionBody,
  type AdminMediaQuery,
} from "./admin-media.types";

const optionalString = (maxLength: number) => z.string().trim().min(1).max(maxLength).optional();

export const adminMediaQuerySchema = z
  .object({
    ownerAmoriaId: optionalString(32),
    type: optionalString(80),
    moderationStatus: z.enum(MEDIA_MODERATION_STATUSES).optional(),
    visibility: z.enum(["avatar", "public", "locked"]).optional(),
    createdFrom: z.coerce.date().optional(),
    createdTo: z.coerce.date().optional(),
    limit: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict();

export const adminMediaDetailQuerySchema = z
  .object({
    reason: optionalString(500),
  })
  .strict();

export const adminMediaDecisionBodySchema = z
  .object({
    action: z.enum(MEDIA_MODERATION_ACTIONS),
    reason: optionalString(500),
    metadata: z.unknown().optional(),
  })
  .strict();

export function parseAdminMediaQuery(input: unknown): AdminMediaQuery {
  return parseWithValidation(adminMediaQuerySchema, input);
}

export function parseAdminMediaDetailReason(input: unknown): string | undefined {
  return parseWithValidation(adminMediaDetailQuerySchema, input).reason;
}

export function parseAdminMediaDecisionBody(input: unknown): AdminMediaDecisionBody {
  return parseWithValidation(adminMediaDecisionBodySchema, input);
}

const mediaMetadataSchema = {
  anyOf: [
    { type: "object", additionalProperties: true },
    { type: "array", items: {} },
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
} as const;

const mediaOwnerSchema = {
  type: "object",
  required: ["id", "amoriaId", "displayName", "email"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    amoriaId: { type: "string" },
    displayName: { type: "string" },
    email: { type: "string", format: "email" },
  },
} as const;

const mediaReviewItemSchema = {
  type: "object",
  required: ["id", "mediaId", "ownerUserId", "adminUserId", "action", "reason", "metadata", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    mediaId: { type: "string", format: "uuid" },
    ownerUserId: { type: ["string", "null"], format: "uuid" },
    adminUserId: { type: ["string", "null"], format: "uuid" },
    action: { type: "string", enum: MEDIA_MODERATION_ACTIONS },
    reason: { type: ["string", "null"] },
    metadata: mediaMetadataSchema,
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const mediaItemSchema = {
  type: "object",
  required: [
    "id",
    "ownerUserId",
    "owner",
    "type",
    "url",
    "previewUrl",
    "publicUrl",
    "mimeType",
    "sizeBytes",
    "width",
    "height",
    "checksumSha256",
    "visibility",
    "moderationStatus",
    "moderationOrigin",
    "automatedCheckedAt",
    "automation",
    "reviewedAt",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    ownerUserId: { type: "string", format: "uuid" },
    owner: mediaOwnerSchema,
    type: { type: "string" },
    url: { type: ["string", "null"] },
    previewUrl: { type: ["string", "null"] },
    publicUrl: { type: ["string", "null"] },
    mimeType: { type: "string" },
    sizeBytes: { type: "integer" },
    width: { type: ["integer", "null"] },
    height: { type: ["integer", "null"] },
    checksumSha256: { type: ["string", "null"] },
    visibility: { type: ["string", "null"], enum: ["avatar", "public", "locked", null] },
    moderationStatus: { type: "string", enum: MEDIA_MODERATION_STATUSES },
    moderationOrigin: { type: "string" },
    automatedCheckedAt: { type: ["string", "null"], format: "date-time" },
    automation: {
      anyOf: [
        { type: "null" },
        {
          type: "object",
          additionalProperties: false,
          required: ["jobId", "status", "attemptCount", "providerEngine", "modelVersion", "policyVersion", "policyDecision", "errorCode", "rawResult", "startedAt", "completedAt"],
          properties: {
            jobId: { type: "string", format: "uuid" },
            status: { type: "string" },
            attemptCount: { type: "integer" },
            providerEngine: { type: "string" },
            modelVersion: { type: "string" },
            policyVersion: { type: "string" },
            policyDecision: { type: ["string", "null"] },
            errorCode: { type: ["string", "null"] },
            rawResult: mediaMetadataSchema,
            startedAt: { type: ["string", "null"], format: "date-time" },
            completedAt: { type: ["string", "null"], format: "date-time" },
          },
        },
      ],
    },
    reviewedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const mediaDetailSchema = {
  ...mediaItemSchema,
  required: [...mediaItemSchema.required, "reviews"],
  properties: {
    ...mediaItemSchema.properties,
    reviews: {
      type: "array",
      items: mediaReviewItemSchema,
    },
  },
} as const;

export const adminMediaListRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      ownerAmoriaId: { type: "string", minLength: 1, maxLength: 32 },
      type: { type: "string", minLength: 1, maxLength: 80 },
      moderationStatus: { type: "string", enum: MEDIA_MODERATION_STATUSES },
      visibility: { type: "string", enum: ["avatar", "public", "locked"] },
      createdFrom: { type: "string", format: "date-time" },
      createdTo: { type: "string", format: "date-time" },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: { type: "array", items: mediaItemSchema },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminMediaDetailRouteSchema = {
  params: { type: "object", required: ["mediaId"], additionalProperties: false, properties: { mediaId: { type: "string", format: "uuid" } } },
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["media"],
      additionalProperties: false,
      properties: {
        media: mediaDetailSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const adminMediaDecisionRouteSchema = {
  params: { type: "object", required: ["mediaId"], additionalProperties: false, properties: { mediaId: { type: "string", format: "uuid" } } },
  body: {
    type: "object",
    required: ["action"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: MEDIA_MODERATION_ACTIONS },
      reason: { type: "string", minLength: 1, maxLength: 500 },
      metadata: mediaMetadataSchema,
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok", "media", "review"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        media: mediaItemSchema,
        review: mediaReviewItemSchema,
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
    details[issue.path.join(".") || "request"] = issue.message;
  }

  throw validationError("Request validation failed", details);
}
