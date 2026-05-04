import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  type BlockUserBody,
  type CreateSafetyReportBody,
  SAFETY_REPORT_TARGET_TYPES,
} from "./safety.types";

const uuidSchema = z.string().uuid();

export const blockUserBodySchema = z
  .object({
    blockedUserId: uuidSchema,
  })
  .strict();

export const createSafetyReportBodySchema = z
  .object({
    targetType: z.enum(SAFETY_REPORT_TARGET_TYPES),
    targetId: z.string().trim().min(1),
    targetOwnerUserId: uuidSchema.nullish(),
    reason: z.string().trim().min(1),
    comment: z.string().trim().min(1).nullish(),
  })
  .strict();

export function parseBlockUserBody(input: unknown): BlockUserBody {
  return parseWithValidation(blockUserBodySchema, input);
}

export function parseCreateSafetyReportBody(input: unknown): CreateSafetyReportBody {
  return parseWithValidation(createSafetyReportBodySchema, input);
}

const okSchema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", const: true },
  },
} as const;

const blockedUserParamsSchema = {
  type: "object",
  required: ["blockedUserId"],
  additionalProperties: false,
  properties: {
    blockedUserId: { type: "string", format: "uuid" },
  },
} as const;

export const createBlockRouteSchema = {
  body: {
    type: "object",
    required: ["blockedUserId"],
    additionalProperties: false,
    properties: {
      blockedUserId: { type: "string", format: "uuid" },
    },
  },
  response: {
    200: okSchema,
  },
} as const satisfies FastifySchema;

export const deleteBlockRouteSchema = {
  params: blockedUserParamsSchema,
  response: {
    200: okSchema,
  },
} as const satisfies FastifySchema;

export const listBlocksRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["items"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["blockedUserId", "createdAt"],
            additionalProperties: false,
            properties: {
              blockedUserId: { type: "string", format: "uuid" },
              createdAt: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  },
} as const satisfies FastifySchema;

export const createSafetyReportRouteSchema = {
  body: {
    type: "object",
    required: ["targetType", "targetId", "reason"],
    additionalProperties: false,
    properties: {
      targetType: { type: "string", enum: SAFETY_REPORT_TARGET_TYPES },
      targetId: { type: "string", minLength: 1 },
      targetOwnerUserId: {
        anyOf: [{ type: "string", format: "uuid" }, { type: "null" }],
      },
      reason: { type: "string", minLength: 1 },
      comment: {
        anyOf: [{ type: "string", minLength: 1 }, { type: "null" }],
      },
    },
  },
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
