import type { FastifySchema } from "fastify";

const roomIdParamsSchema = {
  type: "object",
  required: ["roomId"],
  additionalProperties: false,
  properties: {
    roomId: { type: "string", format: "uuid" },
  },
} as const;

const nearbyRoomCardSchema = {
  type: "object",
  required: [
    "id",
    "typeKey",
    "title",
    "geoBucket",
    "memberCount",
    "status",
    "canJoin",
    "canOpen",
    "threadId",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    typeKey: { type: "string" },
    title: { type: "string" },
    geoBucket: { type: "string" },
    memberCount: { type: "integer", minimum: 0 },
    status: { type: "string" },
    canJoin: { type: "boolean" },
    canOpen: { type: "boolean" },
    threadId: { type: ["string", "null"], format: "uuid" },
  },
} as const;

const nearbyRoomActionResponseSchema = {
  type: "object",
  required: ["room"],
  additionalProperties: false,
  properties: {
    room: nearbyRoomCardSchema,
  },
} as const;

export const nearbyRoomsRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: nearbyRoomCardSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const nearbyRoomJoinRouteSchema = {
  params: roomIdParamsSchema,
  response: {
    200: nearbyRoomActionResponseSchema,
  },
} as const satisfies FastifySchema;

export const nearbyRoomLeaveRouteSchema = {
  params: roomIdParamsSchema,
  response: {
    200: nearbyRoomActionResponseSchema,
  },
} as const satisfies FastifySchema;
