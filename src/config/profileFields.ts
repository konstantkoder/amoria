import type { Goal, Mood } from "@/models/User";

export const PROFILE_INTERESTS_MAX_COUNT = 20;
export const PROFILE_INTEREST_MAX_LENGTH = 32;

export const PROFILE_GOAL_OPTIONS: Goal[] = [
  "relationship",
  "dating",
  "friendship",
  "chat",
  "unsure",
];

export const PROFILE_MOOD_OPTIONS: Mood[] = [
  "romantic",
  "playful",
  "chill",
  "curious",
  "adventurous",
];

export const PROFILE_INTEREST_SUGGESTIONS = [
  "music",
  "travel",
  "coffee",
  "walks",
  "movies",
  "books",
  "sports",
  "art",
] as const;

export const GOAL_LABEL_KEYS: Record<Goal, string> = {
  relationship: "profile.goal.relationship",
  dating: "profile.goal.dating",
  friendship: "profile.goal.friendship",
  chat: "profile.goal.chat",
  unsure: "profile.goal.unsure",
};

export const MOOD_LABEL_KEYS: Record<Mood, string> = {
  romantic: "profile.mood.romantic",
  playful: "profile.mood.playful",
  chill: "profile.mood.chill",
  curious: "profile.mood.curious",
  adventurous: "profile.mood.adventurous",
};

export const GOAL_LABEL_FALLBACKS: Record<Goal, string> = {
  relationship: "Relationship",
  dating: "Dating",
  friendship: "Friendship",
  chat: "Chat",
  unsure: "Not sure yet",
};

export const MOOD_LABEL_FALLBACKS: Record<Mood, string> = {
  romantic: "Romantic",
  playful: "Playful",
  chill: "Chill",
  curious: "Curious",
  adventurous: "Adventurous",
};

export function normalizeProfileInterestInput(value: unknown): string {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}
