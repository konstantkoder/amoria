import { auth } from "@/config/firebaseConfig";
import { likeUser, passUser, LikeResult } from "@/services/swipe";
import { signInAnonymously, deleteUser, UserCredential } from "firebase/auth";
import {
  getFirestore,
  doc,
  setDoc,
  addDoc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  onSnapshot,
} from "firebase/firestore";

export async function ensureAuth(): Promise<string> {
  if (auth.currentUser) return auth.currentUser.uid;
  const cred: UserCredential = await signInAnonymously(auth);
  return cred.user.uid;
}

export async function reportUser(
  fromUid: string,
  toUid: string,
  reason: string,
) {
  const db = getFirestore();
  await addDoc(collection(db, "reports"), {
    fromUid,
    toUid,
    reason,
    createdAt: serverTimestamp(),
  });
}

export async function blockUser(uid: string, targetUid: string) {
  const db = getFirestore();
  await setDoc(doc(db, "users", uid, "blocks", targetUid), {
    blockedAt: serverTimestamp(),
  });
}

export async function deleteUserCompletely(uid: string) {
  if (auth.currentUser?.uid === uid) {
    await deleteUser(auth.currentUser);
  }
}

async function ensureUserDoc(uid: string) {
  const db = getFirestore();
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, { createdAt: serverTimestamp() }, { merge: true });
  }
  return ref;
}

export async function setAdultConsent(consented: boolean) {
  const uid = await ensureAuth();
  const ref = await ensureUserDoc(uid);
  await setDoc(
    ref,
    { adultOk: !!consented, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function setFlirtEnabledRemote(enabled: boolean) {
  const uid = await ensureAuth();
  const ref = await ensureUserDoc(uid);
  await setDoc(
    ref,
    { flirtEnabled: !!enabled, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function sendSpark(
  toUid: string,
  comment: string,
): Promise<boolean> {
  const db = getFirestore();
  const fromUid = await ensureAuth();
  const clean = comment.trim();
  if (!clean) throw new Error("Комментарий обязателен");

  const intentId = `${fromUid}_to_${toUid}`;
  await setDoc(doc(db, "intents", intentId), {
    fromUid,
    toUid,
    comment: clean,
    createdAt: serverTimestamp(),
  });

  const reverseSnap = await getDoc(
    doc(db, "intents", `${toUid}_to_${fromUid}`),
  );
  const mutual = reverseSnap.exists();

  if (mutual) {
    const matchId = [fromUid, toUid].sort().join("_");
    const participants = [fromUid, toUid];
    await setDoc(
      doc(db, "matches", matchId),
      {
        id: matchId,
        participants,
        members: participants,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  return mutual;
}

export async function swipeOn(
  targetUid: string,
  action: "like" | "pass",
): Promise<LikeResult> {
  if (action === "like") {
    return likeUser(targetUid);
  }
  await passUser(targetUid);
  return { matched: false, chatId: null, quotaLeft: Number.MAX_SAFE_INTEGER };
}

type MatchDoc = {
  id: string;
  members: string[];
  participants: string[];
  [key: string]: any;
};

function mapMatch(docSnap: any): MatchDoc {
  const data = docSnap.data() as any;
  const participants = (data.participants ?? data.members ?? []) as string[];
  const members = (data.members ?? participants) as string[];
  return {
    id: docSnap.id,
    ...data,
    participants,
    members,
  };
}

export function listenMyMatches(
  uid: string,
  callback: (rows: MatchDoc[]) => void,
) {
  const db = getFirestore();
  const matches = collection(db, "matches");
  let legacy: MatchDoc[] = [];
  let modern: MatchDoc[] = [];

  const emit = () => {
    const merged = new Map<string, MatchDoc>();
    [...legacy, ...modern].forEach((row) => {
      merged.set(row.id, row);
    });
    callback(Array.from(merged.values()));
  };

  const unsubMembers = onSnapshot(
    query(matches, where("members", "array-contains", uid)),
    (snap) => {
      legacy = snap.docs.map(mapMatch);
      emit();
    },
  );

  const unsubParticipants = onSnapshot(
    query(matches, where("participants", "array-contains", uid)),
    (snap) => {
      modern = snap.docs.map(mapMatch);
      emit();
    },
  );

  return () => {
    unsubMembers();
    unsubParticipants();
  };
}

// ----- SWIPES / MATCHES -----
// Док swipes/{fromUid_toUid} -> { fromUid, toUid, like, createdAt }
// Док matches/{autoId} -> { participants: [uidA, uidB], createdAt }
export async function submitSwipe(
  fromUid: string,
  toUid: string,
  like: boolean,
): Promise<{ matched: boolean }> {
  const db = getFirestore();
  const swipeId = `${fromUid}_${toUid}`;
  await setDoc(doc(db, "swipes", swipeId), {
    fromUid,
    toUid,
    like,
    createdAt: serverTimestamp(),
  });

  let matched = false;
  if (like) {
    const reverse = await getDoc(doc(db, "swipes", `${toUid}_${fromUid}`));
    if (reverse.exists() && reverse.data()?.like) {
      const q = query(
        collection(db, "matches"),
        where("participants", "array-contains", fromUid),
      );
      const existing = await getDocs(q);
      // простая вставка; в реальном проекте лучше нормализовать и дедуплицировать жёстче
      await addDoc(collection(db, "matches"), {
        participants: [fromUid, toUid].sort(),
        createdAt: serverTimestamp(),
      });
      matched = true;
    }
  }

  return { matched };
}

export async function fetchMatches(
  uid: string,
): Promise<Array<{ id: string; otherUid: string }>> {
  const db = getFirestore();
  const qy = query(
    collection(db, "matches"),
    where("participants", "array-contains", uid),
  );
  const snaps = await getDocs(qy);
  const res: Array<{ id: string; otherUid: string }> = [];
  snaps.forEach((docSnap) => {
    const participants = (docSnap.data().participants as string[]) ?? [];
    const other = participants.find((p) => p !== uid) ?? uid;
    res.push({ id: docSnap.id, otherUid: other });
  });
  return res;
}
