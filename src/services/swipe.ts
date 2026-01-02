import { auth, db } from "@/config/firebaseConfig";
import { sendPushAsync } from "@/services/notifications";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";

const pairId = (a: string, b: string) => [a, b].sort().join("_");

export type SwipeCandidate = {
  id: string;
  name?: string;
  age?: number;
  avatar?: string;
  bio?: string;
  intents?: string[];
  interests?: string[];
  lat?: number;
  lng?: number;
};

const DAILY_LIKES = 50;
const DAILY_SUPERLIKES = 5;

type QuotaSnapshot = {
  date: string;
  likes: number;
  superlikes: number;
};

export type LikeResult = {
  matched: boolean;
  chatId: string | null;
  quotaLeft: number;
};

type ProfileDoc = Record<string, any> | null;

async function getProfile(uid: string): Promise<ProfileDoc> {
  const ref = doc(db, "profiles", uid);
  const snapshot = await getDoc(ref);
  return snapshot.exists() ? (snapshot.data() as Record<string, any>) : null;
}

async function getOrInitQuota(uid: string) {
  const ref = doc(db, "quota", uid);
  const snapshot = await getDoc(ref);
  const today = new Date().toISOString().slice(0, 10);
  let data: QuotaSnapshot = { date: today, likes: 0, superlikes: 0 };

  if (snapshot.exists()) {
    data = { ...data, ...(snapshot.data() as Partial<QuotaSnapshot>) };
  }

  if (data.date !== today) {
    data = { date: today, likes: 0, superlikes: 0 };
  }

  return { ref, data };
}

const hasCoords = (lat?: number, lng?: number) =>
  typeof lat === "number" && typeof lng === "number";

/** Вернём пачку кандидатов, исключая себя/заблокированных/уже свайпнутых */
export async function fetchCandidates(max = 10): Promise<SwipeCandidate[]> {
  const me = auth?.currentUser?.uid;
  if (!me) return [];

  const likedSnap = await getDocs(collection(db, "likes", me, "outgoing"));
  const passedSnap = await getDocs(collection(db, "passes", me, "outgoing"));
  const exclude = new Set<string>();
  likedSnap.forEach((docSnap) => exclude.add(docSnap.id));
  passedSnap.forEach((docSnap) => exclude.add(docSnap.id));
  exclude.add(me);

  const snap = await getDocs(query(collection(db, "profiles"), limit(100)));
  const all: SwipeCandidate[] = [];
  snap.forEach((docSnap) => {
    if (!exclude.has(docSnap.id)) {
      const v = docSnap.data() as Record<string, any>;
      all.push({
        id: docSnap.id,
        name: v.name,
        age: v.age,
        avatar: v.avatar,
        bio: v.bio,
        intents: v.intents,
        interests: v.interests,
        lat: v.lat,
        lng: v.lng,
      });
    }
  });

  const meProfile = await getProfile(me);
  const myIntents = new Set<string>(
    (meProfile?.intents || []).map((s: string) => String(s).toLowerCase()),
  );
  const myInterests = new Set<string>(
    (meProfile?.interests || []).map((s: string) =>
      String(s).toLowerCase().trim(),
    ),
  );
  const myLat = meProfile?.lat;
  const myLng = meProfile?.lng;

  const score = (candidate: SwipeCandidate) => {
    let sum = 0;
    (candidate.intents || []).forEach((intent) => {
      if (myIntents.has(String(intent).toLowerCase())) sum += 3;
    });
    (candidate.interests || []).forEach((interest) => {
      if (myInterests.has(String(interest).toLowerCase().trim())) sum += 1;
    });
    if (hasCoords(myLat, myLng) && hasCoords(candidate.lat, candidate.lng)) {
      const d = Math.hypot(
        (myLat as number) - (candidate.lat as number),
        (myLng as number) - (candidate.lng as number),
      );
      sum += Math.max(0, 5 - d * 100);
    }
    return sum;
  };

  all.sort((a, b) => score(b) - score(a));
  return all.slice(0, max);
}

