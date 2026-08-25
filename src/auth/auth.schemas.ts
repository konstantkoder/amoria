import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../config/constants";
import { APP_LOCALES } from "../i18n/app-locales";

export const authUserProfileSchema = {
  type: "object",
  required: ["id", "email", "displayName", "amoriaId", "avatarUrl", "preferredLocale"],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    displayName: { type: "string" },
    amoriaId: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
    preferredLocale: { type: "string", enum: APP_LOCALES },
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
  properties: { ok: { type: "boolean", const: true } },
} as const;

const emailLocaleSchema = { type: "string", minLength: 2, maxLength: 35 } as const;
const appLocaleSchema = { type: "string", enum: APP_LOCALES } as const;
const emailSchema = { type: "string", format: "email", maxLength: 320 } as const;
const codeSchema = { type: "string", pattern: "^[0-9]{6}$" } as const;
const passwordSchema = {
  type: "string",
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
} as const;

const refreshTokenBodySchema = {
  type: "object",
  required: ["refreshToken"],
  additionalProperties: false,
  properties: { refreshToken: { type: "string", minLength: 1 } },
} as const;

export const registerRouteSchema = {
  body: {
    type: "object",
    required: ["email", "password", "displayName"],
    additionalProperties: false,
    properties: {
      email: emailSchema,
      password: passwordSchema,
      displayName: {
        type: "string",
        minLength: DISPLAY_NAME_MIN_LENGTH,
        maxLength: DISPLAY_NAME_MAX_LENGTH,
      },
      locale: emailLocaleSchema,
    },
  },
  response: {
    201: {
      type: "object",
      required: ["ok", "verificationRequired", "email", "resendAfterSec"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        verificationRequired: { type: "boolean", const: true },
        email: emailSchema,
        resendAfterSec: { type: "integer", minimum: 0 },
      },
    },
  },
} as const;

export const loginRouteSchema = {
  body: {
    type: "object",
    required: ["email", "password"],
    additionalProperties: false,
    properties: { email: emailSchema, password: passwordSchema, locale: appLocaleSchema },
  },
  response: { 200: authResponseSchema },
} as const;

export const verifyEmailRouteSchema = {
  body: {
    type: "object",
    required: ["email", "code"],
    additionalProperties: false,
    properties: { email: emailSchema, code: codeSchema },
  },
  response: { 200: authResponseSchema },
} as const;

export const resendVerificationRouteSchema = {
  body: {
    type: "object",
    required: ["email"],
    additionalProperties: false,
    properties: { email: emailSchema, locale: emailLocaleSchema },
  },
  response: {
    200: {
      type: "object",
      required: ["ok", "resendAfterSec"],
      additionalProperties: false,
      properties: {
        ok: { type: "boolean", const: true },
        resendAfterSec: { type: "integer", minimum: 0 },
      },
    },
  },
} as const;

export const passwordResetRequestRouteSchema = {
  body: resendVerificationRouteSchema.body,
  response: { 200: okResponseSchema },
} as const;

export const passwordResetConfirmRouteSchema = {
  body: {
    type: "object",
    required: ["email", "code", "newPassword"],
    additionalProperties: false,
    properties: { email: emailSchema, code: codeSchema, newPassword: passwordSchema },
  },
  response: { 200: okResponseSchema },
} as const;

export const refreshRouteSchema = { body: refreshTokenBodySchema, response: { 200: authResponseSchema } } as const;
export const logoutRouteSchema = { body: refreshTokenBodySchema, response: { 200: okResponseSchema } } as const;
export const logoutAllRouteSchema = { response: { 200: okResponseSchema } } as const;
