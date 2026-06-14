import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import type {
  CreateNearbyStatusBody,
  NearbyFeedQuery,
  NearbyProfileFeedQuery,
  PatchNearbyProfileStatusBody,
  UpdateNearbyVisibilityBody,
} from "./nearby.types";

export const NEARBY_STATUS_TEXT_MAX_LENGTH = 300;
export const NEARBY_PROFILE_STATUS_MAX_LENGTH = 160;
const nearbyProfileStatusKinds = [
  "coffee",
  "walk",
  "bike",
  "talk_now",
  "open_to_suggestions",
] as const;
const nearbyProfileDistanceBuckets = [
  "under_1km",
  "1_5km",
  "5_25km",
  "25_100km",
  "over_100km",
] as const;

const coordinateSchema = z.coerce.number().finite();
const radiusKmSchema = z.coerce.number().int().min(1).max(250);
const expiresInSecSchema = z.coerce.number().int().min(60).max(86400);
const nearbyProfileStatusTextSchema = z.string().trim().max(NEARBY_PROFILE_STATUS_MAX_LENGTH);

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

export const updateNearbyVisibilityBodySchema = z
  .object({
    enabled: z.boolean(),
    latitude: coordinateSchema.min(-90).max(90).optional(),
    longitude: coordinateSchema.min(-180).max(180).optional(),
    radiusKm: radiusKmSchema.optional(),
    nearbyStatus: nearbyProfileStatusTextSchema.nullable().optional(),
    statusKind: z.enum(nearbyProfileStatusKinds).nullable().optional(),
    expiresInSec: expiresInSecSchema.optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) {
      return;
    }

    for (const field of ["latitude", "longitude", "radiusKm"] as const) {
      if (value[field] === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `${field} is required when Nearby visibility is enabled`,
        });
      }
    }
  });

export const patchNearbyProfileStatusBodySchema = z
  .object({
    nearbyStatus: nearbyProfileStatusTextSchema.nullable().optional(),
    statusKind: z.enum(nearbyProfileStatusKinds).nullable().optional(),
    expiresInSec: expiresInSecSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one status field is required",
  });

export const nearbyProfileFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(50).default(30),
  })
  .strict();

export function parseCreateNearbyStatusBody(input: unknown): CreateNearbyStatusBody {
  return parseWithValidation(createNearbyStatusBodySchema, input);
}

export function parseNearbyFeedQuery(input: unknown): NearbyFeedQuery {
  return parseWithValidation(nearbyFeedQuerySchema, input);
}

export function parseUpdateNearbyVisibilityBody(input: unknown): UpdateNearbyVisibilityBody {
  return parseWithValidation(updateNearbyVisibilityBodySchema, input);
}

export function parsePatchNearbyProfileStatusBody(input: unknown): PatchNearbyProfileStatusBody {
  return parseWithValidation(patchNearbyProfileStatusBodySchema, input);
}

