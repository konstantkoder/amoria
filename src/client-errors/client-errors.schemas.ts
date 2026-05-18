import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  CLIENT_ERROR_ACTIONS,
  CLIENT_ERROR_BULK_ACTIONS,
  CLIENT_ERROR_BULK_ACTION_LIMIT,
  CLIENT_ERROR_LIMIT_DEFAULT,
  CLIENT_ERROR_LIMIT_MAX,
  CLIENT_ERROR_STATUSES,
  type ClientErrorActionBody,
  type ClientErrorBulkActionBody,
  type ClientErrorReportBody,
  type ClientErrorReportListQuery,
} from "./client-errors.types";

const optionalString = (maxLength: number) => z.string().trim().min(1).max(maxLength).optional();
const optionalDate = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date-time")
  .transform((value) => new Date(value))
  .optional();

export const clientErrorReportBodySchema = z
  .object({
    screen: z.string().trim().min(1).max(120),
    action: z.string().trim().min(1).max(120),
    step: optionalString(120),
    code: optionalString(120),
    message: z.string().trim().min(1).max(12000),
    stack: optionalString(16000),
    metadata: z.unknown().optional(),
    platform: optionalString(60),
    appVersion: optionalString(60),
    buildNumber: optionalString(60),
    deviceModel: optionalString(120),
    osVersion: optionalString(120),
    requestId: optionalString(120),
    backendUrl: optionalString(500),
  })
  .strict();

export const adminClientErrorsQuerySchema = z
  .object({
    limit: z.coerce
      .number()
      .int()
      .positive()
      .max(CLIENT_ERROR_LIMIT_MAX)
      .default(CLIENT_ERROR_LIMIT_DEFAULT),
    screen: optionalString(120),
    action: optionalString(120),
    code: optionalString(120),
    amoriaId: optionalString(120),
    userId: z.string().uuid().optional(),
    status: z.enum(CLIENT_ERROR_STATUSES).optional(),
    createdFrom: optionalDate,
    createdTo: optionalDate,
  })
  .strict();

export const adminClientErrorActionBodySchema = z
  .object({
    action: z.enum(CLIENT_ERROR_ACTIONS),
    note: optionalString(2000),
  })
  .strict();

export const adminClientErrorBulkActionBodySchema = z
  .object({
    action: z.enum(CLIENT_ERROR_BULK_ACTIONS),
    filters: z
      .object({
        screen: optionalString(120),
        action: optionalString(120),
        code: optionalString(120),
        amoriaId: optionalString(120),
        status: z.enum(CLIENT_ERROR_STATUSES).optional(),
      })
      .strict(),
    note: optionalString(2000),
  })
  .strict();

export function parseClientErrorReportBody(input: unknown): ClientErrorReportBody {
  return parseWithValidation(clientErrorReportBodySchema, input);
}

export function parseAdminClientErrorsQuery(input: unknown): ClientErrorReportListQuery {
  return parseWithValidation(adminClientErrorsQuerySchema, input);
}

export function parseAdminClientErrorActionBody(input: unknown): ClientErrorActionBody {
  return parseWithValidation(adminClientErrorActionBodySchema, input);
}

export function parseAdminClientErrorBulkActionBody(input: unknown): ClientErrorBulkActionBody {
  return parseWithValidation(adminClientErrorBulkActionBodySchema, input);
}

