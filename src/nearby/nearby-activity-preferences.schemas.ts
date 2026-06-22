import type { FastifySchema } from "fastify";
import { z } from "zod";
import {
  NEARBY_ACTIVITY_KEYS,
  USER_ACTIVITY_PREFERENCE_SOURCES,
  USER_ACTIVITY_PREFERENCE_STATUSES,
} from "../config/constants";
import { validationError } from "../common/errors";
import type { UpdateNearbyActivityPreferencesBody } from "./nearby-activity-preferences.types";

const GEO_BUCKET_MAX_LENGTH = 160;
const ACTIVITY_PREFERENCES_MAX_ITEMS = 100;

const activityPreferenceInputSchema = z
  .object({
    activityKey: z.enum(NEARBY_ACTIVITY_KEYS),
    geoBucket: z.string().trim().min(1).max(GEO_BUCKET_MAX_LENGTH).nullable().optional(),
  })
  .strict();

export const updateNearbyActivityPreferencesBodySchema = z
  .object({
    preferences: z
      .array(activityPreferenceInputSchema)
      .max(ACTIVITY_PREFERENCES_MAX_ITEMS),
  })
  .strict()
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const [index, preference] of value.preferences.entries()) {
      const key = `${preference.activityKey}:${preference.geoBucket ?? ""}`;
      if (seen.has(key)) {
        ctx.addIssue({
          code: "custom",
          path: ["preferences", index],
          message: "Duplicate activity preference",
        });
        continue;
      }
      seen.add(key);
    }
  });

export function parseUpdateNearbyActivityPreferencesBody(
  input: unknown,
): UpdateNearbyActivityPreferencesBody {
  return parseWithValidation(updateNearbyActivityPreferencesBodySchema, input);
}

const nearbyActivitySchema = {
  type: "object",
  required: ["activityKey", "title"],
  additionalProperties: false,
  properties: {
    activityKey: { type: "string", enum: NEARBY_ACTIVITY_KEYS },
    title: { type: "string" },
  },
} as const;

const nearbyActivityPreferenceSchema = {
  type: "object",
  required: ["activityKey", "status", "geoBucket", "source", "updatedAt"],
  additionalProperties: false,
  properties: {
    activityKey: { type: "string", enum: NEARBY_ACTIVITY_KEYS },
    status: { type: "string", enum: USER_ACTIVITY_PREFERENCE_STATUSES },
    geoBucket: { type: ["string", "null"] },
    source: { type: "string", enum: USER_ACTIVITY_PREFERENCE_SOURCES },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

const nearbyActivityPreferencesResponseSchema = {
  type: "object",
  required: ["availableActivities", "preferences"],
  additionalProperties: false,
  properties: {
    availableActivities: {
      type: "array",
      items: nearbyActivitySchema,
    },
    preferences: {
      type: "array",
      items: nearbyActivityPreferenceSchema,
    },
  },
} as const;

export const getNearbyActivityPreferencesRouteSchema = {
  response: {
    200: nearbyActivityPreferencesResponseSchema,
  },
} as const satisfies FastifySchema;

export const updateNearbyActivityPreferencesRouteSchema = {
  body: {
    type: "object",
    required: ["preferences"],
    additionalProperties: false,
    properties: {
      preferences: {
        type: "array",
        maxItems: ACTIVITY_PREFERENCES_MAX_ITEMS,
        items: {
          type: "object",
          required: ["activityKey"],
          additionalProperties: false,
          properties: {
            activityKey: { type: "string", enum: NEARBY_ACTIVITY_KEYS },
            geoBucket: {
              anyOf: [
                { type: "string", minLength: 1, maxLength: GEO_BUCKET_MAX_LENGTH },
                { type: "null" },
              ],
            },
          },
        },
      },
    },
  },
  response: {
    200: nearbyActivityPreferencesResponseSchema,
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
