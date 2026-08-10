import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  ADMIN_BULK_KINDS,
  type AdminBulkConfirmBody,
  type AdminBulkPreviewBody,
} from "./admin-bulk.types";

const actionByKind: Record<(typeof ADMIN_BULK_KINDS)[number], readonly string[]> = {
  media_scan: ["scan"],
  media_decision: ["mark_under_review", "restrict", "remove"],
  message_decision: ["restrict", "remove", "escalate"],
  physical_media_purge: ["purge"],
};

const previewSchema = z.object({
  kind: z.enum(ADMIN_BULK_KINDS),
  action: z.string().trim().min(1).max(40),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/),
  maxItems: z.coerce.number().int().min(1).max(100).default(25),
  scope: z.object({
    moderationStatus: z.string().trim().min(1).max(40).optional(),
    ownerAmoriaId: z.string().trim().min(1).max(32).optional(),
  }).strict().default({}),
}).strict().superRefine((value, context) => {
  if (!actionByKind[value.kind].includes(value.action)) {
    context.addIssue({ code: "custom", path: ["action"], message: "Action is not allowed for this job kind" });
  }
  if (value.kind === "physical_media_purge" && Object.keys(value.scope).length > 0) {
    context.addIssue({ code: "custom", path: ["scope"], message: "Physical purge accepts no broadening filters" });
  }
});

const confirmSchema = z.object({
  confirmationToken: z.string().trim().min(32).max(256),
}).strict();

export function parseAdminBulkPreviewBody(input: unknown): AdminBulkPreviewBody {
  return parse(previewSchema, input);
}

export function parseAdminBulkConfirmBody(input: unknown): AdminBulkConfirmBody {
  return parse(confirmSchema, input);
}

const metadataSchema = {
  anyOf: [
    { type: "object", additionalProperties: true },
    { type: "array", items: {} },
    { type: "string" }, { type: "number" }, { type: "boolean" }, { type: "null" },
  ],
} as const;

const bulkItemSchema = {
  type: "object",
  required: ["id", "targetType", "targetId", "proposedAction", "status", "errorCode", "metadata", "appliedAt", "createdAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    targetType: { type: "string" },
    targetId: { type: "string" },
    proposedAction: { type: "string" },
    status: { type: "string", enum: ["pending", "applied", "skipped", "failed"] },
    errorCode: { type: ["string", "null"] },
    metadata: metadataSchema,
    appliedAt: { type: ["string", "null"], format: "date-time" },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

const bulkJobSchema = {
  type: "object",
  required: ["id", "adminUserId", "kind", "action", "scope", "reason", "idempotencyKey", "maxItems", "status", "confirmedAt", "completedAt", "previewCount", "appliedCount", "skippedCount", "failedCount", "createdAt", "updatedAt", "items"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    adminUserId: { type: ["string", "null"], format: "uuid" },
    kind: { type: "string", enum: ADMIN_BULK_KINDS },
    action: { type: "string" },
    scope: metadataSchema,
    reason: { type: "string" },
    idempotencyKey: { type: "string" },
    maxItems: { type: "integer" },
    status: { type: "string", enum: ["awaiting_confirmation", "running", "completed", "partially_failed", "cancelled"] },
    confirmedAt: { type: ["string", "null"], format: "date-time" },
    completedAt: { type: ["string", "null"], format: "date-time" },
    previewCount: { type: "integer" }, appliedCount: { type: "integer" }, skippedCount: { type: "integer" }, failedCount: { type: "integer" },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" },
    items: { type: "array", items: bulkItemSchema },
  },
} as const;

export const adminBulkPreviewRouteSchema = {
  body: {
    type: "object", required: ["kind", "action", "reason", "idempotencyKey"], additionalProperties: false,
    properties: {
      kind: { type: "string", enum: ADMIN_BULK_KINDS }, action: { type: "string", minLength: 1, maxLength: 40 },
      reason: { type: "string", minLength: 3, maxLength: 500 },
      idempotencyKey: { type: "string", minLength: 8, maxLength: 120, pattern: "^[A-Za-z0-9._:-]+$" },
      maxItems: { type: "integer", minimum: 1, maximum: 100, default: 25 },
      scope: { type: "object", additionalProperties: false, properties: {
        moderationStatus: { type: "string", minLength: 1, maxLength: 40 }, ownerAmoriaId: { type: "string", minLength: 1, maxLength: 32 },
      } },
    },
  },
  response: { 200: { type: "object", required: ["job", "confirmationToken"], additionalProperties: false, properties: {
    job: bulkJobSchema, confirmationToken: { type: "string" },
  } } },
} as const satisfies FastifySchema;

export const adminBulkConfirmRouteSchema = {
  params: { type: "object", required: ["jobId"], additionalProperties: false, properties: { jobId: { type: "string", format: "uuid" } } },
  body: { type: "object", required: ["confirmationToken"], additionalProperties: false, properties: {
    confirmationToken: { type: "string", minLength: 32, maxLength: 256 },
  } },
  response: { 200: { type: "object", required: ["job"], additionalProperties: false, properties: { job: bulkJobSchema } } },
} as const satisfies FastifySchema;

export const adminBulkJobDetailRouteSchema = {
  params: { type: "object", required: ["jobId"], additionalProperties: false, properties: { jobId: { type: "string", format: "uuid" } } },
  response: { 200: { type: "object", required: ["job"], additionalProperties: false, properties: { job: bulkJobSchema } } },
} as const satisfies FastifySchema;

export const adminCountryScopeRouteSchema = {
  response: { 200: { type: "object", required: ["status", "countryFilteringAvailable"], additionalProperties: false, properties: {
    status: { type: "string", const: "COUNTRY_SCOPE_METADATA_MISSING" }, countryFilteringAvailable: { type: "boolean", const: false },
  } } },
} as const satisfies FastifySchema;

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) details[issue.path.join(".") || "request"] = issue.message;
  throw validationError("Request validation failed", details);
}
