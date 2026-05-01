import { DISPLAY_NAME_MAX_LENGTH, DISPLAY_NAME_MIN_LENGTH, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../config/constants";

export const authUserProfileSchema = {
  type: "object",
  required: ["id", "email", "displayName", "amoriaId", "avatarUrl", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    displayName: { type: "string" },
    amoriaId: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const authResponseSchema = {
  type: "object",
  required: ["accessToken", "user"],
  additionalProperties: false,
  properties: {
    accessToken: { type: "string" },
    user: authUserProfileSchema,
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
