import { geohashForLocation } from "geofire-common";
import {
  Firestore,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

import { withTimeout } from "@/utils/withTimeout";

export type RoomKind = "work" | "bar" | "cafe" | "gym" | "park" | "home";

export type RoomDoc = {
  id: string;
  kind: RoomKind;
  title: string;
  geo: { lat: number; lng: number; geohash: string; precision: number };
  radiusM: number;
  createdAt: number;
  lastActiveAt: number;
};

export type RoomMessage = {
  id: string;
  clientId?: string;
  pending?: boolean;
  uid: string;
  nicknameCode: string;
  text: string;
  createdAt: number;
};

export type RoomMember = {
  uid: string;
  nickname: string;
  lastSeen: number;
};

const ROOM_META: Record<
  RoomKind,
  { labelKey: string; emoji: string; precision: number; radiusM: number }
> = {
  work: { labelKey: "rooms.place.work", emoji: "🏢", precision: 7, radiusM: 250 },
  bar: { labelKey: "rooms.place.bar", emoji: "🍹", precision: 7, radiusM: 350 },
  cafe: { labelKey: "rooms.place.cafe", emoji: "☕", precision: 7, radiusM: 250 },
  gym: { labelKey: "rooms.place.gym", emoji: "🏋️", precision: 7, radiusM: 300 },
  park: { labelKey: "rooms.place.park", emoji: "🌳", precision: 6, radiusM: 900 },
  home: { labelKey: "rooms.place.home", emoji: "🏠", precision: 8, radiusM: 80 },
};

export const ROOM_KIND_ORDER: RoomKind[] = [
  "work",
  "bar",
  "cafe",
  "gym",
  "park",
  "home",
];

export function getRoomMeta(kind: RoomKind) {
  return ROOM_META[kind];
}

export function buildRoomId(kind: RoomKind, lat: number, lng: number) {
  const meta = ROOM_META[kind];
  const geohash = geohashForLocation([lat, lng]);
  const prefix = geohash.slice(0, meta.precision);
  return `${kind}_${prefix}`;
}

const NICKNAME_COLORS = [
  "blue",
  "lime",
  "purple",
  "gold",
  "pink",
  "turquoise",
  "gray",
  "red",
];

const NICKNAME_ANIMALS = [
  "fox",
  "wolf",
  "cat",
  "tiger",
  "raccoon",
  "owl",
  "panda",
  "dolphin",
  "lion",
  "hare",
];

export function makeNickname(uid: string) {

  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;

  const c = NICKNAME_COLORS[h % NICKNAME_COLORS.length];
  const a = NICKNAME_ANIMALS[(h >>> 8) % NICKNAME_ANIMALS.length];
  const n = ((h >>> 16) % 900) + 100;
  return `nick.${c}.${a}.${n}`;
}

export async function openOrCreateGeoRoom(
  db: Firestore,
  kind: RoomKind,
  lat: number,
  lng: number,
  opts?: { precision?: number; radiusM?: number }
): Promise<RoomDoc> {
  const meta = ROOM_META[kind];
  const precision = opts?.precision ?? meta.precision;
  const radiusM = opts?.radiusM ?? meta.radiusM;
  const geohash = geohashForLocation([lat, lng]);
  const id = `${kind}_${geohash.slice(0, precision)}`;
  const ref = doc(db, "rooms", id);
  const now = Date.now();
  const fallbackTitle = meta.labelKey;
  const baseRoom: Omit<RoomDoc, "id"> = {
    kind,
    title: fallbackTitle,
    geo: { lat, lng, geohash, precision },
    radiusM,
    createdAt: now,
    lastActiveAt: now,
  };

  const fireAndForgetCreate = () => {
    setDoc(ref, baseRoom, { merge: true }).catch(() => {});
  };

  let snap;
  try {
    snap = await withTimeout(getDoc(ref), 4500, "rooms.getDoc");
  } catch {
    setDoc(
      ref,
      {
        kind,
        geo: { lat, lng, geohash, precision },
        radiusM,
        lastActiveAt: now,
      },
      { merge: true }
    ).catch(() => {});
    return { id, ...baseRoom };
  }

  if (!snap.exists()) {
    fireAndForgetCreate();
    return { id, ...baseRoom };
  }

  updateDoc(ref, { lastActiveAt: now }).catch(() => {});

  const data = snap.data() as any;
  return {
    id,
    kind: data.kind ?? kind,
    title: data.title ?? fallbackTitle,
    geo: data.geo ?? { lat, lng, geohash, precision },
    radiusM: data.radiusM ?? radiusM,
    createdAt: data.createdAt ?? now,
    lastActiveAt: data.lastActiveAt ?? now,
  };
}

export function subscribeRoomMessages(
  db: Firestore,
  roomId: string,
  onMessages: (messages: RoomMessage[]) => void,
  onError?: (e: any) => void
) {
  const q = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    limit(80)
  );

  return onSnapshot(
    q,
    (snap) => {
      const msgs: RoomMessage[] = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          id: d.id,
          clientId: String(x.clientId ?? d.id),
          pending: d.metadata.hasPendingWrites,
          uid: String(x.uid ?? ""),
          nicknameCode: String(
            x.nicknameCode ?? x.nickname ?? "common.anonymous"
          ),
          text: String(x.text ?? ""),
          createdAt: Number(x.createdAt ?? 0),
        };
      });
      onMessages(msgs);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function sendRoomMessage(
  db: Firestore,
  roomId: string,
  uid: string,
  nicknameCode: string,
  text: string,
  clientId: string
): Promise<string> {
  const value = text.trim();
  if (!value) return "";
  const stableClientId = String(clientId || "").trim();
  if (!stableClientId) return "";

  const msgRef = doc(collection(db, "rooms", roomId, "messages"), stableClientId);
  await setDoc(
    msgRef,
    {
      clientId: stableClientId,
      uid,
      nicknameCode,
      text: value,
      createdAt: Date.now(),
      createdAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  // Обновление метаданных комнаты не должно ломать отправку
  try {
    await setDoc(
      doc(db, "rooms", roomId),
      { lastActiveAt: Date.now() },
      { merge: true }
    );
  } catch {}

  return msgRef.id;
}

export function subscribeRoomMembers(
  db: Firestore,
  roomId: string,
  onMembers: (members: RoomMember[]) => void,
  onError?: (e: any) => void
) {
  const q = query(
    collection(db, "rooms", roomId, "members"),
    orderBy("lastSeen", "desc"),
    limit(60)
  );
  return onSnapshot(
    q,
    (snap) => {
      const members: RoomMember[] = snap.docs.map((d) => {
        const x = d.data() as any;
        return {
          uid: String(x.uid ?? d.id),
          nickname: String(x.nickname ?? "common.anonymous"),
          lastSeen: Number(x.lastSeen ?? 0),
        };
      });
      onMembers(members);
    },
    (err) => {
      onError?.(err);
    }
  );
}

export async function touchRoomMember(
  db: Firestore,
  roomId: string,
  uid: string,
  nickname: string
) {
  const ref = doc(db, "rooms", roomId, "members", uid);
  await setDoc(
    ref,
    { uid, nickname, lastSeen: Date.now() },
    { merge: true }
  );
}
