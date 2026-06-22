import type { FastifySchema } from "fastify";
import { NEARBY_ACTIVITY_KEYS } from "../config/constants";

const adminNearbyActivityDemandGeoBucketSchema = {
  type: "object",
  required: ["geoBucket", "interestedUsersCount"],
  additionalProperties: false,
  properties: {
    geoBucket: { type: "string" },
    interestedUsersCount: { type: "integer", minimum: 0 },
  },
} as const;

const adminNearbyActivityDemandRowSchema = {
  type: "object",
  required: [
    "activityKey",
    "activityTitle",
    "interestedUsersCount",
    "activeNearbyUsersCount",
    "recentlyUpdatedUsersCount",
    "geoBuckets",
    "existingActiveRoomCount",
    "lastUpdatedAt",
  ],
  additionalProperties: false,
  properties: {
    activityKey: { type: "string", enum: NEARBY_ACTIVITY_KEYS },
    activityTitle: { type: "string" },
    interestedUsersCount: { type: "integer", minimum: 0 },
    activeNearbyUsersCount: { type: "integer", minimum: 0 },
    recentlyUpdatedUsersCount: { type: "integer", minimum: 0 },
    geoBuckets: {
      type: "array",
      items: adminNearbyActivityDemandGeoBucketSchema,
    },
    existingActiveRoomCount: { type: "integer", minimum: 0 },
    lastUpdatedAt: { type: ["string", "null"], format: "date-time" },
  },
} as const;

export const adminNearbyActivityDemandRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          maxItems: NEARBY_ACTIVITY_KEYS.length,
          items: adminNearbyActivityDemandRowSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;
