export const SERVICE_NAME = "amoria-api";

export const ACCESS_TOKEN_EXPIRES_IN = "15m";
export const REFRESH_TOKEN_EXPIRES_IN_DAYS = 30;

export const MAX_JSON_BODY_BYTES = 1024 * 1024;
export const MAX_AVATAR_INPUT_BYTES = 8 * 1024 * 1024;
export const AVATAR_IMAGE_SIZE = 512;
export const MAX_MEDIA_UPLOAD_BYTES = 10 * 1024 * 1024;
export const PROFILE_PHOTO_MIN_WIDTH = 256;
export const PROFILE_PHOTO_MIN_HEIGHT = 256;
export const PROFILE_PHOTO_MAX_WIDTH = 8000;
export const PROFILE_PHOTO_MAX_HEIGHT = 8000;
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

export const NEARBY_ACTIVITY_CATEGORIES = [
  "social",
  "movement",
  "team_sports",
  "nature_water",
  "culture_events",
  "hobbies",
] as const;

export const NEARBY_ACTIVITY_KEYS = [
  "coffee_nearby",
  "walk_nearby",
  "bike_nearby",
  "cinema_today",
  "talk_nearby",
  "evening_nearby",
  "roller_skating_nearby",
  "kayaking_nearby",
  "fishing_nearby",
  "sport_nearby",
  "language_exchange_nearby",
  "local_event_nearby",
  "lunch_nearby",
  "dinner_nearby",
  "dessert_nearby",
  "board_games_nearby",
  "chess_nearby",
  "book_club_nearby",
  "study_work_nearby",
  "skateboarding_nearby",
  "running_nearby",
  "gym_nearby",
  "yoga_nearby",
  "dance_nearby",
  "football_nearby",
  "basketball_nearby",
  "volleyball_nearby",
  "tennis_nearby",
  "table_tennis_nearby",
  "badminton_nearby",
  "beach_swim_nearby",
  "picnic_nearby",
  "hiking_nearby",
  "dog_walk_nearby",
  "concert_nearby",
  "museum_exhibition_nearby",
  "theater_nearby",
  "live_music_nearby",
  "festival_nearby",
  "photography_nearby",
  "cooking_nearby",
  "volunteering_nearby",
  "gaming_nearby",
] as const;

export const NEARBY_ROOM_TYPE_KEYS = NEARBY_ACTIVITY_KEYS;

export const USER_ACTIVITY_PREFERENCE_STATUSES = ["active", "disabled"] as const;
export const USER_ACTIVITY_PREFERENCE_SOURCES = ["nearby_questionnaire"] as const;

export type NearbyActivityCategory = (typeof NEARBY_ACTIVITY_CATEGORIES)[number];
export type NearbyActivityKey = (typeof NEARBY_ACTIVITY_KEYS)[number];
export type UserActivityPreferenceStatus =
  (typeof USER_ACTIVITY_PREFERENCE_STATUSES)[number];
export type UserActivityPreferenceSource =
  (typeof USER_ACTIVITY_PREFERENCE_SOURCES)[number];

export type NearbyActivityDefinition = {
  key: NearbyActivityKey;
  title: string;
  category: NearbyActivityCategory;
  sortOrder: number;
};

