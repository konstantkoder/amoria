import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../config/constants";

export const authUserProfileSchema = {
  type: "object",
  required: ["id", "email", "displayName", "amoriaId", "avatarUrl"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    displayName: { type: "string" },
    amoriaId: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
  },
} as const;

export const authResponseSchema = {
  type: "object",
  required: ["accessToken", "refreshToken", "accessTokenExpiresAt", "user"],
  additionalProperties: false,
  properties: {
    accessToken: { type: "string" },
    refreshToken: { type: "string" },
    accessTokenExpiresAt: { type: "string", format: "date-time" },
    user: authUserProfileSchema,
  },
} as const;

export const okResponseSchema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: {
    ok: { type: "boolean", const: true },
  },
} as const;

const refreshTokenBodySchema = {
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: {
    refreshToken: { type: "string", minLength: 1 },
  },
} as const;

export const registerRouteSchema = {
  body: {
    type: "object",
    required: ["email", "password", "displayName"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email" },
      password: {
        type: "string",
        minLength: PASSWORD_MIN_LENGTH,
        maxLength: PASSWORD_MAX_LENGTH,
      },
      displayName: {
        type: "string",
        minLength: DISPLAY_NAME_MIN_LENGTH,
        maxLength: DISPLAY_NAME_MAX_LENGTH,
      },
    },
  },
  response: {
    201: authResponseSchema,
  },
} as const;

export const loginRouteSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: {
      email: { type: "string", format: "email" },
      password: {
        type: "string",
        minLength: PASSWORD_MIN_LENGTH,
        maxLength: PASSWORD_MAX_LENGTH,
      },
    },
  },
  response: {
    200: authResponseSchema,
  },
} as const;

export const refreshRouteSchema = {
  body: refreshTokenBodySchema,
  response: {
    200: authResponseSchema,
  },
} as const;

export const logoutRouteSchema = {
  body: refreshTokenBodySchema,
  response: {
    200: okResponseSchema,
  },
} as const;

export const logoutAllRouteSchema = {
  response: {
    200: okResponseSchema,
  },
} as const;
