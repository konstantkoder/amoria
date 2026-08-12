import type { FastifySchema } from "fastify";
import { z } from "zod";
import { validationError } from "../common/errors";
import {
  AGE_GROUPS,
  MAX_PROFILE_AGE,
  MIN_ADULT_AGE,
} from "../config/constants";

const adminTogetherQueueActionBodySchema = z
  .object({
    action: z.literal("cancel"),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

const adminTogetherQueueGeoModeSchema = z.enum([
  "no_limit_with_location",
  "finite_with_location",
  "missing_location_invalid_old_entry",
]);

const adminTogetherQueueWaitingReasonValues = [
  "no_candidate",
  "activity_mismatch",
  "radius_distance_too_far",
  "missing_coordinates_old_entry",
  "same_user_excluded",
  "candidate_expired",
  "candidate_cancelled",
  "location_required",
  "age_mismatch",
  "gender_mismatch",
  "missing_user_age",
  "missing_age_preference",
  "missing_gender",
  "missing_preferred_genders",
  "unknown",
] as const;

const adminTogetherQueueCancelSourceValues = [
  "user_stop",
  "user_back",
  "retry_restart",
  "radius_expansion",
  "screen_cleanup",
  "navigation_blur",
  "admin_cancel",
  "server_expired",
  "matched",
  "unknown",
] as const;

const nearbyFeedExclusionReasonValues = [
  "self",
  "blocked",
  "visibility_off",
  "visibility_expired",
  "distance_too_far",
  "age_mismatch",
  "gender_mismatch",
  "missing_birth_date",
  "missing_gender",
  "missing_preferred_genders",
] as const;

const nearbyProfileMissingReasonValues = [
  "missing_birth_date",
  "missing_gender",
  "missing_preferred_genders",
  "missing_avatar",
  "missing_display_name",
] as const;

const adminTogetherQueueQuerySchema = z
  .object({
    status: z.string().trim().max(40).optional(),
    activity: z.string().trim().max(80).optional(),
    radiusKm: z
      .union([
        z.literal("none"),
        z.literal("null"),
        z.coerce.number().int().refine((value) => [5, 25, 100, 250].includes(value)),
      ])
      .optional(),
    geoMode: adminTogetherQueueGeoModeSchema.optional(),
    hasCoordinates: z
      .enum(["true", "false"])
      .transform((value) => value === "true")
      .optional(),
    ageGroup: z.enum(AGE_GROUPS).optional(),
    waitingReason: z.enum(adminTogetherQueueWaitingReasonValues).optional(),
    limit: z.coerce.number().int().positive().max(200).default(100),
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
export type AdminTogetherQueueQuery = {
  status?: string;
  activity?: string;
  radiusKm?: number | null;
  geoMode?: z.infer<typeof adminTogetherQueueGeoModeSchema>;
  hasCoordinates?: boolean;
  ageGroup?: (typeof AGE_GROUPS)[number];
  waitingReason?: (typeof adminTogetherQueueWaitingReasonValues)[number];
  limit: number;
};
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

export function parseAdminTogetherQueueQuery(input: unknown): AdminTogetherQueueQuery {
  const result = adminTogetherQueueQuerySchema.safeParse(input);
  if (result.success) {
    const radiusValue = result.data.radiusKm;
    return {
      status: result.data.status || undefined,
      activity: result.data.activity || undefined,
      radiusKm:
        radiusValue === "none" || radiusValue === "null"
          ? null
          : typeof radiusValue === "number"
            ? radiusValue
            : undefined,
      geoMode: result.data.geoMode,
      hasCoordinates: result.data.hasCoordinates,
      ageGroup: result.data.ageGroup,
      waitingReason: result.data.waitingReason,
      limit: result.data.limit,
    };
  }

  throw validationError("Admin Together queue query is invalid", {
    query: result.error.issues.map((issue) => issue.message).join("; "),
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
        "smtp",
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
          required: ["status", "checkedAt"],
          additionalProperties: false,
          properties: {
            status: {
              type: "string",
              enum: ["ok", "not_configured", "error", "not_checked"],
            },
            checkedAt: { type: "string", format: "date-time" },
            reason: {
              type: "string",
              enum: ["missing_config", "safe_check_unavailable"],
            },
            errorCode: {
              type: "string",
              enum: [
                "access_denied",
                "bucket_not_found",
                "credentials_error",
                "health_check_exception",
                "request_failed",
                "storage_check_failed",
              ],
            },
          },
        },
        smtp: {
          type: "object",
          required: ["status", "checkedAt"],
          additionalProperties: false,
          properties: {
            status: { type: "string", enum: ["ok", "error"] },
            checkedAt: { type: "string", format: "date-time" },
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

const nullableCountSchema = { type: ["integer", "null"], minimum: 0 } as const;

const adminReleaseDashboardCountsSchema = {
  reports: {
    type: "object",
    required: ["open", "underReview", "escalated"],
    additionalProperties: false,
    properties: {
      open: nullableCountSchema,
      underReview: nullableCountSchema,
      escalated: nullableCountSchema,
    },
  },
  clientErrors: {
    type: "object",
    required: ["open"],
    additionalProperties: false,
    properties: {
      open: nullableCountSchema,
    },
  },
  mediaModeration: {
    type: "object",
    required: ["pending"],
    additionalProperties: false,
    properties: {
      pending: nullableCountSchema,
    },
  },
  togetherQueue: {
    type: "object",
    required: ["waiting"],
    additionalProperties: false,
    properties: {
      waiting: nullableCountSchema,
    },
  },
  togetherSessions: {
    type: "object",
    required: ["active", "recent24h"],
    additionalProperties: false,
    properties: {
      active: nullableCountSchema,
      recent24h: nullableCountSchema,
    },
  },
} as const;

export const adminReleaseDashboardRouteSchema = {
  response: {
    200: {
      type: "object",
      required: [
        "ok",
        "service",
        "time",
        "admin",
        "health",
        "reports",
        "clientErrors",
        "mediaModeration",
        "togetherQueue",
        "togetherSessions",
        "nearby",
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
        health: {
          type: "object",
          required: ["apiStatus", "databaseStatus", "objectStorage", "smtp"],
          additionalProperties: false,
          properties: {
            apiStatus: { type: "string", const: "ok" },
            databaseStatus: { type: "string", enum: ["ok", "failed"] },
            objectStorage: {
              type: "object",
              required: ["status", "checkedAt"],
              additionalProperties: false,
              properties: {
                status: {
                  type: "string",
                  enum: ["ok", "not_configured", "error", "not_checked"],
                },
                checkedAt: { type: "string", format: "date-time" },
                reason: {
                  type: "string",
                  enum: ["missing_config", "safe_check_unavailable"],
                },
                errorCode: {
                  type: "string",
                  enum: [
                    "access_denied",
                    "bucket_not_found",
                    "credentials_error",
                    "health_check_exception",
                    "request_failed",
                    "storage_check_failed",
                  ],
                },
              },
            },
            smtp: {
              type: "object",
              required: ["status", "checkedAt"],
              additionalProperties: false,
              properties: {
                status: { type: "string", enum: ["ok", "error"] },
                checkedAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
        reports: adminReleaseDashboardCountsSchema.reports,
        clientErrors: adminReleaseDashboardCountsSchema.clientErrors,
        mediaModeration: adminReleaseDashboardCountsSchema.mediaModeration,
        togetherQueue: adminReleaseDashboardCountsSchema.togetherQueue,
        togetherSessions: adminReleaseDashboardCountsSchema.togetherSessions,
        nearby: {
          type: "object",
          required: [
            "checkedAt",
            "activeVisibilityCount",
            "offVisibilityCount",
            "expiredVisibilityCount",
            "profileReadinessMissingCount",
          ],
          additionalProperties: false,
          properties: {
            checkedAt: { type: ["string", "null"], format: "date-time" },
            activeVisibilityCount: nullableCountSchema,
            offVisibilityCount: nullableCountSchema,
            expiredVisibilityCount: nullableCountSchema,
            profileReadinessMissingCount: nullableCountSchema,
          },
        },
      },
    },
  },
} as const satisfies FastifySchema;

const adminNearbyProfileReadinessMissingSchema = {
  type: "object",
  required: [
    "missingBirthDate",
    "missingGender",
    "missingPreferredGenders",
    "missingAvatar",
    "missingDisplayName",
  ],
  additionalProperties: false,
  properties: {
    missingBirthDate: { type: "integer", minimum: 0 },
    missingGender: { type: "integer", minimum: 0 },
    missingPreferredGenders: { type: "integer", minimum: 0 },
    missingAvatar: { type: "integer", minimum: 0 },
    missingDisplayName: { type: "integer", minimum: 0 },
  },
} as const;

const adminNearbyFeedExclusionReasonsSchema = {
  type: "object",
  required: nearbyFeedExclusionReasonValues,
  additionalProperties: false,
  properties: {
    self: { type: "integer", minimum: 0 },
    blocked: { type: "integer", minimum: 0 },
    visibility_off: { type: "integer", minimum: 0 },
    visibility_expired: { type: "integer", minimum: 0 },
    distance_too_far: { type: "integer", minimum: 0 },
    age_mismatch: { type: "integer", minimum: 0 },
    gender_mismatch: { type: "integer", minimum: 0 },
    missing_birth_date: { type: "integer", minimum: 0 },
    missing_gender: { type: "integer", minimum: 0 },
    missing_preferred_genders: { type: "integer", minimum: 0 },
  },
} as const;

const adminNearbyProfileReadinessItemSchema = {
  type: "object",
  required: [
    "amoriaId",
    "displayName",
    "emailMasked",
    "missingReasons",
    "visibilityStatus",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    amoriaId: { type: "string" },
    displayName: { type: ["string", "null"] },
    emailMasked: { type: ["string", "null"] },
    missingReasons: {
      type: "array",
      minItems: 1,
      items: { type: "string", enum: nearbyProfileMissingReasonValues },
    },
    visibilityStatus: { type: "string", enum: ["active", "off", "expired", "none"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const adminNearbyDiagnosticsRouteSchema = {
  response: {
    200: {
      type: "object",
      required: [
        "ok",
        "status",
        "checkedAt",
        "activeVisibilityCount",
        "offVisibilityCount",
        "expiredVisibilityCount",
        "recentlyUpdatedCount",
        "profileReadinessMissing",
        "profileReadinessItems",
        "feedExclusionReasons",
      ],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        status: { type: "string", const: "ok" },
        checkedAt: { type: "string", format: "date-time" },
        activeVisibilityCount: { type: "integer", minimum: 0 },
        offVisibilityCount: { type: "integer", minimum: 0 },
        expiredVisibilityCount: { type: "integer", minimum: 0 },
        recentlyUpdatedCount: { type: "integer", minimum: 0 },
        profileReadinessMissing: adminNearbyProfileReadinessMissingSchema,
        profileReadinessItems: {
          type: "array",
          maxItems: 200,
          items: adminNearbyProfileReadinessItemSchema,
        },
        feedExclusionReasons: adminNearbyFeedExclusionReasonsSchema,
      },
    },
  },
} as const satisfies FastifySchema;

const adminTogetherQueueEntrySchema = {
  type: "object",
  required: [
    "entryId",
    "userId",
    "amoriaId",
    "displayName",
    "activity",
    "status",
    "radiusKm",
    "hasCoordinates",
    "geoMode",
    "userAgeGroup",
    "preferredAgeRange",
    "waitingReason",
    "cancelledAt",
    "cancelSource",
    "cancelReason",
    "lastAction",
    "lastActionAt",
    "lastClientPollAt",
    "ageSeconds",
    "createdAt",
    "expiresAt",
    "matchedSessionId",
  ],
  additionalProperties: false,
  properties: {
    entryId: { type: "string", format: "uuid" },
    userId: { type: "string", format: "uuid" },
    amoriaId: { type: ["string", "null"] },
    displayName: { type: ["string", "null"] },
    activity: { type: "string" },
    status: { type: "string" },
    radiusKm: { type: ["integer", "null"], enum: [5, 25, 100, 250, null] },
    hasCoordinates: { type: "boolean" },
    geoMode: {
      type: "string",
      enum: [
        "no_limit_with_location",
        "finite_with_location",
        "missing_location_invalid_old_entry",
      ],
    },
    userAgeGroup: {
      anyOf: [
        { type: "string", enum: AGE_GROUPS },
        { type: "null" },
      ],
    },
    preferredAgeRange: {
      anyOf: [
        {
          type: "object",
          required: ["min", "max"],
          additionalProperties: false,
          properties: {
            min: { type: "integer", minimum: MIN_ADULT_AGE, maximum: MAX_PROFILE_AGE },
            max: {
              anyOf: [
                { type: "integer", minimum: MIN_ADULT_AGE, maximum: MAX_PROFILE_AGE },
                { type: "null" },
              ],
            },
          },
        },
        { type: "null" },
      ],
    },
    waitingReason: {
      type: "string",
      enum: adminTogetherQueueWaitingReasonValues,
    },
    cancelledAt: { type: ["string", "null"], format: "date-time" },
    cancelSource: {
      type: ["string", "null"],
      enum: [...adminTogetherQueueCancelSourceValues, null],
    },
    cancelReason: { type: ["string", "null"] },
    lastAction: { type: ["string", "null"] },
    lastActionAt: { type: ["string", "null"], format: "date-time" },
    lastClientPollAt: { type: ["string", "null"], format: "date-time" },
    ageSeconds: { type: "integer", minimum: 0 },
    createdAt: { type: "string", format: "date-time" },
    expiresAt: { type: "string", format: "date-time" },
    matchedSessionId: { type: ["string", "null"], format: "uuid" },
  },
} as const;

export const adminTogetherQueueRouteSchema = {
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      status: { type: "string", maxLength: 40 },
      activity: { type: "string", maxLength: 80 },
      radiusKm: {
        anyOf: [
          { type: "integer", enum: [5, 25, 100, 250] },
          { type: "string", enum: ["none", "null"] },
        ],
      },
      geoMode: {
        type: "string",
        enum: [
          "no_limit_with_location",
          "finite_with_location",
          "missing_location_invalid_old_entry",
        ],
      },
      hasCoordinates: { type: "string", enum: ["true", "false"] },
      ageGroup: { type: "string", enum: AGE_GROUPS },
      waitingReason: { type: "string", enum: adminTogetherQueueWaitingReasonValues },
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
    "lastHeartbeatAt",
    "leftAt",
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
    lastHeartbeatAt: { type: ["string", "null"], format: "date-time" },
    leftAt: { type: ["string", "null"], format: "date-time" },
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
