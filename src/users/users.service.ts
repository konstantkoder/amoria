import { AppError, unauthorized, validationError } from "../common/errors";
import {
  type ProfileGoal,
  type ProfileMood,
  type ProfilePhotoInput,
  normalizeDisplayName,
  normalizeOptionalAbout,
  normalizeOptionalBoolean,
  normalizeOptionalGoal,
  normalizeOptionalInterests,
  normalizeOptionalMood,
  normalizeOptionalPhotos,
  normalizeOptionalUrl,
} from "../common/validators";
import type { MediaFileRow, ProfilePhoto, UserRow } from "../db/schema";
import {
  findOwnedMediaFileByUrl,
  findOwnedMediaFilesByIds,
} from "../media/media.repo";
import {
  mediaIdFromPublicMediaReference,
  publicMediaUrlForMediaId,
} from "../media/media-url";
import { headObject } from "../media/object-storage";
import { env } from "../config/env";
import { isBlockedEitherWay } from "../safety/safety.repo";
import * as profileGalleryService from "./profile-gallery.service";
import {
  calculateAge,
  getAgeGroup,
  normalizeOptionalBirthDate,
  normalizePreferredAgeBounds,
  type AgeGroup,
} from "./age";
import * as usersRepo from "./users.repo";

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
  birthDate: string | null;
  age: number | null;
  ageGroup: AgeGroup | null;
  preferredAgeMin: number;
  preferredAgeMax: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PublicUserProfile = Pick<
  SelfUserProfile,
  "id" | "displayName" | "amoriaId" | "about" | "avatarUrl" | "photos"
> & {
  ageGroup: AgeGroup | null;
  lockedGallery: profileGalleryService.LockedGallerySummary;
};

