import { doc, getDoc } from "firebase/firestore";

import { db } from "@/config/firebaseConfig";
import type { Goal, Mood, UserProfile, UserProfilePhoto } from "@/models/User";
import { ApiError } from "@/services/api/apiClient";
import { refreshBackendUser } from "@/services/api/backendSession";
import { patchMeProfileOnBackend } from "@/services/api/profileApi";
import {
  clearBackendSession,
  getBackendAccessToken,
  loadBackendSession,
  saveBackendSession,
} from "@/services/api/sessionStorage";
import type {
  AuthUserDto,
  PatchProfileRequest,
  ProfilePhotoDto,
  SelfUserProfileDto,
} from "@/services/api/types";
import { uploadUserAvatar } from "@/services/storage";

const USERS_COLLECTION = "users";
const AMORIA_ID_RE = /^AM-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{5}$/;
const LEGACY_NICKNAME_RE = /^nick\.[a-z]+(\.[a-z]+)?\.\d{3}$/;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 30;
const GOAL_VALUES: Goal[] = [
  "dating",
  "friends",
  "chat",
  "long_term",
  "short_term",
  "casual",
  "sex",
];
const MOOD_VALUES: Mood[] = ["happy", "chill", "active", "serious", "party"];

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
  const normalized = normalizeString(value);
  if (!normalized) return undefined;
  if (normalized.startsWith("https://")) {
    return normalized;
  }
  if (
    normalized.startsWith("http://localhost:") ||
    normalized.startsWith("http://127.0.0.1:") ||
    normalized.startsWith("http://192.168.") ||
    normalized.startsWith("http://10.") ||
    normalized.startsWith("http://172.")
  ) {
    return normalized;
  }
  return undefined;
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
      if (typeof entry === "string") {
        const url = normalizeSharedMediaUrl(entry);
        return url ? { url } : null;
      }

      if (!entry || typeof entry !== "object") return null;
      const candidate = entry as {
        id?: unknown;
        mediaId?: unknown;
        url?: unknown;
      };
      const url = normalizeSharedMediaUrl(candidate.url);
      if (!url) return null;

      const mediaId = normalizeString(candidate.mediaId ?? candidate.id);
      return {
        ...(mediaId ? { mediaId } : {}),
        url,
      };
    })
    .filter((entry): entry is UserProfilePhoto => Boolean(entry));
}

function toBackendProfilePhotos(value: unknown): ProfilePhotoDto[] {
  return normalizeProfilePhotos(value)
    .map((photo) => {
      const mediaId = normalizeString(photo.mediaId);
      if (!mediaId) return null;
      return {
        mediaId,
        url: photo.url,
      };
    })
    .filter((entry): entry is ProfilePhotoDto => Boolean(entry));
}

function normalizeGoal(value: unknown): Goal | undefined {
  return GOAL_VALUES.includes(value as Goal) ? (value as Goal) : undefined;
}

function normalizeMood(value: unknown): Mood | undefined {
  return MOOD_VALUES.includes(value as Mood) ? (value as Mood) : undefined;
}

function normalizeAmoriaId(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  return AMORIA_ID_RE.test(normalized) ? normalized : "";
}

function normalizeGeo(value: unknown): UserProfile["geo"] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<UserProfile["geo"]>;
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  const geohash = normalizeString(candidate.geohash);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !geohash) return undefined;

  return { lat, lng, geohash };
}

