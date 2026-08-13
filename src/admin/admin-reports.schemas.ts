import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  REPORT_REVIEW_ACTIONS,
  REPORT_STATUSES,
  type AdminReportActionBody,
  type AdminReportsQuery,
} from "./admin-reports.types";

const optionalString = (maxLength: number) => z.string().trim().min(1).max(maxLength).optional();

export const adminReportsQuerySchema = z
  .object({
    status: z.enum(REPORT_STATUSES).optional(),
    targetType: optionalString(80),
    reporterAmoriaId: optionalString(32),
    targetOwnerAmoriaId: optionalString(32),
    limit: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict();

export const adminReportActionBodySchema = z
  .object({
    action: z.enum(REPORT_REVIEW_ACTIONS),
    reason: optionalString(500),
    note: optionalString(2000),
    metadata: z.unknown().optional(),
  })
  .strict();

export function parseAdminReportsQuery(input: unknown): AdminReportsQuery {
  return parseWithValidation(adminReportsQuerySchema, input);
}

export function parseAdminReportActionBody(input: unknown): AdminReportActionBody {
  return parseWithValidation(adminReportActionBodySchema, input);
}

const reportUserSchema = {
  type: "object",
  required: ["id", "amoriaId", "displayName", "email"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    amoriaId: { type: "string" },
    displayName: { type: "string" },
    email: { type: "string", format: "email" },
  },
} as const;

const reportMetadataSchema = {
  anyOf: [
    { type: "object", additionalProperties: true },
    { type: "array", items: {} },
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
} as const;

const reportTargetContextLinkSchema = {
  type: "object",
  required: ["kind", "label", "screen", "available", "params", "unavailableReason"],
  additionalProperties: false,
  properties: {
    kind: {
      type: "string",
      enum: [
        "reporter_user",
        "target_owner_user",
        "target_user",
        "target_media",
        "target_thread",
        "target_message",
        "target_together_session",
        "nearby_diagnostics",
      ],
    },
    label: { type: "string" },
    screen: {
      type: "string",
      enum: ["users", "media", "message_moderation", "together_sessions", "nearby_diagnostics", "none"],
    },
    available: { type: "boolean" },
    params: {
      type: "object",
      additionalProperties: { type: "string" },
    },
    unavailableReason: { type: ["string", "null"] },
  },
} as const;

const reportTargetContextSchema = {
  type: "object",
  required: ["summary", "privacyNote", "links"],
  additionalProperties: false,
  properties: {
    summary: { type: "string" },
    privacyNote: { type: "string" },
    links: {
      type: "array",
      items: reportTargetContextLinkSchema,
    },
  },
} as const;

const reportReviewActionItemSchema = {
  type: "object",
  required: ["id", "reportId", "adminUserId", "action", "reason", "note", "metadata", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    reportId: { type: "string", format: "uuid" },
    adminUserId: { type: ["string", "null"], format: "uuid" },
    action: { type: "string", enum: REPORT_REVIEW_ACTIONS },
    reason: { type: ["string", "null"] },
    note: { type: ["string", "null"] },
    metadata: reportMetadataSchema,
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const reportItemSchema = {
  type: "object",
  required: [
    "id",
    "reporterUserId",
    "reporter",
    "targetType",
    "targetId",
    "targetOwnerUserId",
    "targetOwner",
    "targetUser",
    "reason",
    "comment",
    "status",
    "assignedAdminUserId",
    "createdAt",
    "updatedAt",
    "targetContext",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    reporterUserId: { type: ["string", "null"], format: "uuid" },
    reporter: { anyOf: [reportUserSchema, { type: "null" }] },
    targetType: { type: "string" },
    targetId: { type: "string" },
    targetOwnerUserId: { type: ["string", "null"], format: "uuid" },
    targetOwner: {
      anyOf: [reportUserSchema, { type: "null" }],
    },
    targetUser: {
      anyOf: [reportUserSchema, { type: "null" }],
    },
    reason: { type: "string" },
    comment: { type: ["string", "null"] },
    status: { type: "string", enum: REPORT_STATUSES },
    assignedAdminUserId: { type: ["string", "null"], format: "uuid" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
    targetContext: reportTargetContextSchema,
  },
} as const;

const reportDetailSchema = {
  ...reportItemSchema,
  required: [...reportItemSchema.required, "reviewActions"],
  properties: {
    ...reportItemSchema.properties,
    reviewActions: {
      type: "array",
      items: reportReviewActionItemSchema,
    },
  },
} as const;

export const adminReportsListRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", enum: REPORT_STATUSES },
      targetType: { type: "string", minLength: 1, maxLength: 80 },
      reporterAmoriaId: { type: "string", minLength: 1, maxLength: 32 },
      targetOwnerAmoriaId: { type: "string", minLength: 1, maxLength: 32 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: { type: "array", items: reportItemSchema },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminReportDetailRouteSchema = {
  params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
  response: {
    200: {
      type: "object",
      required: ["report"],
      additionalProperties: false,
      properties: {
        report: reportDetailSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const adminReportActionRouteSchema = {
  params: { type: "object", required: ["id"], additionalProperties: false, properties: { id: { type: "string", format: "uuid" } } },
  body: {
    type: "object",
    required: ["action"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: REPORT_REVIEW_ACTIONS },
      reason: { type: "string", minLength: 1, maxLength: 500 },
      note: { type: "string", minLength: 1, maxLength: 2000 },
      metadata: reportMetadataSchema,
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok", "report", "reviewAction"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        report: reportItemSchema,
        reviewAction: reportReviewActionItemSchema,
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
    details[issue.path.join(".") || "request"] = issue.message;
  }

  throw validationError("Request validation failed", details);
}
