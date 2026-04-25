import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "@/config/firebaseConfig";
import type { Goal, Mood, UserProfile } from "@/models/User";
import { uploadProfileAvatar } from "@/services/storage";

const USERS_COLLECTION = "users";
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

function deriveDisplayName() {
  const authDisplayName = normalizeString(auth?.currentUser?.displayName);
  if (authDisplayName) return authDisplayName;

  const email = normalizeString(auth?.currentUser?.email);
  const emailLocalPart = email.split("@")[0]?.trim();
  return emailLocalPart || "";
}

function deriveAuthPhotoUrl() {
  return normalizeSharedMediaUrl(auth?.currentUser?.photoURL);
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
    normalizeString(raw?.displayName) ||
    (options.allowAuthFallback === false ? "" : deriveDisplayName());
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

function buildInitialUserProfile(uid: string): UserProfile {
  const now = Date.now();
  const avatarUrl = deriveAuthPhotoUrl();

  return normalizeUserProfile(uid, {
    uid,
    displayName: deriveDisplayName(),
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

export async function ensureCurrentUserProfile(): Promise<UserProfile> {
  const { uid, ref } = requireCurrentUserRef();
  const snap = await getDoc(ref);
  if (snap.exists()) {
    return normalizeUserProfile(uid, {
      uid,
      ...(snap.data() as Partial<UserProfile>),
    });
  }

  const initialProfile = buildInitialUserProfile(uid);
  await setDoc(ref, initialProfile);
  return initialProfile;
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
  const next = normalizeUserProfile(uid, {
    ...current,
    ...fields,
    updatedAt: Date.now(),
  });

  await setDoc(ref, next);
  return next;
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
  const avatarUrl = await uploadProfileAvatar(uid, uri);
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
