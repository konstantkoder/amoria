import {
  Firestore,
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

export async function sendDmMessage(
  db: Firestore,
  threadId: string,
  from: string,
  to: string,
  text: string,
  clientId: string
): Promise<string> {
  const value = String(text ?? "").trim();
  if (!value) return "";

  const stableClientId = String(clientId || "").trim();
  if (!stableClientId) return "";

  const msgRef = doc(collection(db, "dm", threadId, "messages"), stableClientId);
  await setDoc(
    msgRef,
    {
      clientId: stableClientId,
      from,
      to,
      text: value,
      createdAt: Date.now(),
      createdAtServer: serverTimestamp(),
    },
    { merge: true }
  );

  return msgRef.id;
}
