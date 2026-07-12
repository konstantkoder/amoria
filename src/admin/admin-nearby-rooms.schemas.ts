import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import { NEARBY_ACTIVITY_KEYS } from "../config/constants";
import type {
  AdminCreateNearbyRoomBody,
  AdminCreateNearbyRoomTypeBody,
  AdminCreateNearbyRoomFromDemandBody,
  AdminNearbyRoomActionBody,
  AdminNearbyRoomsQuery,
} from "../nearby/nearby-rooms.types";

const createNearbyRoomTypeBodySchema = z
  .object({
    key: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:_[a-z0-9]+)*$/),
    title: z.string().trim().min(1).max(80),
  })
  .strict();

const nearbyRoomActionValues = ["close", "disable", "reopen", "archive", "delete"] as const;
const isoDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

const scheduledNearbyRoomBodyShape = {
  title: z.string().trim().min(1).max(80).optional(),
  description: z.string().trim().min(1).max(500).optional(),
  locationLabel: z.string().trim().min(1).max(120).optional(),
  startsAt: isoDateTimeStringSchema().optional(),
  endsAt: isoDateTimeStringSchema().optional(),
  expiresAt: isoDateTimeStringSchema().optional(),
};

const createNearbyRoomBodySchema = z
  .object({
    typeKey: z.string().trim().min(1).max(120),
    geoBucket: z.string().trim().min(1).max(200),
    ...scheduledNearbyRoomBodyShape,
  })
  .strict()
  .superRefine(validateScheduledNearbyRoomDateOrder);

const createNearbyRoomFromDemandBodySchema = z
  .object({
    activityKey: z.enum(NEARBY_ACTIVITY_KEYS),
    geoBucket: z.string().trim().min(1).max(200),
    ...scheduledNearbyRoomBodyShape,
  })
  .strict()
  .superRefine(validateScheduledNearbyRoomDateOrder);

const nearbyRoomActionBodySchema = z
  .object({
    action: z.enum(nearbyRoomActionValues),
  })
  .strict();

const adminNearbyRoomsQuerySchema = z
  .object({
    includeArchived: z.preprocess(parseOptionalBooleanLike, z.boolean()).default(false),
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

const adminNearbyRoomDemandSnapshotSchema = {
  type: ["object", "null"],
  required: [
    "activityKey",
    "geoBucket",
    "interestedUsersCount",
    "activeNearbyUsersCount",
    "recentlyUpdatedUsersCount",
    "capturedAt",
  ],
  additionalProperties: false,
  properties: {
    activityKey: { type: "string" },
    geoBucket: { type: "string" },
    interestedUsersCount: { type: "integer", minimum: 0 },
    activeNearbyUsersCount: { type: "integer", minimum: 0 },
    recentlyUpdatedUsersCount: { type: "integer", minimum: 0 },
    capturedAt: { type: "string", format: "date-time" },
  },
} as const;

const adminNearbyRoomSchema = {
  type: "object",
  required: [
    "id",
    "typeKey",
    "title",
    "description",
    "locationLabel",
    "startsAt",
    "endsAt",
    "expiresAt",
    "createdFromDemandSnapshot",
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
    title: { type: ["string", "null"] },
    description: { type: ["string", "null"] },
    locationLabel: { type: ["string", "null"] },
    startsAt: { type: ["string", "null"], format: "date-time" },
    endsAt: { type: ["string", "null"], format: "date-time" },
    expiresAt: { type: ["string", "null"], format: "date-time" },
    createdFromDemandSnapshot: adminNearbyRoomDemandSnapshotSchema,
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
    ...scheduledNearbyRoomBodyJsonSchemaProperties(),
  },
} as const;

const createNearbyRoomTypeBodyJsonSchema = {
  type: "object",
  required: ["key", "title"],
  additionalProperties: false,
  properties: {
    key: { type: "string", minLength: 3, maxLength: 120, pattern: "^[a-z0-9]+(?:_[a-z0-9]+)*$" },
    title: { type: "string", minLength: 1, maxLength: 80 },
  },
} as const;

const createNearbyRoomFromDemandBodyJsonSchema = {
  type: "object",
  required: ["activityKey", "geoBucket"],
  additionalProperties: false,
  properties: {
    activityKey: { type: "string", enum: NEARBY_ACTIVITY_KEYS },
    geoBucket: { type: "string", minLength: 1, maxLength: 200 },
    ...scheduledNearbyRoomBodyJsonSchemaProperties(),
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

const adminNearbyRoomsQueryJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    includeArchived: {
      anyOf: [
        { type: "boolean" },
        { type: "string", enum: ["true", "false", "1", "0", ""] },
      ],
    },
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

export function parseAdminCreateNearbyRoomTypeBody(
  input: unknown,
): AdminCreateNearbyRoomTypeBody {
  return parseWithValidation(createNearbyRoomTypeBodySchema, input);
}

export function parseAdminCreateNearbyRoomFromDemandBody(
  input: unknown,
): AdminCreateNearbyRoomFromDemandBody {
  return parseWithValidation(createNearbyRoomFromDemandBodySchema, input);
}

export function parseAdminNearbyRoomActionBody(input: unknown): AdminNearbyRoomActionBody {
  return parseWithValidation(nearbyRoomActionBodySchema, input);
}

export function parseAdminNearbyRoomsQuery(input: unknown): AdminNearbyRoomsQuery {
  return parseWithValidation(adminNearbyRoomsQuerySchema, input);
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

export const adminCreateNearbyRoomTypeRouteSchema = {
  body: createNearbyRoomTypeBodyJsonSchema,
  response: {
    201: {
      type: "object",
      required: ["roomType"],
      additionalProperties: false,
      properties: { roomType: adminNearbyRoomTypeSchema },
    },
  },
} as const satisfies FastifySchema;

export const adminNearbyRoomsRouteSchema = {
  querystring: adminNearbyRoomsQueryJsonSchema,
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

export const adminCreateNearbyRoomFromDemandRouteSchema = {
  body: createNearbyRoomFromDemandBodyJsonSchema,
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

function isoDateTimeStringSchema() {
  return z
    .string()
    .trim()
    .refine(
      (value) => isoDateTimePattern.test(value) && !Number.isNaN(Date.parse(value)),
      "Invalid date-time",
    );
}

function validateScheduledNearbyRoomDateOrder(
  input: { startsAt?: string; endsAt?: string },
  context: z.RefinementCtx,
): void {
  if (!input.endsAt) {
    return;
  }

  if (!input.startsAt) {
    context.addIssue({
      code: "custom",
      message: "startsAt is required when endsAt is provided",
      path: ["startsAt"],
    });
    return;
  }

  const startsAt = new Date(input.startsAt);
  const endsAt = new Date(input.endsAt);
  if (
    !Number.isNaN(startsAt.getTime()) &&
    !Number.isNaN(endsAt.getTime()) &&
    endsAt <= startsAt
  ) {
    context.addIssue({
      code: "custom",
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    });
  }
}

function scheduledNearbyRoomBodyJsonSchemaProperties() {
  return {
    title: { type: "string", minLength: 1, maxLength: 80 },
    description: { type: "string", minLength: 1, maxLength: 500 },
    locationLabel: { type: "string", minLength: 1, maxLength: 120 },
    startsAt: { type: "string", format: "date-time" },
    endsAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
  } as const;
}

function parseOptionalBooleanLike(value: unknown): boolean | unknown {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (value === true || value === "true" || value === "1") {
    return true;
  }

  if (value === false || value === "false" || value === "0") {
    return false;
  }

  return value;
}
