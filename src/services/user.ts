import type { AgeGroup, Goal, Mood, UserProfile, UserProfilePhoto } from "@/models/User";
import { ApiError } from "@/services/api/apiClient";
import { refreshBackendUser } from "@/services/api/backendSession";
import { patchMeProfileOnBackend } from "@/services/api/profileApi";
import {
  getPublicUserByAmoriaId,
  getPublicUserById as fetchPublicUserById,
} from "@/services/api/publicUsersApi";
import {
  clearBackendSession,
  getBackendAccessToken,
  loadBackendSession,
  saveBackendSession,
} from "@/services/api/sessionStorage";
import type {
  AuthUserDto,
  PatchProfileRequest,
  ProfilePhotoPatchDto,
  PublicUserProfileDto,
  SelfUserProfileDto,
} from "@/services/api/types";
import {
  getPublicMediaUrlInfo,
  normalizePublicMediaUrl,
} from "@/services/media/mediaUrl";
import { uploadUserAvatar } from "@/services/storage";

const AMORIA_ID_RE = /^AM-?[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;
const LEGACY_NICKNAME_RE = /^nick\.[a-z]+(\.[a-z]+)?\.\d{3}$/;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 30;
const GOAL_VALUES: Goal[] = [
  "relationship",
  "dating",
  "friendship",
  "chat",
  "unsure",
];
const MOOD_VALUES: Mood[] = [
  "romantic",
  "playful",
  "chill",
  "curious",
  "adventurous",
];
const AGE_GROUP_VALUES: AgeGroup[] = ["18-24", "25-34", "35-44", "45-54", "55+"];
const MIN_ADULT_AGE = 18;
const MAX_PROFILE_AGE = 120;

function normalizeString(value: unknown) {
  return String(value ?? "").trim();
}

export function normalizeDisplayNameInput(value: unknown) {
  return normalizeString(value).replace(/\s+/g, " ");
}

function normalizeStoredDisplayName(value: unknown) {
  const displayName = normalizeDisplayNameInput(value);
  return LEGACY_NICKNAME_RE.test(displayName) ? "" : displayName;
}

export function getDisplayNameValidationErrorKey(value: unknown) {
  const normalized = normalizeDisplayNameInput(value);
  if (normalized.length < DISPLAY_NAME_MIN_LENGTH) return "profile.nameTooShort";
  if (normalized.length > DISPLAY_NAME_MAX_LENGTH) return "profile.nameTooLong";
  return "";
}

export function hasCompleteDisplayName(profile?: Pick<UserProfile, "displayName"> | null) {
  return !getDisplayNameValidationErrorKey(profile?.displayName ?? "");
}

function assertValidDisplayName(value: unknown) {
  const normalized = normalizeDisplayNameInput(value);
  const errorKey = getDisplayNameValidationErrorKey(normalized);
  if (errorKey) throw new Error(errorKey);
  return normalized;
}

function normalizeOptionalString(value: unknown) {
  const normalized = normalizeString(value);
  return normalized || undefined;
}

function normalizeSharedMediaUrl(value: unknown) {
  return normalizePublicMediaUrl(value, "profile media URL");
}

function samePublicMediaReference(left: unknown, right: unknown) {
  const leftInfo = getPublicMediaUrlInfo(left, "avatar URL");
  const rightInfo = getPublicMediaUrlInfo(right, "avatar URL");
  if (leftInfo.mediaId && rightInfo.mediaId) {
    return leftInfo.mediaId === rightInfo.mediaId;
  }

  return Boolean(leftInfo.url && rightInfo.url && leftInfo.url === rightInfo.url);
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
}

function normalizeProfilePhotos(value: unknown): UserProfilePhoto[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as {
        id?: unknown;
        mediaId?: unknown;
        url?: unknown;
      };
      const mediaId = normalizeString(candidate.mediaId ?? candidate.id);
      const url = normalizeSharedMediaUrl(candidate.url);
      if (!mediaId || !url) return null;
      const position = Number((candidate as { position?: unknown }).position);
      const visibility = (candidate as { visibility?: unknown }).visibility;

      return {
        mediaId,
        url,
        ...(Number.isInteger(position) && position >= 0 ? { position } : {}),
        ...(visibility === "public" || visibility === "locked" ? { visibility } : {}),
      };
    })
    .filter((entry): entry is UserProfilePhoto => Boolean(entry));
}

function toBackendProfilePhotos(value: unknown): ProfilePhotoPatchDto[] {
  return normalizeProfilePhotos(value)
    .map((photo) => {
      const mediaId = normalizeString(photo.mediaId);
      if (!mediaId) return null;
      return { mediaId };
    })
    .filter((entry): entry is ProfilePhotoPatchDto => Boolean(entry));
}

function normalizeGoal(value: unknown): Goal | undefined {
  return GOAL_VALUES.includes(value as Goal) ? (value as Goal) : undefined;
}

function normalizeMood(value: unknown): Mood | undefined {
  return MOOD_VALUES.includes(value as Mood) ? (value as Mood) : undefined;
}

