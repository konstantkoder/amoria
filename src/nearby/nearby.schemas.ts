import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import type { CreateNearbyStatusBody, NearbyFeedQuery } from "./nearby.types";

export const NEARBY_STATUS_TEXT_MAX_LENGTH = 300;

const coordinateSchema = z.coerce.number().finite();

export const createNearbyStatusBodySchema = z
  .object({
    text: z.string().trim().min(1).max(NEARBY_STATUS_TEXT_MAX_LENGTH),
    lat: coordinateSchema.min(-90).max(90),
    lng: coordinateSchema.min(-180).max(180),
    visibilityRadiusMeters: z.coerce.number().int().finite(),
    expiresInSec: z.coerce.number().int().finite(),
  })
  .strict();

export const nearbyFeedQuerySchema = z
  .object({
    lat: coordinateSchema.min(-90).max(90),
    lng: coordinateSchema.min(-180).max(180),
    radiusMeters: z.coerce.number().int().finite(),
    limit: z.coerce.number().int().positive().max(100).default(30),
  })
  .strict();

export function parseCreateNearbyStatusBody(input: unknown): CreateNearbyStatusBody {
  return parseWithValidation(createNearbyStatusBodySchema, input);
}

export function parseNearbyFeedQuery(input: unknown): NearbyFeedQuery {
  return parseWithValidation(nearbyFeedQuerySchema, input);
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

const createNearbyStatusDtoSchema = {
  type: "object",
  required: ["id", "text", "createdAt", "expiresAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    text: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
  },
} as const;

const nearbyFeedItemSchema = {
  type: "object",
  required: ["id", "author", "text", "distanceMeters", "createdAt", "expiresAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    author: authorSchema,
    text: { type: "string" },
    distanceMeters: { type: "integer", minimum: 0 },
    createdAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
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

const okSchema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", const: true },
  },
} as const;

export const createNearbyStatusRouteSchema = {
  body: {
    type: "object",
    required: ["text", "lat", "lng", "visibilityRadiusMeters", "expiresInSec"],
    additionalProperties: false,
    properties: {
      text: { type: "string", minLength: 1, maxLength: NEARBY_STATUS_TEXT_MAX_LENGTH },
      lat: { type: "number", minimum: -90, maximum: 90 },
      lng: { type: "number", minimum: -180, maximum: 180 },
      visibilityRadiusMeters: { type: "integer" },
      expiresInSec: { type: "integer" },
    },
  },
  response: {
    201: {
      type: "object",
      required: ["status"],
      additionalProperties: false,
      properties: {
        status: createNearbyStatusDtoSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const nearbyFeedRouteSchema = {
  querystring: {
    type: "object",
    required: ["lat", "lng", "radiusMeters"],
    additionalProperties: false,
    properties: {
      lat: { type: "number", minimum: -90, maximum: 90 },
      lng: { type: "number", minimum: -180, maximum: 180 },
      radiusMeters: { type: "integer" },
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
          items: nearbyFeedItemSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const deleteNearbyStatusRouteSchema = {
  params: idParamsSchema,
  response: {
    200: okSchema,
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
