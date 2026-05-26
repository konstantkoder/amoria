import {
  ABOUT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  MAX_LOCKED_PROFILE_PHOTOS,
  MAX_PROFILE_GALLERY_PHOTOS,
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
    url: { type: "string", maxLength: PROFILE_URL_MAX_LENGTH },
  },
} as const;

const profilePhotosSchema = {
  type: "array",
  maxItems: PROFILE_PHOTOS_MAX_COUNT,
  items: profilePhotoSchema,
} as const;

const galleryPhotoSchema = {
  type: "object",
  required: ["mediaId", "url", "position"],
  additionalProperties: false,
  properties: {
    mediaId: { type: "string", format: "uuid" },
    url: { type: "string", maxLength: PROFILE_URL_MAX_LENGTH },
    position: { type: "integer", minimum: 0 },
  },
} as const;

const publicGalleryPhotosSchema = {
  type: "array",
  maxItems: PROFILE_PHOTOS_MAX_COUNT,
  items: galleryPhotoSchema,
} as const;

const ownerGalleryPhotoSchema = {
  type: "object",
  required: ["mediaId", "url", "position", "galleryItemId", "visibility", "mimeType"],
  additionalProperties: false,
  properties: {
    mediaId: { type: "string", format: "uuid" },
    url: { type: "string", maxLength: PROFILE_URL_MAX_LENGTH },
    position: { type: "integer", minimum: 0 },
    galleryItemId: { type: "string", format: "uuid" },
    visibility: { type: "string", enum: ["public", "locked"] },
    mimeType: { type: "string" },
  },
} as const;

const ownerGalleryPhotosSchema = {
  type: "array",
  maxItems: PROFILE_PHOTOS_MAX_COUNT,
  items: ownerGalleryPhotoSchema,
} as const;

const lockedGallerySummarySchema = {
  type: "object",
  required: ["enabled", "count"],
  additionalProperties: false,
  properties: {
    enabled: { type: "boolean" },
    count: { type: "integer", minimum: 0 },
  },
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
    "lockedGallery",
  ],
  additionalProperties: false,
  properties: {
    id: { type: "string", format: "uuid" },
    displayName: { type: "string" },
    amoriaId: { type: "string" },
    about: { type: ["string", "null"] },
    avatarUrl: { type: ["string", "null"] },
    photos: publicGalleryPhotosSchema,
    lockedGallery: lockedGallerySummarySchema,
  },
} as const;

export const ownerProfileGallerySchema = {
  type: "object",
  required: [
    "publicPhotos",
    "lockedPhotos",
    "lockedFolderEnabled",
    "lockedPhotosCount",
    "visibleImagesCount",
    "minVisibleImagesRequired",
    "maxProfileGalleryPhotos",
    "maxLockedProfilePhotos",
  ],
  additionalProperties: false,
  properties: {
    publicPhotos: ownerGalleryPhotosSchema,
    lockedPhotos: ownerGalleryPhotosSchema,
    lockedFolderEnabled: { type: "boolean" },
    lockedPhotosCount: { type: "integer", minimum: 0 },
    visibleImagesCount: { type: "integer", minimum: 0 },
    minVisibleImagesRequired: { type: "integer", minimum: 1 },
    maxProfileGalleryPhotos: { type: "integer", const: MAX_PROFILE_GALLERY_PHOTOS },
    maxLockedProfilePhotos: { type: "integer", const: MAX_LOCKED_PROFILE_PHOTOS },
  },
} as const;

const okSchema = {
  type: "object",
  required: ["ok"],
  additionalProperties: false,
  properties: {
    ok: { type: "boolean" },
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
          { type: "string", maxLength: PROFILE_URL_MAX_LENGTH },
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

export const getOwnerProfileGalleryRouteSchema = {
  response: {
    200: ownerProfileGallerySchema,
  },
} as const;

export const updateOwnerProfileGalleryItemsRouteSchema = {
  body: {
    type: "object",
    required: ["items"],
    additionalProperties: false,
    properties: {
      items: {
        type: "array",
        maxItems: PROFILE_PHOTOS_MAX_COUNT,
        items: {
          type: "object",
          required: ["mediaId", "visibility"],
          additionalProperties: false,
          properties: {
            mediaId: { type: "string", format: "uuid" },
            visibility: { type: "string", enum: ["public", "locked"] },
            position: { type: "integer", minimum: 0 },
          },
        },
      },
    },
  },
  response: {
    200: ownerProfileGallerySchema,
  },
} as const;

export const setLockedGalleryPasswordRouteSchema = {
  body: {
    type: "object",
    required: ["currentAccountPassword", "newFolderPassword"],
    additionalProperties: false,
    properties: {
      currentAccountPassword: { type: "string", minLength: 1 },
      newFolderPassword: { type: "string", minLength: 8 },
    },
  },
  response: {
    200: okSchema,
  },
} as const;

export const resetLockedGalleryPasswordRouteSchema = {
  body: {
    type: "object",
    required: ["currentAccountPassword"],
    additionalProperties: false,
    properties: {
      currentAccountPassword: { type: "string", minLength: 1 },
    },
  },
  response: {
    200: okSchema,
  },
} as const;

export const unlockLockedGalleryRouteSchema = {
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: { type: "string", format: "uuid" },
    },
  },
  body: {
    type: "object",
    required: ["password"],
    additionalProperties: false,
    properties: {
      password: { type: "string", minLength: 1 },
    },
  },
  response: {
    200: {
      type: "object",
      required: ["photos"],
      additionalProperties: false,
      properties: {
        photos: publicGalleryPhotosSchema,
      },
    },
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
