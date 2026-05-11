import {
  ABOUT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PROFILE_GOALS,
  PROFILE_INTERESTS_MAX_COUNT,
  PROFILE_INTEREST_MAX_LENGTH,
  PROFILE_MOODS,
  PROFILE_PHOTOS_MAX_COUNT,
  PROFILE_URL_MAX_LENGTH,
} from "../config/constants";

const profilePhotoSchema = {
  type: "object",
  required: ["mediaId", "url"],
  additionalProperties: false,
  properties: {
    mediaId: { type: "string", format: "uuid" },
    url: { type: "string", format: "uri", maxLength: PROFILE_URL_MAX_LENGTH },
  },
} as const;

const profilePhotosSchema = {
  type: "array",
  maxItems: PROFILE_PHOTOS_MAX_COUNT,
  items: profilePhotoSchema,
} as const;

const updateProfilePhotoSchema = {
  type: "object",
  required: ["mediaId"],
  additionalProperties: false,
  properties: {
    mediaId: { type: "string", format: "uuid" },
  },
} as const;

const updateProfilePhotosSchema = {
  type: "array",
  maxItems: PROFILE_PHOTOS_MAX_COUNT,
  items: updateProfilePhotoSchema,
} as const;

const interestsSchema = {
  type: "array",
  maxItems: PROFILE_INTERESTS_MAX_COUNT,
  items: {
    type: "string",
    maxLength: PROFILE_INTEREST_MAX_LENGTH,
  },
} as const;

const nullableGoalSchema = {
  anyOf: [
    { type: "string", enum: PROFILE_GOALS },
    { type: "null" },
  ],
} as const;

const nullableMoodSchema = {
  anyOf: [
    { type: "string", enum: PROFILE_MOODS },
    { type: "null" },
  ],
} as const;

export const selfUserProfileSchema = {
  type: "object",
  required: [
    "id",
    "email",
    "displayName",
    "about",
    "amoriaId",
    "avatarUrl",
    "photos",
    "goal",
    "mood",
    "interests",
    "flirtEnabled",
    "allowAdultMode",
    "mysteryMode",
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
    photos: profilePhotosSchema,
    goal: nullableGoalSchema,
    mood: nullableMoodSchema,
    interests: interestsSchema,
    flirtEnabled: { type: "boolean" },
    allowAdultMode: { type: "boolean" },
    mysteryMode: { type: "boolean" },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const publicUserProfileSchema = {
  type: "object",
  required: [
    "id",
    "displayName",
    "amoriaId",
    "about",
    "avatarUrl",
    "photos",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    displayName: { type: "string" },
    amoriaId: { type: "string" },
    about: { type: ["string", "null"] },
    avatarUrl: { type: ["string", "null"] },
    photos: profilePhotosSchema,
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
      avatarUrl: {
        anyOf: [
          { type: "string", format: "uri", maxLength: PROFILE_URL_MAX_LENGTH },
          { type: "null" },
        ],
      },
      photos: updateProfilePhotosSchema,
      goal: nullableGoalSchema,
      mood: nullableMoodSchema,
      interests: interestsSchema,
      flirtEnabled: { type: "boolean" },
      allowAdultMode: { type: "boolean" },
      mysteryMode: { type: "boolean" },
    },
  },
  response: {
    200: selfUserProfileSchema,
  },
} as const;

export const getPublicUserByIdRouteSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
    },
  },
  response: {
    200: publicUserProfileSchema,
  },
} as const;

export const getPublicUserByAmoriaIdRouteSchema = {
  params: {
    type: "object",
    required: ["amoriaId"],
    additionalProperties: false,
    properties: {
      amoriaId: { type: "string", minLength: 1 },
    },
  },
  response: {
    200: publicUserProfileSchema,
  },
} as const;
