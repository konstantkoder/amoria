import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  CHAT_CLIENT_MESSAGE_ID_MAX_LENGTH,
  CHAT_MESSAGE_TEXT_MAX_LENGTH,
  CHAT_SOURCE_TYPES,
} from "../config/constants";
import type {
  InboxQuery,
  MarkThreadReadBody,
  MessagesQuery,
  OpenDirectThreadBody,
  SendMessageBody,
} from "./chat.types";

const uuidSchema = z.string().uuid();

const sourceSchema = z
  .object({
    type: z.enum(CHAT_SOURCE_TYPES),
    sourceId: uuidSchema,
  })
  .strict();

export const openDirectThreadBodySchema = z
  .object({
    peerUserId: uuidSchema,
    source: sourceSchema.optional(),
  })
  .strict();

export const inboxQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(30),
  })
  .strict();

export const messagesQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict();

export const sendMessageBodySchema = z
  .object({
    clientMessageId: z.string().trim().min(1).max(CHAT_CLIENT_MESSAGE_ID_MAX_LENGTH),
    text: z.string().trim().min(1).max(CHAT_MESSAGE_TEXT_MAX_LENGTH),
  })
  .strict();

export const markThreadReadBodySchema = z
  .object({
    readThroughMessageId: uuidSchema.optional(),
  })
  .strict();

export function parseOpenDirectThreadBody(input: unknown): OpenDirectThreadBody {
  return parseWithValidation(openDirectThreadBodySchema, input);
}

export function parseInboxQuery(input: unknown): InboxQuery {
  return parseWithValidation(inboxQuerySchema, input);
}

export function parseMessagesQuery(input: unknown): MessagesQuery {
  return parseWithValidation(messagesQuerySchema, input);
}

export function parseSendMessageBody(input: unknown): SendMessageBody {
  return parseWithValidation(sendMessageBodySchema, input);
}

export function parseMarkThreadReadBody(input: unknown): MarkThreadReadBody {
  return parseWithValidation(markThreadReadBodySchema, input);
}

const peerSchema = {
  type: "object",
  required: ["id", "displayName", "avatarUrl"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    displayName: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
  },
} as const;

const lastMessageSchema = {
  type: "object",
  required: ["id", "text", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    text: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const sourceResponseSchema = {
  type: "object",
  required: ["type", "sourceId"],
  additionalProperties: false,
  properties: {
    type: { type: "string", enum: CHAT_SOURCE_TYPES },
    sourceId: { type: "string", format: "uuid" },
  },
} as const;

const threadSchema = {
  type: "object",
  required: ["id", "type", "peer", "lastMessage", "unreadCount", "source"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    type: { type: "string" },
    peer: peerSchema,
    lastMessage: {
      anyOf: [lastMessageSchema, { type: "null" }],
    },
    unreadCount: { type: "integer", minimum: 0 },
    source: {
      anyOf: [sourceResponseSchema, { type: "null" }],
    },
  },
} as const;

const messageSchema = {
  type: "object",
  required: ["id", "threadId", "fromUserId", "text", "createdAt", "clientMessageId"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    threadId: { type: "string", format: "uuid" },
    fromUserId: { type: "string", format: "uuid" },
    text: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    clientMessageId: { type: "string" },
  },
} as const;

export const openDirectThreadRouteSchema = {
  body: {
    type: "object",
    required: ["peerUserId"],
    additionalProperties: false,
    properties: {
      peerUserId: { type: "string", format: "uuid" },
      source: {
        type: "object",
        required: ["type", "sourceId"],
        additionalProperties: false,
        properties: sourceResponseSchema.properties,
      },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["thread"],
      additionalProperties: false,
      properties: {
        thread: threadSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const inboxRouteSchema = {
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
          items: threadSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const getThreadMessagesRouteSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
    },
  },
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
          items: messageSchema,
        },
      },
    },
  },
} as const satisfies FastifySchema;

export const sendMessageRouteSchema = {
  params: getThreadMessagesRouteSchema.params,
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
        message: messageSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const markThreadReadRouteSchema = {
  params: getThreadMessagesRouteSchema.params,
  body: {
    type: "object",
    additionalProperties: false,
    properties: {
      readThroughMessageId: { type: "string", format: "uuid" },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean" },
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
