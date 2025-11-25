import { Alert } from "react-native";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/config/firebaseConfig";

const chatIdFor = (a: string, b: string) => [a, b].sort().join("_");

export async function startOrGetThread(meId: string, otherId: string) {
  const chatId = chatIdFor(meId, otherId);
  const ref = doc(db, "chats", chatId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(
      ref,
      {
        id: chatId,
        members: [meId, otherId],
        createdAt: serverTimestamp(),
        lastText: "",
        lastAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  return { id: chatId };
}

export async function startChatIfAllowed(me: any, target: any) {
  if (!me?.id || !target?.id) {
    Alert.alert("Ошибка", "Профиль недоступен");
    return;
  }
  const can = !!(target?.nearbyOpen || me?.nearbyOpen);
  if (!can) {
    Alert.alert(
      "Пока нельзя",
      "Пользователь принимает сообщения только по взаимной симпатии",
    );
    return;
  }
  const thread = await startOrGetThread(me.id, target.id);
  const nav = (globalThis as any).__NAV;
  if (!nav?.navigate) {
    console.warn("Navigation reference is not ready");
    return;
  }
  nav.navigate("Root", {
    screen: "Chat",
    params: { chatId: thread.id, peerId: target.id },
  });
}
