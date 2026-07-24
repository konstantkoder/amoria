import type { FastifySchema } from "fastify";
import { z } from "zod";
import { MAX_PROFILE_AGE, MIN_ADULT_AGE } from "../config/constants";
import { validationError } from "../common/errors";
import type { TurnBasedActionBody, TurnBasedStartBody } from "./together-turn-based.types";

const ageRange = z.object({
  min: z.number().int().min(MIN_ADULT_AGE).max(MAX_PROFILE_AGE),
  max: z.number().int().min(MIN_ADULT_AGE).max(MAX_PROFILE_AGE).nullable(),
}).strict().refine((v) => v.max === null || v.max >= v.min, { path: ["max"] });

const start = z.object({
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    radiusKm: z.union([z.literal(5), z.literal(25), z.literal(100), z.literal(250), z.null()]),
  }).strict(),
  preferredAgeRange: ageRange.optional(),
  clientRequestId: z.string().trim().min(1).max(128),
}).strict();

const action = z.object({
  clientActionId: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(1).max(500).optional(),
}).strict();

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw validationError("Request validation failed", Object.fromEntries(
    result.error.issues.map((issue) => [issue.path.join(".") || "body", issue.message]),
  ));
}

export const parseTurnBasedStartBody = (input: unknown): TurnBasedStartBody => parse(start, input);
export const parseTurnBasedActionBody = (input: unknown): TurnBasedActionBody => parse(action, input);

const params = { type: "object", required: ["id"], additionalProperties: false, properties: {
  id: { type: "string", format: "uuid" },
} } as const;
const bodyAction = { type: "object", required: ["clientActionId"], additionalProperties: false, properties: {
  clientActionId: { type: "string", minLength: 1, maxLength: 200 },
  reason: { type: "string", minLength: 1, maxLength: 500 },
} } as const;
export const turnBasedStartRouteSchema = { body: {
  type: "object", required: ["location", "clientRequestId"], additionalProperties: false, properties: {
    clientRequestId: { type: "string", minLength: 1, maxLength: 128 },
    location: { type: "object", required: ["latitude", "longitude", "radiusKm"], additionalProperties: false, properties: {
      latitude: { type: "number", minimum: -90, maximum: 90 },
      longitude: { type: "number", minimum: -180, maximum: 180 },
      radiusKm: { anyOf: [{ type: "integer", enum: [5,25,100,250] }, { type: "null" }] },
    } },
    preferredAgeRange: { type: "object", required: ["min","max"], additionalProperties: false, properties: {
      min: { type: "integer", minimum: 18, maximum: 120 },
      max: { anyOf: [{ type: "integer", minimum: 18, maximum: 120 }, { type: "null" }] },
    } },
  },
} } as const satisfies FastifySchema;
export const turnBasedCurrentRouteSchema = {} as const satisfies FastifySchema;
export const turnBasedMomentRouteSchema = { params } as const satisfies FastifySchema;
export const turnBasedActionRouteSchema = { params, body: bodyAction } as const satisfies FastifySchema;