function normalizeAgeGroup(value: unknown): AgeGroup | undefined {
  return AGE_GROUP_VALUES.includes(value as AgeGroup) ? (value as AgeGroup) : undefined;
}

function normalizeBirthDate(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const normalized = normalizeString(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function normalizeAge(value: unknown): number | null {
  const age = Number(value);
  return Number.isInteger(age) && age >= MIN_ADULT_AGE && age <= MAX_PROFILE_AGE
    ? age
    : null;
}

function normalizePreferredAgeBound(value: unknown): number | undefined {
  const age = Number(value);
  return Number.isInteger(age) && age >= MIN_ADULT_AGE && age <= MAX_PROFILE_AGE
    ? age
    : undefined;
}

function normalizeAmoriaId(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  return AMORIA_ID_RE.test(normalized) ? normalized : "";
}

function normalizeBackendTimestamp(value: unknown, fallback: number) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

function mapBackendUserProfile(
  user: AuthUserDto | SelfUserProfileDto | PublicUserProfileDto
): UserProfile {
  const now = Date.now();
  const backendFields = user as Partial<{
    createdAt: string;
    updatedAt: string;
    goal: Goal | null;
    mood: Mood | null;
    interests: string[];
    allowAdultMode: boolean;
    flirtEnabled: boolean;
    mysteryMode: boolean;
    birthDate: string | null;
    age: number | null;
    ageGroup: AgeGroup | null;
    preferredAgeMin: number;
    preferredAgeMax: number | null;
  }>;
  const createdAt = normalizeBackendTimestamp(backendFields.createdAt, now);
  const updatedAt = normalizeBackendTimestamp(backendFields.updatedAt, createdAt);
  const amoriaId = normalizeAmoriaId(user.amoriaId);
  const about = normalizeOptionalString(user.about);
  const avatarUrl = normalizeSharedMediaUrl(user.avatarUrl);
  const goal = normalizeGoal(backendFields.goal);
  const mood = normalizeMood(backendFields.mood);
  const birthDate = normalizeBirthDate(backendFields.birthDate);
  const age = normalizeAge(backendFields.age);
  const ageGroup = normalizeAgeGroup(backendFields.ageGroup);
  const preferredAgeMin = normalizePreferredAgeBound(backendFields.preferredAgeMin);
  const preferredAgeMax = backendFields.preferredAgeMax === null
    ? null
    : normalizePreferredAgeBound(backendFields.preferredAgeMax);

  return {
    id: normalizeString(user.id),
    displayName: normalizeStoredDisplayName(user.displayName),
    amoriaId,
    ...(about ? { about } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    interests: normalizeStringArray(backendFields.interests),
    photos: normalizeProfilePhotos(user.photos),
    ...("lockedGallery" in user && user.lockedGallery
      ? {
          lockedGallery: {
            enabled: Boolean(user.lockedGallery.enabled),
            count: Math.max(Number(user.lockedGallery.count ?? 0), 0),
          },
        }
      : {}),
    ...(mood ? { mood } : {}),
    ...(goal ? { goal } : {}),
    ...(birthDate !== undefined ? { birthDate } : {}),
    ...(age !== null ? { age } : {}),
    ...(ageGroup ? { ageGroup } : {}),
    ...(preferredAgeMin !== undefined ? { preferredAgeMin } : {}),
    ...(preferredAgeMax !== undefined ? { preferredAgeMax } : {}),
    createdAt,
    updatedAt,
    allowAdultMode: Boolean(backendFields.allowAdultMode),
    flirtEnabled: Boolean(backendFields.flirtEnabled),
    mysteryMode: Boolean(backendFields.mysteryMode),
  };
}

function isBackendAuthError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

const BACKEND_PROFILE_FIELD_KEYS = new Set([
  "displayName",
  "about",
  "goal",
  "mood",
  "interests",
  "photos",
  "birthDate",
  "preferredAgeMin",
  "preferredAgeMax",
  "flirtEnabled",
  "allowAdultMode",
  "mysteryMode",
]);

function getUnsupportedBackendProfileFields(fields: Partial<UserProfile>) {
  return Object.keys(fields).filter((key) => !BACKEND_PROFILE_FIELD_KEYS.has(key));
}

async function getCurrentBackendUserProfile() {
  const session = await refreshBackendUser();
  return session ? mapBackendUserProfile(session.user) : null;
}

async function updateBackendSupportedProfileFields(
  fields: Partial<UserProfile>
): Promise<UserProfile | null> {
  const input: PatchProfileRequest = {};
  if ("displayName" in fields) {
    input.displayName = assertValidDisplayName(fields.displayName);
  }
  if ("about" in fields) {
    const about = normalizeString(fields.about);
    input.about = about || null;
  }
  if ("goal" in fields) {
    input.goal = normalizeGoal(fields.goal) ?? null;
  }
  if ("mood" in fields) {
    input.mood = normalizeMood(fields.mood) ?? null;
  }
  if ("interests" in fields) {
    input.interests = normalizeStringArray(fields.interests);
  }
  if ("photos" in fields) {
    input.photos = toBackendProfilePhotos(fields.photos);
  }
  if ("birthDate" in fields) {
    input.birthDate = fields.birthDate ? normalizeBirthDate(fields.birthDate) ?? null : null;
  }
  if ("preferredAgeMin" in fields || "preferredAgeMax" in fields) {
    const min = normalizePreferredAgeBound(fields.preferredAgeMin) ?? MIN_ADULT_AGE;
    const rawMax = fields.preferredAgeMax;
    const max = rawMax === null || rawMax === undefined
      ? null
      : normalizePreferredAgeBound(rawMax) ?? null;
    input.preferredAgeMin = min;
    input.preferredAgeMax = max;
  }
  if ("allowAdultMode" in fields) {
    input.allowAdultMode = Boolean(fields.allowAdultMode);
  }
  if ("flirtEnabled" in fields) {
    input.flirtEnabled = Boolean(fields.flirtEnabled);
  }
  if ("mysteryMode" in fields) {
    input.mysteryMode = Boolean(fields.mysteryMode);
  }

  if (!Object.keys(input).length) {
    return getCurrentBackendUserProfile();
  }

  try {
    const user = await patchMeProfileOnBackend(input);
    const accessToken = await getBackendAccessToken();
    if (!accessToken) return null;
    await saveBackendSession({ accessToken, user });
    return mapBackendUserProfile(user);
  } catch (error) {
    if (isBackendAuthError(error)) {
      await clearBackendSession();
      return null;
    }

    throw error;
  }
}

export async function createUserProfileForRegistration(displayName: string): Promise<UserProfile> {
  return getUserProfile();
}

export async function getCurrentUser() {
  const profile = await getUserProfile();
  return profile;
}

export async function updateMySettings(patch: Record<string, any>) {
  return updateUserFields(patch);
}

export async function getUserProfile(): Promise<UserProfile> {
  const backendProfile = await getCurrentBackendUserProfile();
  if (!backendProfile) {
    throw new Error("auth.sessionRequired");
  }

  return backendProfile;
}

export async function updateUserFields(
  fields: Partial<UserProfile>
): Promise<UserProfile> {
  const backendSession = await loadBackendSession();
  if (backendSession) {
    const unsupportedFields = getUnsupportedBackendProfileFields(fields);
    if (!unsupportedFields.length) {
      const updatedProfile = await updateBackendSupportedProfileFields(fields);
      if (updatedProfile) return updatedProfile;
    }

    throw new Error("profile.fieldUnsupportedByBackend");
  }

  throw new Error("auth.sessionRequired");
}

export async function updateUserDisplayName(displayName: string): Promise<UserProfile> {
  return updateUserFields({ displayName });
}

export function hasBirthDate(profile?: Pick<UserProfile, "birthDate"> | null): boolean {
  return Boolean(profile?.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate));
}

export async function updateUserBirthDate(birthDate: string): Promise<UserProfile> {
  return updateUserFields({ birthDate });
}

export async function getUserProfileById(id: string): Promise<UserProfile | null> {
  const stableId = normalizeString(id);
  if (!stableId) return null;

  try {
    const stableAmoriaId = normalizeAmoriaId(stableId);
    const user = stableAmoriaId
      ? await getPublicUserByAmoriaId(stableAmoriaId)
      : await fetchPublicUserById(stableId);
    return mapBackendUserProfile(user);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

export async function updateUserAvatarUrl(avatarUrl: string): Promise<UserProfile> {
  const sharedAvatarUrl = normalizeSharedMediaUrl(avatarUrl);
  if (!sharedAvatarUrl) {
    throw new Error("profile.avatarSharedUrlRequired");
  }

  const backendSession = await loadBackendSession();
  if (backendSession) {
    if (samePublicMediaReference(backendSession.user.avatarUrl, sharedAvatarUrl)) {
      return mapBackendUserProfile(backendSession.user);
    }

    const refreshedSession = await refreshBackendUser();
    if (samePublicMediaReference(refreshedSession?.user.avatarUrl, sharedAvatarUrl)) {
      return mapBackendUserProfile(refreshedSession.user);
    }
  }

  throw new Error("profile.avatarUnsupportedByBackend");
}

export async function uploadCurrentUserAvatar(uri: string): Promise<UserProfile> {
  const backendSession = await loadBackendSession();
  if (backendSession) {
    const avatarUrl = await uploadUserAvatar(backendSession.user.id, uri);
    return updateUserAvatarUrl(avatarUrl);
  }

  throw new Error("auth.sessionRequired");
}

export async function updateUserPhotos(
  photos: UserProfilePhoto[]
): Promise<UserProfile> {
  return updateUserFields({ photos: normalizeProfilePhotos(photos) });
}

export async function updateFlirtSettings(
  allowAdultMode: boolean,
  flirtEnabled: boolean
): Promise<UserProfile> {
  return updateUserFields({
    allowAdultMode,
    flirtEnabled: allowAdultMode && flirtEnabled,
  });
}
