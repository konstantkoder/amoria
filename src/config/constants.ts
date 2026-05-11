export const SERVICE_NAME = "amoria-api";

export const ACCESS_TOKEN_EXPIRES_IN = "15m";
export const REFRESH_TOKEN_EXPIRES_IN_DAYS = 30;

export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_AVATAR_INPUT_BYTES = 8 * 1024 * 1024;
export const MAX_AVATAR_DIMENSION = 1024;
export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MEDIA_UPLOAD_EXPIRES_IN_SEC = 10 * 60;
export const MEDIA_UPLOAD_PURPOSES = [
  "avatar",
  "profile_photo",
  "announcement_photo",
  "together_asset",
] as const;
export const MEDIA_UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const CHAT_SOURCE_TYPES = ["announcement", "nearby", "together"] as const;
export const CHAT_MESSAGE_TEXT_MAX_LENGTH = 2000;
export const CHAT_CLIENT_MESSAGE_ID_MAX_LENGTH = 200;

export const TOGETHER_QUEUE_TTL_MS = 5 * 60 * 1000;
export const TOGETHER_HEARTBEAT_TIMEOUT_MS = 60 * 1000;
export const TOGETHER_ACTIVITIES = ["draw"] as const;
export const TOGETHER_EVENT_TYPES = ["stroke_batch", "palette", "system"] as const;
export const TOGETHER_REVEAL_DECISIONS = ["open", "skip"] as const;
export const TOGETHER_SESSION_STATUSES = [
  "active",
  "finished",
  "abandoned",
  "cancelled",
] as const;
export const TOGETHER_CLIENT_EVENT_ID_MAX_LENGTH = 200;
export const TOGETHER_EVENT_PAYLOAD_MAX_BYTES = 64 * 1024;
export const TOGETHER_HISTORY_LIMIT_DEFAULT = 30;
export const TOGETHER_HISTORY_LIMIT_MAX = 100;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const ABOUT_MAX_LENGTH = 500;

export const PROFILE_PHOTOS_MAX_COUNT = 9;
export const MIN_VISIBLE_PROFILE_IMAGES_FOR_LOCKED_GALLERY = 3;
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