const clientErrorMetadataSchema = {
  anyOf: [
    { type: "object", additionalProperties: true },
    { type: "array", items: {} },
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
} as const;

const clientErrorReportItemSchema = {
  type: "object",
  required: [
    "id",
    "userId",
    "amoriaId",
    "displayName",
    "email",
    "screen",
    "action",
    "step",
    "code",
    "message",
    "stack",
    "metadata",
    "platform",
    "appVersion",
    "buildNumber",
    "deviceModel",
    "osVersion",
    "requestId",
    "backendUrl",
    "status",
    "resolvedAt",
    "resolvedByAdminUserId",
    "resolutionNote",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: ["string", "null"], format: "uuid" },
    amoriaId: { type: ["string", "null"] },
    displayName: { type: ["string", "null"] },
    email: { type: ["string", "null"], format: "email" },
    screen: { type: "string" },
    action: { type: "string" },
    step: { type: ["string", "null"] },
    code: { type: ["string", "null"] },
    message: { type: "string" },
    stack: { type: ["string", "null"] },
    metadata: clientErrorMetadataSchema,
    platform: { type: ["string", "null"] },
    appVersion: { type: ["string", "null"] },
    buildNumber: { type: ["string", "null"] },
    deviceModel: { type: ["string", "null"] },
    osVersion: { type: ["string", "null"] },
    requestId: { type: ["string", "null"] },
    backendUrl: { type: ["string", "null"] },
    status: { type: "string", enum: CLIENT_ERROR_STATUSES },
    resolvedAt: { type: ["string", "null"], format: "date-time" },
    resolvedByAdminUserId: { type: ["string", "null"], format: "uuid" },
    resolutionNote: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const createClientErrorReportRouteSchema = {
  body: {
    type: "object",
    required: ["screen", "action", "message"],
    additionalProperties: false,
    properties: {
      screen: { type: "string", minLength: 1, maxLength: 120 },
      action: { type: "string", minLength: 1, maxLength: 120 },
      step: { type: "string", minLength: 1, maxLength: 120 },
      code: { type: "string", minLength: 1, maxLength: 120 },
      message: { type: "string", minLength: 1, maxLength: 12000 },
      stack: { type: "string", minLength: 1, maxLength: 16000 },
      metadata: clientErrorMetadataSchema,
      platform: { type: "string", minLength: 1, maxLength: 60 },
      appVersion: { type: "string", minLength: 1, maxLength: 60 },
      buildNumber: { type: "string", minLength: 1, maxLength: 60 },
      deviceModel: { type: "string", minLength: 1, maxLength: 120 },
      osVersion: { type: "string", minLength: 1, maxLength: 120 },
      requestId: { type: "string", minLength: 1, maxLength: 120 },
      backendUrl: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  response: {
    201: {
      type: "object",
      required: ["ok", "id"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        id: { type: "string", format: "uuid" },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminClientErrorsRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: { type: "integer", minimum: 1, maximum: CLIENT_ERROR_LIMIT_MAX, default: CLIENT_ERROR_LIMIT_DEFAULT },
      screen: { type: "string", minLength: 1, maxLength: 120 },
      action: { type: "string", minLength: 1, maxLength: 120 },
      code: { type: "string", minLength: 1, maxLength: 120 },
      amoriaId: { type: "string", minLength: 1, maxLength: 120 },
      userId: { type: "string", format: "uuid" },
      status: { type: "string", enum: CLIENT_ERROR_STATUSES },
      createdFrom: { type: "string", minLength: 1, maxLength: 40 },
      createdTo: { type: "string", minLength: 1, maxLength: 40 },
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
          items: clientErrorReportItemSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminClientErrorActionRouteSchema = {
  body: {
    type: "object",
    required: ["action"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: CLIENT_ERROR_ACTIONS },
      note: { type: "string", minLength: 1, maxLength: 2000 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok", "previousStatus", "nextStatus", "item"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        previousStatus: { type: "string", enum: CLIENT_ERROR_STATUSES },
        nextStatus: { type: "string", enum: CLIENT_ERROR_STATUSES },
        item: clientErrorReportItemSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const adminClientErrorBulkActionRouteSchema = {
  body: {
    type: "object",
    required: ["action", "filters"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: CLIENT_ERROR_BULK_ACTIONS },
      filters: {
        type: "object",
        additionalProperties: false,
        properties: {
          screen: { type: "string", minLength: 1, maxLength: 120 },
          action: { type: "string", minLength: 1, maxLength: 120 },
          code: { type: "string", minLength: 1, maxLength: 120 },
          amoriaId: { type: "string", minLength: 1, maxLength: 120 },
          status: { type: "string", enum: CLIENT_ERROR_STATUSES },
        },
      },
      note: { type: "string", minLength: 1, maxLength: 2000 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok", "action", "count", "maxAffectedRows"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        action: { type: "string", enum: CLIENT_ERROR_BULK_ACTIONS },
        count: { type: "integer", minimum: 0, maximum: CLIENT_ERROR_BULK_ACTION_LIMIT },
        maxAffectedRows: { type: "integer", const: CLIENT_ERROR_BULK_ACTION_LIMIT },
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
