import { doc, getDoc, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";

import { auth, db } from "@/config/firebaseConfig";
import type { Goal, Mood, UserProfile } from "@/models/User";
import { uploadUserAvatar } from "@/services/storage";

const USERS_COLLECTION = "users";
const AMORIA_IDS_COLLECTION = "amoriaIds";
const AMORIA_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const AMORIA_ID_LENGTH = 5;
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
  return undefined;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
}

function normalizeSharedMediaUrlArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => normalizeSharedMediaUrl(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function normalizeGoal(value: unknown): Goal | undefined {
  return GOAL_VALUES.includes(value as Goal) ? (value as Goal) : undefined;
}

function normalizeMood(value: unknown): Mood | undefined {
  return MOOD_VALUES.includes(value as Mood) ? (value as Mood) : undefined;
}

function deriveAuthDisplayName() {
  const authDisplayName = normalizeDisplayNameInput(auth?.currentUser?.displayName);
  return getDisplayNameValidationErrorKey(authDisplayName) ? "" : authDisplayName;
}

function deriveAuthPhotoUrl() {
  return normalizeSharedMediaUrl(auth?.currentUser?.photoURL);
}

function normalizeAmoriaId(value: unknown) {
  const normalized = normalizeString(value).toUpperCase();
  return AMORIA_ID_RE.test(normalized) ? normalized : "";
}

function generateAmoriaIdCandidate() {
  let code = "";
  for (let index = 0; index < AMORIA_ID_LENGTH; index += 1) {
    code += AMORIA_ID_ALPHABET[Math.floor(Math.random() * AMORIA_ID_ALPHABET.length)] ?? "2";
  }
  return `AM-${code}`;
}

async function reserveAmoriaId(uid: string, requestedAmoriaId?: string) {
  if (!db) throw new Error("Firestore is not initialized");

  const requested = normalizeAmoriaId(requestedAmoriaId);
  const candidates = [
    ...(requested ? [requested] : []),
    ...Array.from({ length: 10 }, generateAmoriaIdCandidate),
  ];

  for (const candidate of candidates) {
    const amoriaIdRef = doc(db, AMORIA_IDS_COLLECTION, candidate);
    try {
      return await runTransaction(db, async (tx) => {
        const snapshot = await tx.get(amoriaIdRef);
        const existingUid = snapshot.exists()
          ? normalizeString((snapshot.data() as { uid?: unknown }).uid)
          : "";

        if (snapshot.exists()) {
          if (existingUid === uid) return candidate;
          throw new Error("profile.amoriaIdCollision");
        }

        tx.set(amoriaIdRef, {
          uid,
          amoriaId: candidate,
          amoriaIdNormalized: candidate,
          createdAt: Date.now(),
          createdAtServer: serverTimestamp(),
        });

        return candidate;
      });
    } catch (error) {
      if ((error as Error)?.message !== "profile.amoriaIdCollision") {
        throw error;
      }
    }
  }

  throw new Error("profile.amoriaIdGenerateFailed");
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
  const displayName =
    normalizeStoredDisplayName(raw?.displayName) ||
    (options.allowAuthFallback === false ? "" : deriveAuthDisplayName());
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
    photos: normalizeSharedMediaUrlArray(raw?.photos),
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

function requireCurrentUserRef() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  if (!db) throw new Error("Firestore is not initialized");

  return {
    uid,
    ref: doc(db, USERS_COLLECTION, uid),
  };
}

function buildInitialUserProfile(uid: string, options: { displayName?: string; amoriaId: string }): UserProfile {
  const now = Date.now();
  const avatarUrl = deriveAuthPhotoUrl();

  return normalizeUserProfile(uid, {
    uid,
    displayName: normalizeDisplayNameInput(options.displayName),
    amoriaId: options.amoriaId,
    amoriaIdNormalized: options.amoriaId,
    ...(avatarUrl ? { avatarUrl } : {}),
    interests: [],
    photos: [],
    allowAdultMode: false,
    flirtEnabled: false,
    mysteryMode: false,
    createdAt: now,
    updatedAt: now,
  });
}

export async function ensureCurrentUserProfile(options: {
  displayName?: string;
} = {}): Promise<UserProfile> {
  const { uid, ref } = requireCurrentUserRef();
  const snap = await getDoc(ref);
  const requestedDisplayName =
    options.displayName != null ? assertValidDisplayName(options.displayName) : "";

  if (snap.exists()) {
    const rawData = snap.data() as Partial<UserProfile>;
    const current = normalizeUserProfile(uid, {
      uid,
      ...rawData,
    });
    const nextDisplayName = requestedDisplayName || current.displayName;
    const rawDisplayName = normalizeStoredDisplayName(rawData.displayName);
    const amoriaId = await reserveAmoriaId(uid, current.amoriaId);
    const now = Date.now();
    const patch: Partial<UserProfile> & {
      updatedAtServer?: ReturnType<typeof serverTimestamp>;
    } = {
      uid,
      amoriaId,
      amoriaIdNormalized: amoriaId,
    };

    if (requestedDisplayName && requestedDisplayName !== current.displayName) {
      patch.displayName = requestedDisplayName;
    } else if (nextDisplayName && rawDisplayName !== nextDisplayName) {
      patch.displayName = nextDisplayName;
    } else if (!("displayName" in rawData)) {
      patch.displayName = "";
    }

    if (current.amoriaId !== amoriaId || patch.displayName != null) {
      patch.updatedAt = now;
      patch.updatedAtServer = serverTimestamp();
      await setDoc(ref, patch, { merge: true });
    }

    return normalizeUserProfile(uid, {
      ...current,
      displayName: nextDisplayName,
      amoriaId,
      amoriaIdNormalized: amoriaId,
      updatedAt: patch.updatedAt ?? current.updatedAt,
    });
  }

  const amoriaId = await reserveAmoriaId(uid);
  const initialProfile = buildInitialUserProfile(uid, {
    displayName: requestedDisplayName || deriveAuthDisplayName(),
    amoriaId,
  });
  await setDoc(ref, {
    ...initialProfile,
    createdAtServer: serverTimestamp(),
    updatedAtServer: serverTimestamp(),
  });
  return initialProfile;
}

export async function createUserProfileForRegistration(displayName: string): Promise<UserProfile> {
  return ensureCurrentUserProfile({ displayName });
}

export async function getCurrentUser() {
  const profile = await ensureCurrentUserProfile();
  return { id: profile.uid, ...profile };
}

export async function updateMySettings(patch: Record<string, any>) {
  return updateUserFields(patch);
}

export async function getUserProfile(): Promise<UserProfile> {
  return ensureCurrentUserProfile();
}

export async function updateUserFields(
  fields: Partial<UserProfile>
): Promise<UserProfile> {
  const { uid, ref } = requireCurrentUserRef();
  const current = await ensureCurrentUserProfile();
  const sanitizedFields = { ...fields };
  if ("displayName" in sanitizedFields) {
    sanitizedFields.displayName = assertValidDisplayName(sanitizedFields.displayName);
  }
  sanitizedFields.uid = uid;
  sanitizedFields.amoriaId = current.amoriaId || (await reserveAmoriaId(uid));
  sanitizedFields.amoriaIdNormalized = sanitizedFields.amoriaId;
  const next = normalizeUserProfile(uid, {
    ...current,
    ...sanitizedFields,
    updatedAt: Date.now(),
  });

  await setDoc(ref, {
    ...next,
    updatedAtServer: serverTimestamp(),
  });
  return next;
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
  return updateUserFields({ avatarUrl: sharedAvatarUrl });
}

export async function uploadCurrentUserAvatar(uri: string): Promise<UserProfile> {
  const { uid } = requireCurrentUserRef();
  const avatarUrl = await uploadUserAvatar(uid, uri);
  return updateUserAvatarUrl(avatarUrl);
}

export async function updateUserPhotos(photos: string[]): Promise<UserProfile> {
  return updateUserFields({ photos: normalizeSharedMediaUrlArray(photos) });
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
