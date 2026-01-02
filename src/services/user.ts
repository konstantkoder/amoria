import { auth, db } from "@/config/firebaseConfig";
import type { UserProfile } from "@/models/User";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { ensureAuth } from "./firebase";

export async function getCurrentUser() {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  return { id: uid, ...(snap.data() || {}) } as any;
}

export async function updateMySettings(patch: Record<string, any>) {
  const uid = auth?.currentUser?.uid;
  if (!uid) throw new Error("Not signed in");
  const ref = doc(db, "users", uid);
  await setDoc(ref, patch, { merge: true });
}

export async function getUserProfile(): Promise<UserProfile | null> {
  const uid = auth?.currentUser?.uid ?? (await ensureAuth());
  if (!uid) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid, ...(snap.data() || {}) } as UserProfile;
}

export async function updateUserFields(
  fields: Partial<UserProfile>,
): Promise<void> {
  const uid = auth?.currentUser?.uid ?? (await ensureAuth());
  const ref = doc(db, "users", uid);
  await setDoc(
    ref,
    {
      ...fields,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}