export type UpdateProfileBody = {
  displayName?: string;
  about?: string | null;
  avatarUrl?: string | null;
  photos?: ProfilePhotoInput[];
  goal?: ProfileGoal | null;
  mood?: ProfileMood | null;
  interests?: string[];
  flirtEnabled?: boolean;
  allowAdultMode?: boolean;
  mysteryMode?: boolean;
  birthDate?: string | null;
  preferredAgeMin?: number;
  preferredAgeMax?: number | null;
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
  | "birthDate"
  | "preferredAgeMin"
  | "preferredAgeMax"
>>;

const avatarMediaTypes = new Set(["avatar", "profile_avatar"]);

type UsersServiceDeps = {
  repo: typeof usersRepo;
  findOwnedMediaFileByUrl: typeof findOwnedMediaFileByUrl;
  findOwnedMediaFilesByIds: typeof findOwnedMediaFilesByIds;
  headObject: typeof headObject;
  isBlockedEitherWay: typeof isBlockedEitherWay;
  gallery: Pick<
    typeof profileGalleryService,
    "getPublicGalleryForUser" | "replacePublicGalleryPhotosFromProfilePatch"
  >;
};

const defaultDeps: UsersServiceDeps = {
  repo: usersRepo,
  findOwnedMediaFileByUrl,
  findOwnedMediaFilesByIds,
  headObject,
  isBlockedEitherWay,
  gallery: profileGalleryService,
};

let deps: UsersServiceDeps = defaultDeps;

export function __setUsersServiceDepsForTests(
  overrides: Partial<UsersServiceDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export function toSelfUserProfile(user: UserRow): SelfUserProfile {
  const age = calculateAge(user.birthDate);
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
    birthDate: user.birthDate,
    age,
    ageGroup: getAgeGroup(age),
    preferredAgeMin: user.preferredAgeMin,
    preferredAgeMax: user.preferredAgeMax,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function toPublicUserProfile(user: UserRow): Promise<PublicUserProfile> {
  const gallery = await deps.gallery.getPublicGalleryForUser(user.id);
  const age = calculateAge(user.birthDate);
  return {
    id: user.id,
    displayName: user.displayName,
    amoriaId: user.amoriaId,
    about: user.about,
    avatarUrl: await toCurrentAvatarUrl(user),
    photos: gallery.photos,
    ageGroup: getAgeGroup(age),
    lockedGallery: gallery.lockedGallery,
  };
}

export async function getCurrentUser(userId: string): Promise<SelfUserProfile> {
  const user = await deps.repo.findUserById(userId);
  if (!user) {
    throw unauthorized("User no longer exists");
  }

  return toSelfUserProfile(user);
}

export async function getPublicUserById(
  currentUserId: string,
  targetUserId: string,
): Promise<PublicUserProfile> {
  const user = await deps.repo.findUserById(targetUserId);
  if (!user) {
    throw new AppError("not_found", "User not found", 404);
  }

  await assertPublicProfileVisible(currentUserId, user.id);
  return toPublicUserProfile(user);
}

export async function getPublicUserByAmoriaId(
  currentUserId: string,
  amoriaId: string,
): Promise<PublicUserProfile> {
  const user = await deps.repo.findUserByAmoriaId(amoriaId);
  if (!user) {
    throw new AppError("not_found", "User not found", 404);
  }

  await assertPublicProfileVisible(currentUserId, user.id);
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
    setIfDefined(update, "avatarUrl", await normalizeOwnedAvatarUrl(userId, input.avatarUrl));
  }

  if ("photos" in input) {
    const photos = await normalizeOwnedPhotos(userId, input.photos);
    if (photos) {
      await deps.gallery.replacePublicGalleryPhotosFromProfilePatch(userId, photos);
    }
    setIfDefined(update, "photos", photos);
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

  if ("birthDate" in input) {
    setIfDefined(update, "birthDate", normalizeOptionalBirthDate(input.birthDate));
  }

  if ("preferredAgeMin" in input || "preferredAgeMax" in input) {
    const range = normalizePreferredAgeBounds(
      input.preferredAgeMin ?? 18,
      input.preferredAgeMax ?? null,
    );
    setIfDefined(update, "preferredAgeMin", range.min);
    setIfDefined(update, "preferredAgeMax", range.max);
  }

  if (Object.keys(update).length === 0) {
    throw validationError("At least one profile field is required", {
      body: "empty",
    });
  }

  const updated = await deps.repo.updateUserProfile(userId, update);
  if (!updated) {
    throw unauthorized("User no longer exists");
  }

  return toSelfUserProfile(updated);
}

async function assertPublicProfileVisible(
  currentUserId: string,
  targetUserId: string,
): Promise<void> {
  if (currentUserId === targetUserId) {
    return;
  }

  if (await deps.isBlockedEitherWay(currentUserId, targetUserId)) {
    throw new AppError("profile_unavailable", "Profile is unavailable", 403);
  }
}

async function normalizeOwnedAvatarUrl(
  userId: string,
  avatarUrl: unknown,
): Promise<string | null | undefined> {
  const normalized = normalizeOptionalMediaReference(avatarUrl, "avatarUrl");
  if (!normalized) {
    return normalized;
  }

  const mediaId = mediaIdFromPublicMediaReference(normalized);
  const [mediaFromId] = mediaId
    ? await deps.findOwnedMediaFilesByIds(userId, [mediaId]).catch(() => [])
    : [];
  const media = mediaFromId ?? (await deps.findOwnedMediaFileByUrl(userId, normalized));
  if (!media || !avatarMediaTypes.has(media.type)) {
    throw mediaNotOwned("avatarUrl");
  }

  return publicMediaUrlForMediaId(media.id);
}

async function toCurrentAvatarUrl(user: Pick<UserRow, "id" | "avatarUrl">): Promise<string | null> {
  if (!user.avatarUrl) {
    return null;
  }

  const mediaId = mediaIdFromPublicMediaReference(user.avatarUrl);
  const [mediaFromId] = mediaId
    ? await deps.findOwnedMediaFilesByIds(user.id, [mediaId]).catch(() => [])
    : [];
  const media = mediaFromId ??
    (await deps.findOwnedMediaFileByUrl(user.id, user.avatarUrl).catch(() => undefined));
  if (!media || !avatarMediaTypes.has(media.type)) {
    return null;
  }
  if (!await mediaObjectExists(media)) {
    return null;
  }

  return publicMediaUrlForMediaId(media.id);
}

async function mediaObjectExists(media: Pick<MediaFileRow, "path">): Promise<boolean> {
  try {
    await deps.headObject({
      bucket: env.S3_BUCKET,
      key: media.path,
    });
    return true;
  } catch (error) {
    if (error instanceof AppError && (
      error.code === "not_found" ||
      error.code === "internal_error" ||
      error.code === "storage_read_failed"
    )) {
      return false;
    }

    throw error;
  }
}

async function normalizeOwnedPhotos(
  userId: string,
  photos: unknown,
): Promise<ProfilePhoto[] | undefined> {
  const normalized = normalizeOptionalPhotos(photos);
  if (!normalized) {
    return normalized;
  }

  const mediaIds = normalized.map((photo) => photo.mediaId);
  const ownedMedia = await deps.findOwnedMediaFilesByIds(userId, [...new Set(mediaIds)]);
  const ownedMediaById = new Map(ownedMedia.map((media) => [media.id, media]));

  if (mediaIds.some((mediaId) => !ownedMediaById.has(mediaId))) {
    throw mediaNotOwned("photos");
  }

  return mediaIds.map((mediaId) => {
    const media = ownedMediaById.get(mediaId);
    if (!media) {
      throw mediaNotOwned("photos");
    }

    return {
      mediaId,
      url: publicMediaUrlForMediaId(media.id),
    };
  });
}

function mediaNotOwned(field: "avatarUrl" | "photos"): AppError {
  return new AppError("media_not_owned", "Media file is not owned by current user", 403, {
    [field]: "media_not_owned",
  });
}

function normalizeOptionalMediaReference(
  value: unknown,
  field: string,
): string | null | undefined {
  if (typeof value === "string" && value.trim().startsWith("/media/public/")) {
    return value.trim();
  }

  return normalizeOptionalUrl(value, field);
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
