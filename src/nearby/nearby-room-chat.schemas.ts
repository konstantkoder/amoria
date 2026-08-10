import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  CHAT_CLIENT_MESSAGE_ID_MAX_LENGTH,
  CHAT_MESSAGE_TEXT_MAX_LENGTH,
} from "../config/constants";
import type {
  NearbyRoomMessagesQuery,
  SendNearbyRoomMessageBody,
} from "./nearby-room-chat.types";

const roomIdParamsSchema = {
  type: "object",
  required: ["roomId"],
  additionalProperties: false,
  properties: {
    roomId: { type: "string", format: "uuid" },
  },
} as const;

export const nearbyRoomMessagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict();

export const sendNearbyRoomMessageBodySchema = z
  .object({
    clientMessageId: z.string().trim().min(1).max(CHAT_CLIENT_MESSAGE_ID_MAX_LENGTH),
    text: z.string().trim().min(1).max(CHAT_MESSAGE_TEXT_MAX_LENGTH),
  })
  .strict();

export function parseNearbyRoomMessagesQuery(input: unknown): NearbyRoomMessagesQuery {
  return parseWithValidation(nearbyRoomMessagesQuerySchema, input);
}

export function parseSendNearbyRoomMessageBody(input: unknown): SendNearbyRoomMessageBody {
  return parseWithValidation(sendNearbyRoomMessageBodySchema, input);
}

const nearbyRoomChatInfoSchema = {
  type: "object",
  required: ["roomId", "threadId", "title"],
  additionalProperties: false,
  properties: {
    roomId: { type: "string", format: "uuid" },
    threadId: { type: "string", format: "uuid" },
    title: { type: "string" },
  },
} as const;

const nearbyRoomMessageSchema = {
  type: "object",
  required: [
    "id",
    "roomId",
    "threadId",
    "fromUserId",
    "text",
    "createdAt",
    "clientMessageId",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    roomId: { type: "string", format: "uuid" },
    threadId: { type: "string", format: "uuid" },
    fromUserId: { type: "string", format: "uuid" },
    text: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    clientMessageId: { type: "string" },
    moderationState: {
      type: "string",
      enum: ["visible", "held", "needs_review", "restricted", "removed"],
    },
    automationStatus: {
      type: "string",
      enum: ["completed", "failed", "not_configured", "not_required"],
    },
  },
} as const;

export const openNearbyRoomChatRouteSchema = {
  params: roomIdParamsSchema,
  response: {
    200: nearbyRoomChatInfoSchema,
  },
} as const satisfies FastifySchema;

export const getNearbyRoomMessagesRouteSchema = {
  params: roomIdParamsSchema,
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["items"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: nearbyRoomMessageSchema,
        },
      },
    },
  },
} as const satisfies FastifySchema;

export const sendNearbyRoomMessageRouteSchema = {
  params: roomIdParamsSchema,
  body: {
    type: "object",
    required: ["clientMessageId", "text"],
    additionalProperties: false,
    properties: {
      clientMessageId: {
        type: "string",
        minLength: 1,
        maxLength: CHAT_CLIENT_MESSAGE_ID_MAX_LENGTH,
      },
      text: {
        type: "string",
        minLength: 1,
        maxLength: CHAT_MESSAGE_TEXT_MAX_LENGTH,
      },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["message"],
      additionalProperties: false,
      properties: {
        message: nearbyRoomMessageSchema,
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
