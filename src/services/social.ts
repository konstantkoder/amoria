import { db, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  setDoc,
  doc,
} from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

function sortedId(a: string, b: string) {
  return [a, b].sort().join("_");
}

export async function likeUser(fromUid: string, toUid: string) {
  if (!isFirebaseConfigured()) {
    // store locally
    const key = "likes_" + fromUid;
    const raw = (await AsyncStorage.getItem(key)) || "[]";
    const arr = JSON.parse(raw);
    if (!arr.includes(toUid)) {
      arr.push(toUid);
      await AsyncStorage.setItem(key, JSON.stringify(arr));
    }
    return await checkMatchLocal(fromUid, toUid);
  }
  const database = db;
  if (!database) {
    throw new Error("Firebase Firestore is not initialized");
  }

  await addDoc(collection(database, "likes"), {
    from: fromUid,
    to: toUid,
    createdAt: Date.now(),
  });
  // Check reciprocal like
  const q = query(
    collection(database, "likes"),
    where("from", "==", toUid),
    where("to", "==", fromUid),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    // create match
    const id = sortedId(fromUid, toUid);
    await setDoc(doc(database, "matches", id), {
      id,
      users: [fromUid, toUid],
      createdAt: Date.now(),
    });
    return true;
  }
  return false;
}

async function checkMatchLocal(a: string, b: string) {
  const aLikes = JSON.parse((await AsyncStorage.getItem("likes_" + a)) || "[]");
  const bLikes = JSON.parse((await AsyncStorage.getItem("likes_" + b)) || "[]");
  return aLikes.includes(b) && bLikes.includes(a);
}
