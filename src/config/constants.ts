export const SERVICE_NAME = "amoria-api";

export const ACCESS_TOKEN_EXPIRES_IN = "15m";
export const REFRESH_TOKEN_EXPIRES_IN_DAYS = 30;

export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_AVATAR_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_AVATAR_DIMENSION = 1024;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const ABOUT_MAX_LENGTH = 500;

export const PROFILE_PHOTOS_MAX_COUNT = 9;
export const PROFILE_URL_MAX_LENGTH = 2048;
export const PROFILE_INTERESTS_MAX_COUNT = 20;
export const PROFILE_INTEREST_MAX_LENGTH = 32;
export const PROFILE_GOALS = [
  "relationship",
  "dating",
  "friendship",
  "chat",
  "unsure",
] as const;
export const PROFILE_MOODS = [
  "romantic",
  "playful",
  "chill",
  "curious",
  "adventurous",
] as const;

export const AMORIA_ID_PREFIX = "AM";
export const AMORIA_ID_LENGTH = 5;
export const AMORIA_ID_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
