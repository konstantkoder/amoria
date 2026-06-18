import type { FastifySchema } from "fastify";

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

export const adminNearbyRoomDetailRouteSchema = {
  params: roomIdParamsSchema,
  response: {
    200: {
      type: "object",
      required: ["room"],
      additionalProperties: false,
      properties: {
        room: adminNearbyRoomSchema,
      },
    },
  },
} as const satisfies FastifySchema;
