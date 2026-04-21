import { doc, getDoc, setDoc } from "firebase/firestore";

import { auth, db } from "@/config/firebaseConfig";
import type { Goal, Mood, UserProfile } from "@/models/User";

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

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
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

function normalizeGeo(value: unknown): UserProfile["geo"] | undefined {
  if (!value || typeof value !== "object") return undefined;

  const candidate = value as Partial<UserProfile["geo"]>;
  const lat = Number(candidate.lat);
  const lng = Number(candidate.lng);
  const geohash = normalizeString(candidate.geohash);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !geohash) return undefined;

  return { lat, lng, geohash };
}

function normalizeUserProfile(uid: string, raw?: Partial<UserProfile> | null): UserProfile {
  const now = Date.now();
  const createdAt = Number(raw?.createdAt);
  const updatedAt = Number(raw?.updatedAt);
  const displayName = normalizeString(raw?.displayName) || deriveDisplayName();
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
    interests: normalizeStringArray(raw?.interests),
    photos: normalizeStringArray(raw?.photos),
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

  return normalizeUserProfile(uid, {
    uid,
    displayName: deriveDisplayName(),
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

export async function updateUserPhotos(photos: string[]): Promise<UserProfile> {
  return updateUserFields({ photos });
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