export async function passUser(targetUid: string) {
  const me = auth?.currentUser?.uid;
  if (!me || !targetUid) return;
  await setDoc(
    doc(db, "passes", me, "outgoing", targetUid),
    {
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function likeUser(targetUid: string): Promise<LikeResult> {
  const me = auth?.currentUser?.uid;
  if (!me || !targetUid) return { matched: false, chatId: null, quotaLeft: 0 };

  const { ref, data } = await getOrInitQuota(me);
  if (data.likes >= DAILY_LIKES) {
    await setDoc(ref, data, { merge: true });
    return { matched: false, chatId: null, quotaLeft: 0 };
  }

  const myLikeRef = doc(db, "likes", me, "outgoing", targetUid);
  const theirLikeRef = doc(db, "likes", targetUid, "outgoing", me);
  await setDoc(myLikeRef, { createdAt: serverTimestamp() }, { merge: true });
  data.likes += 1;
  await setDoc(ref, data, { merge: true });

  const theyLiked = await getDoc(theirLikeRef);
  if (theyLiked.exists()) {
    const id = pairId(me, targetUid);
    const matchRef = doc(db, "matches", id);
    const chatRef = doc(db, "chats", id);

    const batch = writeBatch(db);
    batch.set(matchRef, {
      id,
      members: [me, targetUid],
      createdAt: serverTimestamp(),
    });
    batch.set(
      chatRef,
      {
        id,
        members: [me, targetUid],
        createdAt: serverTimestamp(),
        lastText: "",
        lastAt: serverTimestamp(),
      },
      { merge: true },
    );
    await batch.commit();

    const meProfile = await getProfile(me);
    const youProfile = await getProfile(targetUid);
    const tokens: string[] = [];
    if (meProfile?.expoPushToken) tokens.push(meProfile.expoPushToken);
    if (youProfile?.expoPushToken) tokens.push(youProfile.expoPushToken);
    if (tokens.length) {
      await sendPushAsync(
        tokens,
        "Новый матч!",
        "У вас совпадение — начни чат!",
      );
    }

    return {
      matched: true,
      chatId: id,
      quotaLeft: Math.max(0, DAILY_LIKES - data.likes),
    };
  }
  return {
    matched: false,
    chatId: null,
    quotaLeft: Math.max(0, DAILY_LIKES - data.likes),
  };
}

export async function superLikeUser(targetUid: string): Promise<LikeResult> {
  const me = auth?.currentUser?.uid;
  if (!me || !targetUid) return { matched: false, chatId: null, quotaLeft: 0 };

  const { ref, data } = await getOrInitQuota(me);
  if (data.superlikes >= DAILY_SUPERLIKES) {
    await setDoc(ref, data, { merge: true });
    return { matched: false, chatId: null, quotaLeft: 0 };
  }

  data.superlikes += 1;
  await setDoc(ref, data, { merge: true });

  await setDoc(
    doc(db, "likes", me, "outgoing", targetUid),
    { createdAt: serverTimestamp(), super: true },
    { merge: true },
  );

  const youProfile = await getProfile(targetUid);
  if (youProfile?.expoPushToken) {
    await sendPushAsync(
      youProfile.expoPushToken,
      "Суперлайк ✨",
      "Кто-то суперлайкнул ваш профиль",
    );
  }

  const theyLiked = await getDoc(doc(db, "likes", targetUid, "outgoing", me));
  if (theyLiked.exists()) {
    const id = pairId(me, targetUid);
    const matchRef = doc(db, "matches", id);
    const chatRef = doc(db, "chats", id);
    const batch = writeBatch(db);
    batch.set(matchRef, {
      id,
      members: [me, targetUid],
      createdAt: serverTimestamp(),
    });
    batch.set(
      chatRef,
      {
        id,
        members: [me, targetUid],
        createdAt: serverTimestamp(),
        lastText: "",
        lastAt: serverTimestamp(),
      },
      { merge: true },
    );
    await batch.commit();

    const meProfile = await getProfile(me);
    const tokens: string[] = [];
    if (meProfile?.expoPushToken) tokens.push(meProfile.expoPushToken);
    if (youProfile?.expoPushToken) tokens.push(youProfile.expoPushToken);
    if (tokens.length) {
      await sendPushAsync(
        tokens,
        "Новый матч!",
        "У вас совпадение — начни чат!",
      );
    }

    return {
      matched: true,
      chatId: id,
      quotaLeft: Math.max(0, DAILY_SUPERLIKES - data.superlikes),
    };
  }

  return {
    matched: false,
    chatId: null,
    quotaLeft: Math.max(0, DAILY_SUPERLIKES - data.superlikes),
  };
}

export function messagesRef(chatId: string) {
  return collection(db, "chats", chatId, "messages");
}

export async function sendMessage(chatId: string, text: string) {
  const me = auth?.currentUser?.uid;
  if (!me || !text.trim()) return;
  const clean = text.trim();
  await addDoc(messagesRef(chatId), {
    text: clean,
    author: me,
    createdAt: serverTimestamp(),
  });
  await setDoc(
    doc(db, "chats", chatId),
    { lastText: clean, lastAt: serverTimestamp() },
    { merge: true },
  );
}
