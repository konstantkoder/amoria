import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";

const adminTogetherQueueActionBodySchema = z
  .object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const adminTogetherSessionsQuerySchema = z
  .object({
    status: z.string().trim().max(40).optional(),
    activity: z.string().trim().max(80).optional(),
    sessionId: z.string().trim().uuid().optional(),
    limit: z.coerce.number().int().positive().max(200).default(100),
  })
  .strict();

export type AdminTogetherQueueActionBody = z.infer<typeof adminTogetherQueueActionBodySchema>;
export type AdminTogetherSessionsQuery = z.infer<typeof adminTogetherSessionsQuerySchema>;

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

export function parseAdminTogetherSessionsQuery(input: unknown): AdminTogetherSessionsQuery {
  const result = adminTogetherSessionsQuerySchema.safeParse(input);
  if (result.success) {
    return {
      ...result.data,
      status: result.data.status || undefined,
      activity: result.data.activity || undefined,
      sessionId: result.data.sessionId || undefined,
    };
  }

  throw validationError("Admin Together sessions query is invalid", {
    query: result.error.issues.map((issue) => issue.message).join("; "),
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

const adminTogetherSessionParticipantSchema = {
  type: "object",
  required: ["userId", "lastHeartbeatAt", "leftAt", "isStale"],
  additionalProperties: false,
  properties: {
    userId: { type: "string", format: "uuid" },
    lastHeartbeatAt: { type: ["string", "null"], format: "date-time" },
    leftAt: { type: ["string", "null"], format: "date-time" },
    isStale: { type: "boolean" },
  },
} as const;

const adminTogetherRevealSummarySchema = {
  type: "object",
  required: ["open", "skip", "continueStory", "pending", "total"],
  additionalProperties: false,
  properties: {
    open: { type: "integer", minimum: 0 },
    skip: { type: "integer", minimum: 0 },
    continueStory: { type: "integer", minimum: 0 },
    pending: { type: "integer", minimum: 0 },
    total: { type: "integer", minimum: 0 },
  },
} as const;

const adminTogetherSessionSchema = {
  type: "object",
  required: [
    "sessionId",
    "activity",
    "status",
    "createdAt",
    "deadlineAt",
    "endedAt",
    "endedReason",
    "sourceSessionId",
    "participantUserIds",
    "participantCount",
    "participants",
    "hasStaleParticipant",
    "eventCount",
    "strokeEventCount",
    "storyChoiceCount",
    "revealDecisions",
  ],
  additionalProperties: false,
  properties: {
    sessionId: { type: "string", format: "uuid" },
    activity: { type: "string" },
    status: { type: "string" },
    createdAt: { type: "string", format: "date-time" },
    deadlineAt: { type: ["string", "null"], format: "date-time" },
    endedAt: { type: ["string", "null"], format: "date-time" },
    endedReason: { type: ["string", "null"] },
    sourceSessionId: { type: ["string", "null"], format: "uuid" },
    participantUserIds: {
      type: "array",
      items: { type: "string", format: "uuid" },
    },
    participantCount: { type: "integer", minimum: 0 },
    participants: {
      type: "array",
      items: adminTogetherSessionParticipantSchema,
    },
    hasStaleParticipant: { type: "boolean" },
    eventCount: { type: "integer", minimum: 0 },
    strokeEventCount: { type: "integer", minimum: 0 },
    storyChoiceCount: { type: "integer", minimum: 0 },
    revealDecisions: adminTogetherRevealSummarySchema,
  },
} as const;

export const adminTogetherSessionsRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", maxLength: 40 },
      activity: { type: "string", maxLength: 80 },
      sessionId: { type: "string", format: "uuid" },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 100 },
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
          items: adminTogetherSessionSchema,
        },
        nextCursor: { type: "null" },
      },
    },
  },
} as const satisfies FastifySchema;
