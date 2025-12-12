// FILE: src/services/now.ts
import {
  Firestore,
  QueryConstraint,
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  limit,
} from "firebase/firestore";
import { geohashForLocation } from "geofire-common";

export type NowMood = "chill" | "talk" | "drink" | "walk" | "fun" | "other";

export type NowPost = {
  id: string;
  uid: string;
  nickname: string;
  text: string;
  mood: NowMood;
  region: string;
  createdAt: number;
  lat?: number;
  lng?: number;
};

export type CreateNowPostInput = {
  uid: string;
  nickname: string;
  text: string;
  mood: NowMood;
  lat: number;
  lng: number;
};

// region = довольно крупный квадрат (порядка десятков км),
// а точный радиус уже режем по расстоянию на клиенте.
export function makeRegion(lat: number, lng: number): string {
  const geohash = geohashForLocation([lat, lng]);
  return geohash.slice(0, 3); // ~100–150 км охвата
}

export function subscribeNowPosts(
  db: Firestore,
  region: string,
  onPosts: (posts: NowPost[]) => void
) {
  const baseRef = collection(db, "nowPosts");
  const constraints: QueryConstraint[] = [
    where("region", "==", region),
    orderBy("createdAt", "desc"),
    limit(200),
  ];

  const q = query(baseRef, ...constraints);

  return onSnapshot(q, (snap) => {
    const list: NowPost[] = snap.docs.map((d) => {
      const x = d.data() as any;
      const lat =
        typeof x.lat === "number" ? (x.lat as number) : undefined;
      const lng =
        typeof x.lng === "number" ? (x.lng as number) : undefined;

      return {
        id: d.id,
        uid: String(x.uid ?? ""),
        nickname: String(x.nickname ?? "Аноним"),
        text: String(x.text ?? ""),
        mood: (x.mood as NowMood) ?? "other",
        region: String(x.region ?? ""),
        createdAt: Number(x.createdAt ?? 0),
        lat,
        lng,
      };
    });

    onPosts(list);
  });
}

export async function createNowPost(
  db: Firestore,
  input: CreateNowPostInput
) {
  const region = makeRegion(input.lat, input.lng);
  const now = Date.now();

  await addDoc(collection(db, "nowPosts"), {
    uid: input.uid,
    nickname: input.nickname,
    text: input.text.trim(),
    mood: input.mood,
    region,
    createdAt: now,
    lat: input.lat,
    lng: input.lng,
  });
}
