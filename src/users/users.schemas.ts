import {
  ABOUT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
} from "../config/constants";

export const selfUserProfileSchema = {
  type: "object",
  required: [
    "id",
    "email",
    "displayName",
    "about",
    "amoriaId",
    "avatarUrl",
    "createdAt",
    "updatedAt",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    displayName: { type: "string" },
    about: { type: ["string", "null"] },
    amoriaId: { type: "string" },
    avatarUrl: { type: ["string", "null"] },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const getMeRouteSchema = {
  response: {
    200: selfUserProfileSchema,
  },
} as const;

export const updateProfileRouteSchema = {
  body: {
    type: "object",
    minProperties: 1,
    additionalProperties: false,
    properties: {
      displayName: {
        type: "string",
        minLength: DISPLAY_NAME_MIN_LENGTH,
        maxLength: DISPLAY_NAME_MAX_LENGTH,
      },
      about: {
        anyOf: [
          { type: "string", maxLength: ABOUT_MAX_LENGTH },
          { type: "null" },
        ],
      },
    },
  },
  response: {
    200: selfUserProfileSchema,
  },
} as const;
