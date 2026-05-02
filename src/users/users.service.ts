import { AppError, unauthorized, validationError } from "../common/errors";
import {
  type ProfileGoal,
  type ProfileMood,
  normalizeDisplayName,
  normalizeOptionalAbout,
  normalizeOptionalBoolean,
  normalizeOptionalGoal,
  normalizeOptionalInterests,
  normalizeOptionalMood,
  normalizeOptionalPhotos,
  normalizeOptionalUrl,
} from "../common/validators";
import type { ProfilePhoto, UserRow } from "../db/schema";
import { findUserByAmoriaId, findUserById, updateUserProfile } from "./users.repo";

export type SelfUserProfile = {
  id: string;
  email: string;
  displayName: string;
  about: string | null;
  amoriaId: string;
  avatarUrl: string | null;
  photos: ProfilePhoto[];
  goal: ProfileGoal | null;
  mood: ProfileMood | null;
  interests: string[];
  flirtEnabled: boolean;
  allowAdultMode: boolean;
  mysteryMode: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PublicUserProfile = Omit<SelfUserProfile, "email" | "allowAdultMode">;

export type UpdateProfileBody = {
  displayName?: string;
  about?: string | null;
  avatarUrl?: string | null;
  photos?: ProfilePhoto[];
  goal?: ProfileGoal | null;
  mood?: ProfileMood | null;
  interests?: string[];
  flirtEnabled?: boolean;
  allowAdultMode?: boolean;
  mysteryMode?: boolean;
};

type UserProfileUpdate = Partial<Pick<
  UserRow,
  | "displayName"
  | "about"
  | "avatarUrl"
  | "photos"
  | "goal"
  | "mood"
  | "interests"
  | "flirtEnabled"
  | "allowAdultMode"
  | "mysteryMode"
>>;

export function toSelfUserProfile(user: UserRow): SelfUserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    about: user.about,
    amoriaId: user.amoriaId,
    avatarUrl: user.avatarUrl,
    photos: user.photos,
    goal: toProfileGoal(user.goal),
    mood: toProfileMood(user.mood),
    interests: user.interests,
    flirtEnabled: user.flirtEnabled,
    allowAdultMode: user.allowAdultMode,
    mysteryMode: user.mysteryMode,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function toPublicUserProfile(user: UserRow): PublicUserProfile {
  const { email: _email, allowAdultMode: _allowAdultMode, ...profile } = toSelfUserProfile(user);
  return profile;
}

export async function getCurrentUser(userId: string): Promise<SelfUserProfile> {
  const user = await findUserById(userId);
  if (!user) {
    throw unauthorized("User no longer exists");
  }

  return toSelfUserProfile(user);
}

export async function getPublicUserById(userId: string): Promise<PublicUserProfile> {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError("not_found", "User not found", 404);
  }

  return toPublicUserProfile(user);
}

export async function getPublicUserByAmoriaId(amoriaId: string): Promise<PublicUserProfile> {
  const user = await findUserByAmoriaId(amoriaId);
  if (!user) {
    throw new AppError("not_found", "User not found", 404);
  }

  return toPublicUserProfile(user);
}

export async function updateCurrentUserProfile(
  userId: string,
  input: UpdateProfileBody,
): Promise<SelfUserProfile> {
  const update: UserProfileUpdate = {};

  if ("displayName" in input) {
    setIfDefined(update, "displayName", normalizeDisplayName(input.displayName));
  }

  if ("about" in input) {
    setIfDefined(update, "about", normalizeOptionalAbout(input.about));
  }

  if ("avatarUrl" in input) {
    setIfDefined(update, "avatarUrl", normalizeOptionalUrl(input.avatarUrl, "avatarUrl"));
  }

  if ("photos" in input) {
    setIfDefined(update, "photos", normalizeOptionalPhotos(input.photos));
  }

  if ("goal" in input) {
    setIfDefined(update, "goal", normalizeOptionalGoal(input.goal));
  }

  if ("mood" in input) {
    setIfDefined(update, "mood", normalizeOptionalMood(input.mood));
  }

  if ("interests" in input) {
    setIfDefined(update, "interests", normalizeOptionalInterests(input.interests));
  }

  if ("flirtEnabled" in input) {
    setIfDefined(
      update,
      "flirtEnabled",
      normalizeOptionalBoolean(input.flirtEnabled, "flirtEnabled"),
    );
  }

  if ("allowAdultMode" in input) {
    setIfDefined(
      update,
      "allowAdultMode",
      normalizeOptionalBoolean(input.allowAdultMode, "allowAdultMode"),
    );
  }

  if ("mysteryMode" in input) {
    setIfDefined(update, "mysteryMode", normalizeOptionalBoolean(input.mysteryMode, "mysteryMode"));
  }

  if (Object.keys(update).length === 0) {
    throw validationError("At least one profile field is required", {
      body: "empty",
    });
  }

  const updated = await updateUserProfile(userId, update);
  if (!updated) {
    throw unauthorized("User no longer exists");
  }

  return toSelfUserProfile(updated);
}

function toProfileGoal(value: string | null): ProfileGoal | null {
  return value as ProfileGoal | null;
}

function toProfileMood(value: string | null): ProfileMood | null {
  return value as ProfileMood | null;
}

function setIfDefined<K extends keyof UserProfileUpdate>(
  update: UserProfileUpdate,
  key: K,
  value: UserProfileUpdate[K] | undefined,
): void {
  if (value !== undefined) {
    update[key] = value;
  }
}