function normalizeUserProfile(
  uid: string,
  raw?: Partial<UserProfile> | null,
  options: { allowAuthFallback?: boolean } = { allowAuthFallback: true }
): UserProfile {
  const now = Date.now();
  const createdAt = Number(raw?.createdAt);
  const updatedAt = Number(raw?.updatedAt);
  const displayName = normalizeStoredDisplayName(raw?.displayName);
  const amoriaId = normalizeAmoriaId(raw?.amoriaId);
  const avatarUrl =
    normalizeSharedMediaUrl(raw?.avatarUrl) ||
    normalizeSharedMediaUrl((raw as { photoURL?: unknown } | null | undefined)?.photoURL);
  const birthdate = normalizeOptionalString(raw?.birthdate);
  const about = normalizeOptionalString(raw?.about);
  const goal = normalizeGoal(raw?.goal);
  const mood = normalizeMood(raw?.mood);
  const geo = normalizeGeo(raw?.geo);
  const voiceIntroUrl = normalizeOptionalString(raw?.voiceIntroUrl);
  const trustLevel = Number(raw?.trustLevel);
  const revealStage = Number(raw?.revealStage);
  const voiceIntroDurationSec = Number(raw?.voiceIntroDurationSec);
  const lastActive = Number(raw?.lastActive);
  const greenFlags = normalizeStringArray(raw?.greenFlags);
  const redFlags = normalizeStringArray(raw?.redFlags);

  return {
    uid,
    displayName,
    amoriaId,
    ...(amoriaId ? { amoriaIdNormalized: amoriaId } : {}),
    ...(birthdate ? { birthdate } : {}),
    ...(raw?.gender === "male" || raw?.gender === "female" || raw?.gender === "other"
      ? { gender: raw.gender }
      : {}),
    ...(about ? { about } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    interests: normalizeStringArray(raw?.interests),
    photos: normalizeProfilePhotos(raw?.photos),
    ...(mood ? { mood } : {}),
    ...(goal ? { goal } : {}),
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : now,
    updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : now,
    ...(geo ? { geo } : {}),
    ...(Number.isFinite(trustLevel) ? { trustLevel } : {}),
    ...(Number.isFinite(revealStage) ? { revealStage } : {}),
    allowAdultMode: Boolean(raw?.allowAdultMode),
    flirtEnabled: Boolean(raw?.flirtEnabled),
    mysteryMode: Boolean(raw?.mysteryMode),
    ...(voiceIntroUrl ? { voiceIntroUrl } : {}),
    hasVoiceIntro: Boolean(raw?.hasVoiceIntro),
    ...(Number.isFinite(voiceIntroDurationSec) ? { voiceIntroDurationSec } : {}),
    ...(Number.isFinite(lastActive) ? { lastActive } : {}),
    ...(greenFlags.length ? { greenFlags } : {}),
    ...(redFlags.length ? { redFlags } : {}),
  };
}

function normalizeBackendTimestamp(value: unknown, fallback: number) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : fallback;
}

function mapBackendUserProfile(user: AuthUserDto | SelfUserProfileDto): UserProfile {
  const now = Date.now();
  const createdAt = normalizeBackendTimestamp(user.createdAt, now);
  const updatedAt = normalizeBackendTimestamp(user.updatedAt, createdAt);
  const amoriaId = normalizeAmoriaId(user.amoriaId);
  const about = normalizeOptionalString(user.about);
  const avatarUrl = normalizeSharedMediaUrl(user.avatarUrl);
  const goal = normalizeGoal(user.goal);
  const mood = normalizeMood(user.mood);

  return {
    uid: normalizeString(user.id),
    displayName: normalizeStoredDisplayName(user.displayName),
    amoriaId,
    ...(amoriaId ? { amoriaIdNormalized: amoriaId } : {}),
    ...(about ? { about } : {}),
    ...(avatarUrl ? { avatarUrl } : {}),
    interests: normalizeStringArray(user.interests),
    photos: normalizeProfilePhotos(user.photos),
    ...(mood ? { mood } : {}),
    ...(goal ? { goal } : {}),
    createdAt,
    updatedAt,
    allowAdultMode: Boolean(user.allowAdultMode),
    flirtEnabled: Boolean(user.flirtEnabled),
    mysteryMode: Boolean(user.mysteryMode),
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
  return { id: profile.uid, ...profile };
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

export async function getUserProfileById(uid: string): Promise<UserProfile | null> {
  const stableUid = normalizeString(uid);
  if (!stableUid || !db) return null;

  const snap = await getDoc(doc(db, USERS_COLLECTION, stableUid));
  if (!snap.exists()) return null;
  return normalizeUserProfile(stableUid, {
    uid: stableUid,
    ...(snap.data() as Partial<UserProfile>),
  }, { allowAuthFallback: false });
}

export async function updateUserAvatarUrl(avatarUrl: string): Promise<UserProfile> {
  const sharedAvatarUrl = normalizeSharedMediaUrl(avatarUrl);
  if (!sharedAvatarUrl) {
    throw new Error("profile.avatarSharedUrlRequired");
  }

  const backendSession = await loadBackendSession();
  if (backendSession) {
    if (backendSession.user.avatarUrl === sharedAvatarUrl) {
      return mapBackendUserProfile(backendSession.user);
    }

    const refreshedSession = await refreshBackendUser();
    if (refreshedSession?.user.avatarUrl === sharedAvatarUrl) {
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
  photos: Array<UserProfilePhoto | string>
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