export function parseNearbyProfileFeedQuery(input: unknown): NearbyProfileFeedQuery {
  return parseWithValidation(nearbyProfileFeedQuerySchema, input);
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

const nearbyProfileVisibilitySchema = {
  type: "object",
  required: ["status", "radiusKm", "nearbyStatus", "statusKind", "updatedAt", "expiresAt"],
  additionalProperties: false,
  properties: {
    status: { type: "string", enum: ["active", "off", "expired"] },
    radiusKm: { type: ["integer", "null"], minimum: 1, maximum: 250 },
    nearbyStatus: { type: ["string", "null"], maxLength: NEARBY_PROFILE_STATUS_MAX_LENGTH },
    statusKind: { type: ["string", "null"], enum: [...nearbyProfileStatusKinds, null] },
    updatedAt: { type: ["string", "null"], format: "date-time" },
    expiresAt: { type: ["string", "null"], format: "date-time" },
  },
} as const;

const nearbySummaryFeatureSchema = {
  type: "object",
  required: ["available", "count"],
  additionalProperties: false,
  properties: {
    available: { type: "boolean" },
    count: { type: ["integer", "null"], minimum: 0 },
  },
} as const;

const nearbyProfilePhotoPreviewSchema = {
  type: "object",
  required: ["mediaId", "url"],
  additionalProperties: false,
  properties: {
    mediaId: { type: "string", format: "uuid" },
    url: { type: "string" },
  },
} as const;

const nearbyProfileFeedItemSchema = {
  type: "object",
  required: [
    "userId",
    "displayName",
    "avatarUrl",
    "ageGroup",
    "distanceBucket",
    "goal",
    "mood",
    "interests",
    "publicPhotos",
    "nearbyStatus",
    "statusKind",
    "canMessage",
  ],
  additionalProperties: false,
  properties: {
    userId: { type: "string", format: "uuid" },
    displayName: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
    ageGroup: { type: ["string", "null"] },
    distanceBucket: { type: "string", enum: nearbyProfileDistanceBuckets },
    goal: { type: ["string", "null"] },
    mood: { type: ["string", "null"] },
    interests: { type: "array", items: { type: "string" } },
    publicPhotos: {
      type: "array",
      maxItems: 3,
      items: nearbyProfilePhotoPreviewSchema,
    },
    nearbyStatus: { type: ["string", "null"], maxLength: NEARBY_PROFILE_STATUS_MAX_LENGTH },
    statusKind: { type: ["string", "null"], enum: [...nearbyProfileStatusKinds, null] },
    canMessage: { type: "boolean" },
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

export const legacyNearbyStatusFeedRouteSchema = nearbyFeedRouteSchema;

export const getNearbyMeRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["visibility"],
      additionalProperties: false,
      properties: {
        visibility: nearbyProfileVisibilitySchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const getNearbySummaryRouteSchema = {
  response: {
    200: {
      type: "object",
      required: [
        "activeNearbyCount",
        "nearbyTodayCount",
        "interestChats",
        "activitiesNearby",
        "checkedAt",
      ],
      additionalProperties: false,
      properties: {
        activeNearbyCount: { type: "integer", minimum: 0 },
        nearbyTodayCount: { type: "integer", minimum: 0 },
        interestChats: nearbySummaryFeatureSchema,
        activitiesNearby: nearbySummaryFeatureSchema,
        checkedAt: { type: "string", format: "date-time" },
      },
    },
  },
} as const satisfies FastifySchema;

export const updateNearbyVisibilityRouteSchema = {
  body: {
    type: "object",
    required: ["enabled"],
    additionalProperties: false,
    properties: {
      enabled: { type: "boolean" },
      latitude: { type: "number", minimum: -90, maximum: 90 },
      longitude: { type: "number", minimum: -180, maximum: 180 },
      radiusKm: { type: "integer", minimum: 1, maximum: 250 },
      nearbyStatus: {
        anyOf: [
          { type: "string", maxLength: NEARBY_PROFILE_STATUS_MAX_LENGTH },
          { type: "null" },
        ],
      },
      statusKind: {
        anyOf: [
          { type: "string", enum: nearbyProfileStatusKinds },
          { type: "null" },
        ],
      },
      expiresInSec: { type: "integer", minimum: 60, maximum: 86400 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["visibility"],
      additionalProperties: false,
      properties: {
        visibility: nearbyProfileVisibilitySchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const patchNearbyProfileStatusRouteSchema = {
  body: {
    type: "object",
    minProperties: 1,
    additionalProperties: false,
    properties: {
      nearbyStatus: {
        anyOf: [
          { type: "string", maxLength: NEARBY_PROFILE_STATUS_MAX_LENGTH },
          { type: "null" },
        ],
      },
      statusKind: {
        anyOf: [
          { type: "string", enum: nearbyProfileStatusKinds },
          { type: "null" },
        ],
      },
      expiresInSec: { type: "integer", minimum: 60, maximum: 86400 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["visibility"],
      additionalProperties: false,
      properties: {
        visibility: nearbyProfileVisibilitySchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const nearbyProfileFeedRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 50, default: 30 },
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
          items: nearbyProfileFeedItemSchema,
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
