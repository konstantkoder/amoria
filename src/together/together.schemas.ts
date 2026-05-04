import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  TOGETHER_ACTIVITIES,
  TOGETHER_CLIENT_EVENT_ID_MAX_LENGTH,
  TOGETHER_EVENT_PAYLOAD_MAX_BYTES,
  TOGETHER_EVENT_TYPES,
  TOGETHER_HISTORY_LIMIT_DEFAULT,
  TOGETHER_HISTORY_LIMIT_MAX,
  TOGETHER_REVEAL_DECISIONS,
} from "../config/constants";
import type { JsonValue } from "../db/schema";
import type {
  TogetherEventBody,
  TogetherHistoryQuery,
  TogetherQueueBody,
  TogetherRevealBody,
} from "./together.types";

export const togetherQueueBodySchema = z
  .object({
    activity: z.enum(TOGETHER_ACTIVITIES),
  })
  .strict();

const jsonPayloadSchema = z
  .custom<JsonValue>((value) => isJsonValue(value), {
    message: "Expected JSON payload",
  })
  .refine((value) => jsonByteLength(value) <= TOGETHER_EVENT_PAYLOAD_MAX_BYTES, {
    message: `Payload must be at most ${TOGETHER_EVENT_PAYLOAD_MAX_BYTES} bytes`,
  });

export const togetherEventBodySchema = z
  .object({
    clientEventId: z
      .string()
      .trim()
      .min(1)
      .max(TOGETHER_CLIENT_EVENT_ID_MAX_LENGTH),
    type: z.enum(TOGETHER_EVENT_TYPES),
    payload: jsonPayloadSchema,
  })
  .strict();

export const togetherRevealBodySchema = z
  .object({
    decision: z.enum(TOGETHER_REVEAL_DECISIONS),
  })
  .strict();

export const togetherHistoryQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(TOGETHER_HISTORY_LIMIT_MAX)
      .default(TOGETHER_HISTORY_LIMIT_DEFAULT),
  })
  .strict();

export function parseTogetherQueueBody(input: unknown): TogetherQueueBody {
  return parseWithValidation(togetherQueueBodySchema, input);
}

export function parseTogetherEventBody(input: unknown): TogetherEventBody {
  return parseWithValidation(togetherEventBodySchema, input);
}

export function parseTogetherRevealBody(input: unknown): TogetherRevealBody {
  return parseWithValidation(togetherRevealBodySchema, input);
}

export function parseTogetherHistoryQuery(input: unknown): TogetherHistoryQuery {
  return parseWithValidation(togetherHistoryQuerySchema, input);
}

const uuidParamSchema = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
  },
} as const;

const queueEntrySchema = {
  type: "object",
  required: ["id", "status", "expiresAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["waiting", "matched", "cancelled", "expired"] },
    sessionId: { type: "string", format: "uuid" },
    expiresAt: { type: "string", format: "date-time" },
  },
} as const;

const participantSchema = {
  type: "object",
  required: ["id", "displayName", "avatarUrl"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    displayName: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
  },
} as const;

const sessionSchema = {
  type: "object",
  required: ["id", "activity", "status", "promptText", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    activity: { type: "string", enum: TOGETHER_ACTIVITIES },
    status: { type: "string", enum: ["active", "finished"] },
    promptText: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const eventSchema = {
  type: "object",
  required: ["id", "sessionId", "fromUserId", "clientEventId", "type", "payload", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    sessionId: { type: "string", format: "uuid" },
    fromUserId: { type: "string", format: "uuid" },
    clientEventId: { type: "string" },
    type: { type: "string", enum: TOGETHER_EVENT_TYPES },
    payload: {},
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const revealOutcomeSchema = {
  type: "string",
  enum: ["pending", "open_open", "open_skip", "skip_skip"],
} as const;

const historyItemSchema = {
  type: "object",
  required: ["sessionId", "activity", "promptText", "peer", "outcome", "createdAt"],
  additionalProperties: false,
  properties: {
    sessionId: { type: "string", format: "uuid" },
    activity: { type: "string", enum: TOGETHER_ACTIVITIES },
    promptText: { type: "string" },
    peer: participantSchema,
    outcome: revealOutcomeSchema,
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

export const postTogetherQueueRouteSchema = {
  body: {
    type: "object",
    required: ["activity"],
    additionalProperties: false,
    properties: {
      activity: { type: "string", enum: TOGETHER_ACTIVITIES },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["entry"],
      additionalProperties: false,
      properties: {
        entry: queueEntrySchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const getTogetherQueueRouteSchema = {
  params: uuidParamSchema,
  response: postTogetherQueueRouteSchema.response,
} as const satisfies FastifySchema;

export const deleteTogetherQueueRouteSchema = getTogetherQueueRouteSchema;

export const getTogetherSessionRouteSchema = {
  params: uuidParamSchema,
  response: {
    200: {
      type: "object",
      required: ["session", "participants", "stateVersion"],
      additionalProperties: false,
      properties: {
        session: sessionSchema,
        participants: {
          type: "array",
          items: participantSchema,
        },
        stateVersion: { type: "integer", minimum: 0 },
      },
    },
  },
} as const satisfies FastifySchema;

export const postTogetherEventRouteSchema = {
  params: uuidParamSchema,
  body: {
    type: "object",
    required: ["clientEventId", "type", "payload"],
    additionalProperties: false,
    properties: {
      clientEventId: {
        type: "string",
        minLength: 1,
        maxLength: TOGETHER_CLIENT_EVENT_ID_MAX_LENGTH,
      },
      type: { type: "string", enum: TOGETHER_EVENT_TYPES },
      payload: {},
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok", "created"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean" },
        created: { type: "boolean" },
      },
    },
  },
} as const satisfies FastifySchema;

export const postTogetherFinishRouteSchema = {
  params: uuidParamSchema,
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

export const postTogetherRevealRouteSchema = {
  params: uuidParamSchema,
  body: {
    type: "object",
    required: ["decision"],
    additionalProperties: false,
    properties: {
      decision: { type: "string", enum: TOGETHER_REVEAL_DECISIONS },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["outcome"],
      additionalProperties: false,
      properties: {
        outcome: revealOutcomeSchema,
        threadId: { type: "string", format: "uuid" },
      },
    },
  },
} as const satisfies FastifySchema;

export const getTogetherHistoryRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: TOGETHER_HISTORY_LIMIT_MAX,
        default: TOGETHER_HISTORY_LIMIT_DEFAULT,
      },
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
          items: historyItemSchema,
        },
      },
    },
  },
} as const satisfies FastifySchema;

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  if (typeof value === "object") {
    return Object.values(value).every(isJsonValue);
  }

  return false;
}

function jsonByteLength(value: JsonValue): number {
  return Buffer.byteLength(JSON.stringify(value));
}

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
