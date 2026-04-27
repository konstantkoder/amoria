import {
  Firestore,
  QueryConstraint,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  limit,
} from "firebase/firestore";
import { geohashForLocation } from "geofire-common";

export type NowMood = "chill" | "talk" | "drink" | "walk" | "fun" | "other";
export type NowPostStatus = "active" | "expired" | "deleted";

export type NowPost = {
  id: string;
  authorUid: string;
  authorName?: string;
  authorAvatarUrl?: string;
  uid: string;
  nickname: string;
  avatarUrl?: string;
  text: string;
  mood: NowMood;
  region: string;
  geohash: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  status: NowPostStatus;
  lat?: number;
  lng?: number;
};

export type CreateNowPostInput = {
  clientId: string;
  uid: string;
  nickname: string;
  authorName?: string;
  avatarUrl?: string;
  text: string;
  mood: NowMood;
  lat: number;
  lng: number;
};

const NEARBY_POSTS_COLLECTION = "nearbyPosts";
export const NEARBY_STATUS_TTL_MS = 2 * 60 * 60 * 1000;
const LEGACY_NICKNAME_RE = /^nick\.[a-z]+(\.[a-z]+)?\.\d{3}$/;

// region = довольно крупный квадрат (порядка десятков км),
// а точный радиус уже режем по расстоянию на клиенте.
export function makeRegion(lat: number, lng: number): string {
  const geohash = geohashForLocation([lat, lng]);
  return geohash.slice(0, 3); // ~100–150 км охвата
}

function normalizeNowMood(value: unknown): NowMood {
  if (
    value === "chill" ||
    value === "talk" ||
    value === "drink" ||
    value === "walk" ||
    value === "fun"
  ) {
    return value;
  }
  return "other";
}

function normalizeNowPostStatus(value: unknown): NowPostStatus {
  if (value === "expired" || value === "deleted") return value;
  return "active";
}

function normalizePublicName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name || LEGACY_NICKNAME_RE.test(name)) return "";
  return name;
}

function readMillis(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && "toMillis" in value) {
    const millis = Number((value as { toMillis: () => number }).toMillis());
    return Number.isFinite(millis) ? millis : 0;
  }
  return 0;
}

function normalizeNowPost(id: string, raw: unknown): NowPost | null {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Partial<NowPost> & {
    authorUid?: unknown;
    authorName?: unknown;
    authorAvatarUrl?: unknown;
    uid?: unknown;
    nickname?: unknown;
    avatarUrl?: unknown;
    text?: unknown;
    mood?: unknown;
    region?: unknown;
    geohash?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
    expiresAt?: unknown;
    status?: unknown;
    lat?: unknown;
    lng?: unknown;
  };
  const authorUid = String(data.authorUid ?? data.uid ?? "").trim();
  const text = String(data.text ?? "").trim();
  const region = String(data.region ?? "").trim();
  const geohash = String(data.geohash ?? region).trim();
  const createdAt = readMillis(data.createdAt);
  const updatedAt = readMillis(data.updatedAt) || createdAt;
  const expiresAt = readMillis(data.expiresAt);
  if (!id || !authorUid || !text || !region || !createdAt || !expiresAt) return null;

  const authorName = normalizePublicName(data.authorName);
  const authorAvatarUrl = String(data.authorAvatarUrl ?? data.avatarUrl ?? "").trim();
  const nickname = String(data.nickname ?? "profile.amoriaUser").trim();
  const lat = typeof data.lat === "number" ? data.lat : undefined;
  const lng = typeof data.lng === "number" ? data.lng : undefined;
  const avatarUrl = authorAvatarUrl.startsWith("https://")
    ? authorAvatarUrl
    : String(data.avatarUrl ?? "").startsWith("https://")
      ? String(data.avatarUrl)
      : "";

  return {
    id,
    authorUid,
    ...(authorName ? { authorName } : {}),
    ...(avatarUrl ? { authorAvatarUrl: avatarUrl, avatarUrl } : {}),
    uid: authorUid,
    nickname: nickname || "common.anonymous",
    text,
    mood: normalizeNowMood(data.mood),
    region,
    geohash,
    createdAt,
    updatedAt,
    expiresAt,
    status: normalizeNowPostStatus(data.status),
    ...(lat != null ? { lat } : {}),
    ...(lng != null ? { lng } : {}),
  };
}

export function subscribeNowPosts(
  db: Firestore,
  region: string,
  onPosts: (posts: NowPost[]) => void,
  onError?: (error: Error) => void
) {
  const baseRef = collection(db, NEARBY_POSTS_COLLECTION);
  const constraints: QueryConstraint[] = [
    where("region", "==", region),
    where("status", "==", "active"),
    orderBy("createdAt", "desc"),
    limit(200),
  ];

  const q = query(baseRef, ...constraints);

  return onSnapshot(
    q,
    (snap) => {
      const now = Date.now();
      const list: NowPost[] = snap.docs
        .map((d) => normalizeNowPost(d.id, d.data()))
        .filter((item): item is NowPost => Boolean(item))
        .filter((item) => item.status === "active" && item.expiresAt > now);

      onPosts(list);
    },
    (error) => {
      onError?.(error);
    }
  );
}

export async function getNowPostById(
  db: Firestore,
  postId: string
): Promise<NowPost | null> {
  const stablePostId = String(postId ?? "").trim();
  if (!stablePostId) return null;

  const snapshot = await getDoc(doc(db, NEARBY_POSTS_COLLECTION, stablePostId));
  if (!snapshot.exists()) return null;
  return normalizeNowPost(snapshot.id, snapshot.data());
}

export async function createNowPost(
  db: Firestore,
  input: CreateNowPostInput
) {
  const geohash = geohashForLocation([input.lat, input.lng]);
  const region = geohash.slice(0, 3);
  const now = Date.now();
  const clientId = String(input.clientId || "").trim();
  const uid = String(input.uid ?? "").trim();
  const text = String(input.text ?? "").trim();
  if (!clientId) return "";
  if (!uid || !text) return "";

  const ref = doc(collection(db, NEARBY_POSTS_COLLECTION), clientId);
  await setDoc(
    ref,
    {
      id: ref.id,
      clientId,
      authorUid: uid,
      authorName: normalizePublicName(input.authorName),
      ...(input.avatarUrl?.startsWith("https://") ? { authorAvatarUrl: input.avatarUrl } : {}),
      uid,
      nickname: input.nickname,
      ...(input.avatarUrl?.startsWith("https://") ? { avatarUrl: input.avatarUrl } : {}),
      text,
      mood: input.mood,
      region,
      geohash,
      createdAt: now,
      updatedAt: now,
      expiresAt: now + NEARBY_STATUS_TTL_MS,
      createdAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp(),
      status: "active" satisfies NowPostStatus,
      lat: input.lat,
      lng: input.lng,
    },
    { merge: true }
  );

  return ref.id;
}

export async function deleteNowPost(
  db: Firestore,
  postId: string,
  uid: string
): Promise<void> {
  const stablePostId = String(postId ?? "").trim();
  const stableUid = String(uid ?? "").trim();
  if (!stablePostId || !stableUid) return;

  await setDoc(
    doc(db, NEARBY_POSTS_COLLECTION, stablePostId),
    {
      authorUid: stableUid,
      uid: stableUid,
      status: "deleted" satisfies NowPostStatus,
      updatedAt: Date.now(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true }
  );
}
