import { selfUserProfileSchema } from "../users/users.schemas";

export const avatarUploadResponseSchema = {
  type: "object",
  required: ["avatarUrl", "user"],
  additionalProperties: false,
  properties: {
    avatarUrl: { type: "string", format: "uri" },
    user: selfUserProfileSchema,
  },
} as const;

export const uploadAvatarRouteSchema = {
  consumes: ["multipart/form-data"],
  response: {
    200: avatarUploadResponseSchema,
  },
} as const;
