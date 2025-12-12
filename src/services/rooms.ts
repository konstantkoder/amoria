import { geohashForLocation } from "geofire-common";
import {
  Firestore,
  addDoc,
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
} from "firebase/firestore";

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
  uid: string;
  nickname: string;
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
  { label: string; emoji: string; precision: number; radiusM: number }
> = {
  work: { label: "Работа", emoji: "🏢", precision: 7, radiusM: 250 },
  bar: { label: "Бар", emoji: "🍹", precision: 7, radiusM: 350 },
  cafe: { label: "Кафе", emoji: "☕", precision: 7, radiusM: 250 },
  gym: { label: "Зал", emoji: "🏋️", precision: 7, radiusM: 300 },
  park: { label: "Парк", emoji: "🌳", precision: 6, radiusM: 900 },
  home: { label: "Дом", emoji: "🏠", precision: 8, radiusM: 80 },
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

export function makeNickname(uid: string) {
  const colors = [
    "Синий",
    "Лаймовый",
    "Фиолетовый",
    "Золотой",
    "Розовый",
    "Бирюзовый",
    "Серый",
    "Красный",
  ];
  const animals = [
    "Лис",
    "Волк",
    "Кот",
    "Тигр",
    "Енот",
    "Сова",
    "Панда",
    "Дельфин",
    "Лев",
    "Заяц",
  ];

  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;

  const c = colors[h % colors.length];
  const a = animals[(h >>> 8) % animals.length];
  const n = ((h >>> 16) % 900) + 100;
  return `${c} ${a} ${n}`;
}

export async function openOrCreateGeoRoom(
  db: Firestore,
  kind: RoomKind,
  lat: number,
  lng: number
): Promise<RoomDoc> {
  const meta = ROOM_META[kind];
  const geohash = geohashForLocation([lat, lng]);
  const id = `${kind}_${geohash.slice(0, meta.precision)}`;
  const ref = doc(db, "rooms", id);
  const now = Date.now();

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    const room: Omit<RoomDoc, "id"> = {
      kind,
      title: `${meta.emoji} ${meta.label}`,
      geo: { lat, lng, geohash, precision: meta.precision },
      radiusM: meta.radiusM,
      createdAt: now,
      lastActiveAt: now,
    };
    await setDoc(ref, room);
    return { id, ...room };
  }

  await updateDoc(ref, { lastActiveAt: now });

  const data = snap.data() as any;
  return {
    id,
    kind: data.kind ?? kind,
    title: data.title ?? `${meta.emoji} ${meta.label}`,
    geo: data.geo ?? { lat, lng, geohash, precision: meta.precision },
    radiusM: data.radiusM ?? meta.radiusM,
    createdAt: data.createdAt ?? now,
    lastActiveAt: data.lastActiveAt ?? now,
  };
}

export function subscribeRoomMessages(
  db: Firestore,
  roomId: string,
  onMessages: (messages: RoomMessage[]) => void
) {
  const q = query(
    collection(db, "rooms", roomId, "messages"),
    orderBy("createdAt", "desc"),
    limit(80)
  );

  return onSnapshot(q, (snap) => {
    const msgs: RoomMessage[] = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        id: d.id,
        uid: String(x.uid ?? ""),
        nickname: String(x.nickname ?? "Аноним"),
        text: String(x.text ?? ""),
        createdAt: Number(x.createdAt ?? 0),
      };
    });
    onMessages(msgs);
  });
}

export async function sendRoomMessage(
  db: Firestore,
  roomId: string,
  uid: string,
  nickname: string,
  text: string
) {
  const trimmed = text.trim();
  if (!trimmed) return;

  await addDoc(collection(db, "rooms", roomId, "messages"), {
    uid,
    nickname,
    text: trimmed,
    createdAt: Date.now(),
  });

  await updateDoc(doc(db, "rooms", roomId), { lastActiveAt: Date.now() });
}

export function subscribeRoomMembers(
  db: Firestore,
  roomId: string,
  onMembers: (members: RoomMember[]) => void
) {
  const q = query(
    collection(db, "rooms", roomId, "members"),
    orderBy("lastSeen", "desc"),
    limit(60)
  );
  return onSnapshot(q, (snap) => {
    const members: RoomMember[] = snap.docs.map((d) => {
      const x = d.data() as any;
      return {
        uid: String(x.uid ?? d.id),
        nickname: String(x.nickname ?? "Аноним"),
        lastSeen: Number(x.lastSeen ?? 0),
      };
    });
    onMembers(members);
  });
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
