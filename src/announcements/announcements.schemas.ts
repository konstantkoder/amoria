import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import type {
  AnnouncementsQuery,
  CreateAnnouncementBody,
  RespondAnnouncementBody,
} from "./announcements.types";

export const ANNOUNCEMENT_TITLE_MAX_LENGTH = 80;
export const ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH = 2000;
const ANNOUNCEMENT_CATEGORY_MAX_LENGTH = 80;
const ANNOUNCEMENT_PLACE_LABEL_MAX_LENGTH = 120;
const announcementStatuses = ["active", "closed", "deleted", "under_review"] as const;

const uuidSchema = z.string().uuid();

export const announcementsQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(30),
  })
  .strict();

export const createAnnouncementBodySchema = z
  .object({
    title: z.string().trim().min(1).max(ANNOUNCEMENT_TITLE_MAX_LENGTH),
    description: z.string().trim().min(1).max(ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH),
    category: z.string().trim().min(1).max(ANNOUNCEMENT_CATEGORY_MAX_LENGTH),
    placeLabel: z.string().trim().min(1).max(ANNOUNCEMENT_PLACE_LABEL_MAX_LENGTH).optional(),
    photoMediaId: uuidSchema.optional(),
  })
  .strict();

export const respondAnnouncementBodySchema = z
  .object({
    openDirectChat: z.boolean().default(false),
  })
  .strict()
  .default({ openDirectChat: false });

export function parseAnnouncementsQuery(input: unknown): AnnouncementsQuery {
  return parseWithValidation(announcementsQuerySchema, input);
}

export function parseCreateAnnouncementBody(input: unknown): CreateAnnouncementBody {
  return parseWithValidation(createAnnouncementBodySchema, input);
}

export function parseRespondAnnouncementBody(input: unknown): RespondAnnouncementBody {
  return parseWithValidation(respondAnnouncementBodySchema, input);
}

const authorSchema = {
  type: "object",
  required: ["id", "displayName", "avatarUrl"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    displayName: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
  },
} as const;

const announcementDtoSchema = {
  type: "object",
  required: [
    "id",
    "status",
    "title",
    "description",
    "category",
    "placeLabel",
    "photoUrl",
    "author",
    "responseCount",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    status: { type: "string", enum: announcementStatuses },
    title: { type: "string" },
    description: { type: "string" },
    category: { type: "string" },
    placeLabel: { type: ["string", "null"] },
    photoUrl: { type: ["string", "null"] },
    author: authorSchema,
    responseCount: { type: "integer", minimum: 0 },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    isMine: { type: "boolean" },
    hasResponded: { type: "boolean" },
  },
} as const;

const idParamsSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
  },
} as const;

export const listAnnouncementsRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: announcementDtoSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const createAnnouncementRouteSchema = {
  body: {
    type: "object",
    required: ["title", "description", "category"],
    additionalProperties: false,
    properties: {
      title: { type: "string", minLength: 1, maxLength: ANNOUNCEMENT_TITLE_MAX_LENGTH },
      description: {
        type: "string",
        minLength: 1,
        maxLength: ANNOUNCEMENT_DESCRIPTION_MAX_LENGTH,
      },
      category: { type: "string", minLength: 1, maxLength: ANNOUNCEMENT_CATEGORY_MAX_LENGTH },
      placeLabel: {
        type: "string",
        minLength: 1,
        maxLength: ANNOUNCEMENT_PLACE_LABEL_MAX_LENGTH,
      },
      photoMediaId: { type: "string", format: "uuid" },
    },
  },
  response: {
    201: announcementDtoSchema,
  },
} as const satisfies FastifySchema;

export const getAnnouncementRouteSchema = {
  params: idParamsSchema,
  response: {
    200: announcementDtoSchema,
  },
} as const satisfies FastifySchema;

export const closeAnnouncementRouteSchema = {
  params: idParamsSchema,
  response: {
    200: {
      type: "object",
      required: ["ok"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
      },
    },
  },
} as const satisfies FastifySchema;

export const respondAnnouncementRouteSchema = {
  params: idParamsSchema,
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      openDirectChat: { type: "boolean", default: false },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["respondedAt"],
      additionalProperties: false,
      properties: {
        respondedAt: { type: "string", format: "date-time" },
        threadId: { type: "string", format: "uuid" },
        threadStatus: { type: "string", enum: ["created", "existing"] },
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
