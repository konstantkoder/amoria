import AsyncStorage from "@react-native-async-storage/async-storage";
import { isFirebaseConfigured, db } from "@/config/firebaseConfig";
import { getCurrentUser } from "@/services/user";
import { collection, doc, setDoc } from "firebase/firestore";

export const QUESTIONS = [
  { id: "q1", text: "Что для тебя идеальное свидание?" },
  { id: "q2", text: "С кем из исторических личностей ты бы поужинал(а)?" },
  { id: "q3", text: "Горы или море? Почему?" },
  { id: "q4", text: "Какая песня всегда поднимает тебе настроение?" },
];

export function getDailyQuestionId(date = new Date()) {
  const base = new Date("2025-01-01");
  const days = Math.floor(
    (date.getTime() - base.getTime()) / (1000 * 60 * 60 * 24),
  );
  const idx = days % QUESTIONS.length;
  return QUESTIONS[idx].id;
}

const LOCAL_QOTD_KEY = "@amoria_qotd_answer";

export async function saveQuestionOfTheDayAnswer(
  answer: string,
): Promise<void> {
  const trimmed = answer.trim();
  if (!trimmed) return;

  const payload = {
    answer: trimmed,
    updatedAt: Date.now(),
  };

  try {
    await AsyncStorage.setItem(LOCAL_QOTD_KEY, JSON.stringify(payload));
  } catch (err) {
    console.error("[questions] Failed to save local QOTD answer", err);
  }

  if (!isFirebaseConfigured() || !db) {
    return;
  }

  try {
    const user = await getCurrentUser();
    const uid = (user as any)?.uid ?? (user as any)?.id;
    if (!uid) {
      return;
    }

    const ref = doc(collection(db, "questionAnswers"), uid);
    await setDoc(
      ref,
      {
        answer: trimmed,
        updatedAt: new Date().toISOString(),
      },
      { merge: true },
    );
  } catch (err) {
    console.error("[questions] Firestore save failed", err);
  }
}

export async function loadQuestionOfTheDayAnswer(): Promise<string> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_QOTD_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    return typeof parsed.answer === "string" ? parsed.answer : "";
  } catch (err) {
    console.error("[questions] Failed to load local QOTD answer", err);
    return "";
  }
}
