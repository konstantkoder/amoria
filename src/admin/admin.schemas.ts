import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import { ADMIN_ROLE_KEYS, type AdminUserSearchQuery } from "./admin.types";

export const adminUserSearchQuerySchema = z
  .object({
    amoriaId: z.string().trim().min(1).max(32).optional(),
    q: z.string().trim().min(1).max(120).optional(),
    limit: z.coerce.number().int().positive().max(100).default(30),
  })
  .strict()
  .refine((value) => value.amoriaId || value.q, {
    message: "amoriaId or q is required",
    path: ["q"],
  });

export const adminAuditLogQuerySchema = z
  .object({
    limit: z.coerce.number().int().positive().max(100).default(50),
  })
  .strict();

export function parseAdminUserSearchQuery(input: unknown): AdminUserSearchQuery {
  return parseWithValidation(adminUserSearchQuerySchema, input);
}

export function parseAdminAuditLogLimit(input: unknown): number {
  return parseWithValidation(adminAuditLogQuerySchema, input).limit;
}

const adminUserWithRolesSchema = {
  type: "object",
  required: ["id", "userId", "status", "roles", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    status: { type: "string", enum: ["active", "disabled"] },
    roles: {
      type: "array",
      items: { type: "string", enum: ADMIN_ROLE_KEYS },
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const adminSafeUserSchema = {
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

const adminUserSearchItemSchema = {
  type: "object",
  required: ["id", "amoriaId", "displayName", "email", "avatarUrl", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    amoriaId: { type: "string" },
    displayName: { type: "string" },
    email: { type: "string", format: "email" },
    avatarUrl: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const adminAuditLogItemSchema = {
  type: "object",
  required: [
    "id",
    "adminUserId",
    "action",
    "targetType",
    "targetId",
    "reason",
    "metadata",
    "requestId",
    "ipAddress",
    "userAgent",
    "createdAt",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    adminUserId: { type: ["string", "null"], format: "uuid" },
    action: { type: "string" },
    targetType: { type: ["string", "null"] },
    targetId: { type: ["string", "null"] },
    reason: { type: ["string", "null"] },
    metadata: {
      anyOf: [
        { type: "object", additionalProperties: true },
        { type: "array", items: {} },
        { type: "string" },
        { type: "number" },
        { type: "boolean" },
        { type: "null" },
      ],
    },
    requestId: { type: ["string", "null"] },
    ipAddress: { type: ["string", "null"] },
    userAgent: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
  },
} as const;

export const adminHealthRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["ok", "service", "time", "admin"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        service: { type: "string", const: "amoria-admin" },
        time: { type: "string", format: "date-time" },
        admin: {
          type: "object",
          required: ["id", "userId", "roles"],
          additionalProperties: false,
          properties: {
            id: { type: "string", format: "uuid" },
            userId: { type: "string", format: "uuid" },
            roles: {
              type: "array",
              items: { type: "string", enum: ADMIN_ROLE_KEYS },
            },
          },
        },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminMeRouteSchema = {
  response: {
    200: {
      type: "object",
      required: ["adminUser", "user"],
      additionalProperties: false,
      properties: {
        adminUser: adminUserWithRolesSchema,
        user: adminSafeUserSchema,
      },
    },
  },
} as const satisfies FastifySchema;

export const adminUsersSearchRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      amoriaId: { type: "string", minLength: 1, maxLength: 32 },
      q: { type: "string", minLength: 1, maxLength: 120 },
      limit: { type: "integer", minimum: 1, maximum: 100, default: 30 },
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
          items: adminUserSearchItemSchema,
        },
      },
    },
  },
} as const satisfies FastifySchema;

export const adminAuditLogRouteSchema = {
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
      required: ["items", "nextCursor"],
      additionalProperties: false,
      properties: {
        items: {
          type: "array",
          items: adminAuditLogItemSchema,
        },
        nextCursor: { type: "null" },
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
    details[issue.path.join(".") || "query"] = issue.message;
  }

  throw validationError("Request validation failed", details);
}