export const NEARBY_ACTIVITY_DEFINITIONS = [
  {
    key: "coffee_nearby",
    title: "Coffee nearby",
    category: "social",
    sortOrder: 10,
  },
  { key: "walk_nearby", title: "Walk nearby", category: "movement", sortOrder: 20 },
  { key: "bike_nearby", title: "Bike nearby", category: "movement", sortOrder: 30 },
  {
    key: "cinema_today",
    title: "Cinema today",
    category: "culture_events",
    sortOrder: 40,
  },
  { key: "talk_nearby", title: "Talk nearby", category: "social", sortOrder: 50 },
  {
    key: "evening_nearby",
    title: "Evening nearby",
    category: "social",
    sortOrder: 60,
  },
  {
    key: "roller_skating_nearby",
    title: "Roller skating nearby",
    category: "movement",
    sortOrder: 70,
  },
  {
    key: "kayaking_nearby",
    title: "Kayaking nearby",
    category: "nature_water",
    sortOrder: 80,
  },
  {
    key: "fishing_nearby",
    title: "Fishing nearby",
    category: "nature_water",
    sortOrder: 90,
  },
  { key: "sport_nearby", title: "Sport nearby", category: "movement", sortOrder: 100 },
  {
    key: "language_exchange_nearby",
    title: "Language exchange nearby",
    category: "social",
    sortOrder: 110,
  },
  {
    key: "local_event_nearby",
    title: "Local event nearby",
    category: "culture_events",
    sortOrder: 120,
  },
  { key: "lunch_nearby", title: "Lunch nearby", category: "social", sortOrder: 130 },
  { key: "dinner_nearby", title: "Dinner nearby", category: "social", sortOrder: 140 },
  { key: "dessert_nearby", title: "Dessert nearby", category: "social", sortOrder: 150 },
  {
    key: "board_games_nearby",
    title: "Board games nearby",
    category: "social",
    sortOrder: 160,
  },
  { key: "chess_nearby", title: "Chess nearby", category: "social", sortOrder: 170 },
  {
    key: "book_club_nearby",
    title: "Book club nearby",
    category: "social",
    sortOrder: 180,
  },
  {
    key: "study_work_nearby",
    title: "Study or work nearby",
    category: "social",
    sortOrder: 190,
  },
  {
    key: "skateboarding_nearby",
    title: "Skateboarding nearby",
    category: "movement",
    sortOrder: 200,
  },
  { key: "running_nearby", title: "Running nearby", category: "movement", sortOrder: 210 },
  { key: "gym_nearby", title: "Gym nearby", category: "movement", sortOrder: 220 },
  { key: "yoga_nearby", title: "Yoga nearby", category: "movement", sortOrder: 230 },
  { key: "dance_nearby", title: "Dance nearby", category: "movement", sortOrder: 240 },
  {
    key: "football_nearby",
    title: "Football nearby",
    category: "team_sports",
    sortOrder: 250,
  },
  {
    key: "basketball_nearby",
    title: "Basketball nearby",
    category: "team_sports",
    sortOrder: 260,
  },
  {
    key: "volleyball_nearby",
    title: "Volleyball nearby",
    category: "team_sports",
    sortOrder: 270,
  },
  {
    key: "tennis_nearby",
    title: "Tennis nearby",
    category: "team_sports",
    sortOrder: 280,
  },
  {
    key: "table_tennis_nearby",
    title: "Table tennis nearby",
    category: "team_sports",
    sortOrder: 290,
  },
  {
    key: "badminton_nearby",
    title: "Badminton nearby",
    category: "team_sports",
    sortOrder: 300,
  },
  {
    key: "beach_swim_nearby",
    title: "Beach or swim nearby",
    category: "nature_water",
    sortOrder: 310,
  },
  {
    key: "picnic_nearby",
    title: "Picnic nearby",
    category: "nature_water",
    sortOrder: 320,
  },
  {
    key: "hiking_nearby",
    title: "Hiking nearby",
    category: "nature_water",
    sortOrder: 330,
  },
  {
    key: "dog_walk_nearby",
    title: "Dog walk nearby",
    category: "nature_water",
    sortOrder: 340,
  },
  {
    key: "concert_nearby",
    title: "Concert nearby",
    category: "culture_events",
    sortOrder: 350,
  },
  {
    key: "museum_exhibition_nearby",
    title: "Museum or exhibition nearby",
    category: "culture_events",
    sortOrder: 360,
  },
  {
    key: "theater_nearby",
    title: "Theater nearby",
    category: "culture_events",
    sortOrder: 370,
  },
  {
    key: "live_music_nearby",
    title: "Live music nearby",
    category: "culture_events",
    sortOrder: 380,
  },
  {
    key: "festival_nearby",
    title: "Festival nearby",
    category: "culture_events",
    sortOrder: 390,
  },
  {
    key: "photography_nearby",
    title: "Photography nearby",
    category: "hobbies",
    sortOrder: 400,
  },
  { key: "cooking_nearby", title: "Cooking nearby", category: "hobbies", sortOrder: 410 },
  {
    key: "volunteering_nearby",
    title: "Volunteering nearby",
    category: "hobbies",
    sortOrder: 420,
  },
  { key: "gaming_nearby", title: "Gaming nearby", category: "hobbies", sortOrder: 430 },
] as const satisfies readonly NearbyActivityDefinition[];

export const TOGETHER_QUEUE_TTL_MS = 5 * 60 * 1000;
export const TOGETHER_HEARTBEAT_TIMEOUT_MS = 60 * 1000;
export const TOGETHER_ACTIVITIES = ["draw", "story_sparks"] as const;
export const TOGETHER_EVENT_TYPES = ["stroke_batch", "story_choice", "system"] as const;
export const TOGETHER_REVEAL_DECISIONS = ["open", "skip", "continue_story"] as const;
export const TOGETHER_RADIUS_KM_VALUES = [5, 25, 100, 250] as const;
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
export const MIN_ADULT_AGE = 18;
export const MAX_PROFILE_AGE = 120;
export const AGE_GROUPS = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;
export const PROFILE_GENDERS = ["woman", "man", "nonbinary"] as const;

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 40;
export const ABOUT_MAX_LENGTH = 500;

export const MAX_PROFILE_GALLERY_PHOTOS = 15;
export const MAX_LOCKED_PROFILE_PHOTOS = 10;
export const PROFILE_PHOTOS_MAX_COUNT = MAX_PROFILE_GALLERY_PHOTOS;
export const MIN_VISIBLE_PROFILE_IMAGES_FOR_LOCKED_GALLERY = 3;
export const LOCKED_GALLERY_UNLOCK_EXPIRES_IN_SEC = 10 * 60;
export const LOCKED_GALLERY_WRONG_ATTEMPT_LIMIT = 5;
export const LOCKED_GALLERY_WRONG_ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
export const LOCKED_GALLERY_RATE_LIMIT_BLOCK_MS = 15 * 60 * 1000;
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
