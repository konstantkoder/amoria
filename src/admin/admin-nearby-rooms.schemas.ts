import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import type {
  AdminCreateNearbyRoomBody,
  AdminNearbyRoomActionBody,
} from "../nearby/nearby-rooms.types";

const nearbyRoomActionValues = ["close", "disable", "reopen"] as const;

const createNearbyRoomBodySchema = z
  .object({
    typeKey: z.string().trim().min(1).max(120),
    geoBucket: z.string().trim().min(1).max(200),
  })
  .strict();

const nearbyRoomActionBodySchema = z
  .object({
    action: z.enum(nearbyRoomActionValues),
  })
  .strict();

const adminNearbyRoomTypeSchema = {
  type: "object",
  required: ["key", "title", "status", "adminApproved", "sortOrder", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    key: { type: "string" },
    title: { type: "string" },
    status: { type: "string" },
    adminApproved: { type: "boolean" },
    sortOrder: { type: "integer" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const adminNearbyRoomSchema = {
  type: "object",
  required: [
    "id",
    "typeKey",
    "roomType",
    "status",
    "geoBucket",
    "memberCount",
    "threadId",
    "createdByAdminUserId",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    typeKey: { type: "string" },
    roomType: adminNearbyRoomTypeSchema,
    status: { type: "string" },
    geoBucket: { type: "string" },
    memberCount: { type: "integer", minimum: 0 },
    threadId: { type: ["string", "null"], format: "uuid" },
    createdByAdminUserId: { type: ["string", "null"], format: "uuid" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const roomIdParamsSchema = {
  type: "object",
  required: ["roomId"],
  additionalProperties: false,
  properties: {
    roomId: { type: "string", format: "uuid" },
  },
} as const;

const createNearbyRoomBodyJsonSchema = {
  type: "object",
  required: ["typeKey", "geoBucket"],
  additionalProperties: false,
  properties: {
    typeKey: { type: "string", minLength: 1, maxLength: 120 },
    geoBucket: { type: "string", minLength: 1, maxLength: 200 },
  },
} as const;

const nearbyRoomActionBodyJsonSchema = {
  type: "object",
  required: ["action"],
  additionalProperties: false,
  properties: {
    action: { type: "string", enum: nearbyRoomActionValues },
  },
} as const;

const adminNearbyRoomResponseSchema = {
  type: "object",
  required: ["room"],
  additionalProperties: false,
  properties: {
    room: adminNearbyRoomSchema,
  },
} as const;

export function parseAdminCreateNearbyRoomBody(input: unknown): AdminCreateNearbyRoomBody {
  return parseWithValidation(createNearbyRoomBodySchema, input);
}

export function parseAdminNearbyRoomActionBody(input: unknown): AdminNearbyRoomActionBody {
  return parseWithValidation(nearbyRoomActionBodySchema, input);
}

export const adminNearbyRoomTypesRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: adminNearbyRoomTypeSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminNearbyRoomsRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: adminNearbyRoomSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminCreateNearbyRoomRouteSchema = {
  body: createNearbyRoomBodyJsonSchema,
  response: {
    201: adminNearbyRoomResponseSchema,
  },
} as const satisfies FastifySchema;

export const adminNearbyRoomDetailRouteSchema = {
  params: roomIdParamsSchema,
  response: {
    200: adminNearbyRoomResponseSchema,
  },
} as const satisfies FastifySchema;

export const adminNearbyRoomActionRouteSchema = {
  params: roomIdParamsSchema,
  body: nearbyRoomActionBodyJsonSchema,
  response: {
    200: adminNearbyRoomResponseSchema,
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
