import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";

const adminTogetherQueueActionBodySchema = z
  .object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

export type AdminTogetherQueueActionBody = z.infer<typeof adminTogetherQueueActionBodySchema>;

export function parseAdminTogetherQueueActionBody(
  input: unknown,
): AdminTogetherQueueActionBody {
  const result = adminTogetherQueueActionBodySchema.safeParse(input);
  if (result.success) {
    return result.data;
  }

  throw validationError("Admin Together queue action payload is invalid", {
    body: result.error.issues.map((issue) => issue.message).join("; "),
  });
}

export const adminOpsHealthRouteSchema = {
  response: {
    200: {
      type: "object",
      required: [
        "ok",
        "service",
        "time",
        "admin",
        "nodeEnv",
        "database",
        "objectStorage",
        "counts",
      ],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        service: { type: "string", const: "amoria-admin-ops" },
        time: { type: "string", format: "date-time" },
        admin: {
          type: "object",
          required: ["id", "userId", "roles"],
          additionalProperties: false,
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            roles: { type: "array", items: { type: "string" } },
          },
        },
        nodeEnv: { type: "string" },
        database: {
          type: "object",
          required: ["ok"],
          additionalProperties: false,
          properties: {
            ok: { type: "boolean" },
          },
        },
        objectStorage: {
          type: "object",
          required: ["status", "reason"],
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["ok", "failed", "not_checked"] },
            reason: { type: "string" },
          },
        },
        counts: {
          type: "object",
          required: ["openClientErrors", "openReports", "pendingMediaModerationItems"],
          additionalProperties: false,
          properties: {
            openClientErrors: { type: ["integer", "null"], minimum: 0 },
            openReports: { type: ["integer", "null"], minimum: 0 },
            pendingMediaModerationItems: { type: ["integer", "null"], minimum: 0 },
          },
        },
      },
    },
  },
} as const satisfies FastifySchema;

const adminTogetherQueueEntrySchema = {
  type: "object",
  required: [
    "entryId",
    "userId",
    "activity",
    "status",
    "radiusKm",
    "hasCoordinates",
    "createdAt",
    "expiresAt",
    "matchedSessionId",
  ],
  additionalProperties: false,
  properties: {
    entryId: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    activity: { type: "string" },
    status: { type: "string" },
    radiusKm: { type: ["integer", "null"], enum: [5, 25, 100, 250, null] },
    hasCoordinates: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
    matchedSessionId: { type: ["string", "null"], format: "uuid" },
  },
} as const;

export const adminTogetherQueueRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: adminTogetherQueueEntrySchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminTogetherQueueActionRouteSchema = {
  body: {
    type: "object",
    required: ["action", "reason"],
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: ["cancel"] },
      reason: { type: "string", minLength: 1, maxLength: 500 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["ok", "entry"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        entry: adminTogetherQueueEntrySchema,
      },
    },
  },
} as const satisfies FastifySchema;
