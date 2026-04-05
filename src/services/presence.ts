import {
  Firestore,
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
} from "firebase/firestore";

import { auth } from "@/config/firebaseConfig";

export type PresenceDoc = {
  uid: string;
  lat: number;
  lng: number;
  prefix: string;
  precision: number;
  updatedAt: number;
};

const MAX_OFFSET_METERS = 50;
const STALE_WINDOW_MS = 5 * 60 * 1000;

function uidSeed(uid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function nextRand(seed: number): number {
  let x = seed >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return x >>> 0;
}

function randUnit(seed: number): number {
  return (seed >>> 0) / 0xffffffff;
}

export function approximateCoords(uid: string, lat: number, lng: number) {
  const roundedLat = Math.round(lat * 1000) / 1000;
  const roundedLng = Math.round(lng * 1000) / 1000;

  const seed0 = uidSeed(uid);
  const seed1 = nextRand(seed0);
  const seed2 = nextRand(seed1);
  const n1 = randUnit(seed1) * 2 - 1;
  const n2 = randUnit(seed2) * 2 - 1;

  const latOffset = (n1 * MAX_OFFSET_METERS) / 111_320;
  const lngOffset =
    (n2 * MAX_OFFSET_METERS) /
    (111_320 * Math.cos((roundedLat * Math.PI) / 180));

  return {
    lat: roundedLat + latOffset,
    lng: roundedLng + lngOffset,
  };
}

export async function upsertPresence(
  db: Firestore,
  uid: string,
  payload: { lat: number; lng: number; prefix: string; precision: number }
): Promise<void> {
  const approx = approximateCoords(uid, payload.lat, payload.lng);
  const ref = doc(db, "presence", uid);
  await setDoc(
    ref,
    {
      uid,
      lat: approx.lat,
      lng: approx.lng,
      prefix: payload.prefix,
      precision: payload.precision,
      updatedAt: Date.now(),
    },
    { merge: true }
  );
}

export async function clearPresence(
  db: Firestore,
  uid: string
): Promise<void> {
  const ref = doc(db, "presence", uid);
  await deleteDoc(ref);
}

export function subscribePresenceByPrefix(
  db: Firestore,
  prefix: string,
  onList: (items: PresenceDoc[]) => void
) {
  const q = query(
    collection(db, "presence"),
    where("prefix", "==", prefix),
    limit(60)
  );

  return onSnapshot(q, (snap) => {
    const cutoff = Date.now() - STALE_WINDOW_MS;
    const currentUid = auth?.currentUser?.uid ?? null;
    const items: PresenceDoc[] = [];
    for (const docSnap of snap.docs) {
      const data = docSnap.data() as any;
      const uid = String(data.uid ?? docSnap.id ?? "");
      const updatedAt = Number(data.updatedAt ?? 0);
      if (!uid || uid === currentUid) continue;
      if (updatedAt < cutoff) continue;
      items.push({
        uid,
        lat: Number(data.lat ?? 0),
        lng: Number(data.lng ?? 0),
        prefix: String(data.prefix ?? ""),
        precision: Number(data.precision ?? 0),
        updatedAt,
      });
    }
    onList(items);
  });
}
