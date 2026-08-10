import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  ADMIN_MESSAGE_DECISIONS,
  ADMIN_MESSAGE_QUEUE_FILTERS,
  type AdminMessageDecisionBody,
  type AdminMessageQueueQuery,
} from "./admin-message-moderation.types";

const queueQuerySchema = z.object({
  status: z.enum(ADMIN_MESSAGE_QUEUE_FILTERS).default("all"),
  source: z.enum(["direct", "nearby"]).optional(),
  limit: z.coerce.number().int().positive().max(100).default(50),
}).strict();

const decisionSchema = z.object({
  action: z.enum(ADMIN_MESSAGE_DECISIONS),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

const detailQuerySchema = z.object({
  reason: z.string().trim().min(3).max(500),
}).strict();

export function parseAdminMessageQueueQuery(input: unknown): AdminMessageQueueQuery {
  return parse(queueQuerySchema, input);
}
export function parseAdminMessageDecisionBody(input: unknown): AdminMessageDecisionBody {
  return parse(decisionSchema, input);
}

export function parseAdminMessageDetailReason(input: unknown): string {
  return parse(detailQuerySchema, input).reason;
}

const params = {
  type: "object",
  required: ["messageId"],
  additionalProperties: false,
  properties: { messageId: { type: "string", format: "uuid" } },
} as const;

export const adminMessageQueueRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: ADMIN_MESSAGE_QUEUE_FILTERS, default: "all" },
      source: { type: "string", enum: ["direct", "nearby"] },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
} as const satisfies FastifySchema;

export const adminMessageDetailRouteSchema = {
  params,
  querystring: {
    type: "object",
    required: ["reason"],
    additionalProperties: false,
    properties: { reason: { type: "string", minLength: 3, maxLength: 500 } },
  },
} as const satisfies FastifySchema;

export const adminMessageDecisionRouteSchema = {
  params,
  body: {
    type: "object",
    required: ["action"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: ADMIN_MESSAGE_DECISIONS },
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
} as const satisfies FastifySchema;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw validationError("Request validation failed", Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join(".") || "body", issue.message]),
  ));
}
