import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Button,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { db, isFirebaseConfigured, ensureAuth } from "../services/firebase";
import { getDailyQuestionId, QUESTIONS } from "../services/questions";
import { theme } from "../theme/theme";

const STORAGE_PREFIX = "answer_";

const QuestionScreen: React.FC = () => {
  const [questionId, setQuestionId] = useState<string>("");
  const [questionText, setQuestionText] = useState<string>("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const id = getDailyQuestionId();
    setQuestionId(id);

    const q = QUESTIONS.find((q) => q.id === id);
    setQuestionText(q ? q.text : "Вопрос дня");

    loadAnswer(id).catch((e) => {
      console.warn("QuestionScreen load error", e);
    });
  }, []);

  async function loadAnswer(id: string) {
    try {
      setLoading(true);
      setError(null);

      if (isFirebaseConfigured()) {
        const uid = await ensureAuth();
        const ref = doc(db, "answers", `${uid}_${id}`);
        const snap = await getDoc(ref);

        if (snap.exists()) {
          const data = snap.data() as any;
          if (data?.answer) {
            setAnswer(data.answer);
            return;
          }
        }
      } else {
        const stored = await AsyncStorage.getItem(`${STORAGE_PREFIX}${id}`);
        if (stored) {
          setAnswer(stored);
          return;
        }
      }
    } catch (e: any) {
      console.warn("QuestionScreen load error", e);
      setError(e?.message ?? "Ошибка загрузки ответа");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);

      const trimmed = answer.trim();
      if (!trimmed) {
        Alert.alert("Ответ пустой", "Напиши что-нибудь в ответ на вопрос дня.");
        return;
      }

      if (isFirebaseConfigured()) {
        const uid = await ensureAuth();
        const ref = doc(db, "answers", `${uid}_${questionId}`);
        await setDoc(ref, {
          uid,
          questionId,
          answer: trimmed,
          updatedAt: Date.now(),
        });
      } else {
        await AsyncStorage.setItem(
          `${STORAGE_PREFIX}${questionId}`,
          trimmed
        );
      }

      Alert.alert("Сохранено", "Твой ответ на вопрос дня сохранён.");
    } catch (e: any) {
      console.warn("QuestionScreen save error", e);
      setError(e?.message ?? "Ошибка сохранения");
      Alert.alert("Ошибка", "Не удалось сохранить ответ. Попробуй ещё раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={styles.title}>Вопрос дня</Text>

      {error && <Text style={styles.error}>{error}</Text>}

      <Text style={styles.question}>{questionText}</Text>

      <TextInput
        style={styles.input}
        multiline
        placeholder="Твой ответ..."
        placeholderTextColor="#9CA3AF"
        value={answer}
        onChangeText={setAnswer}
        editable={!saving}
      />

      <View style={styles.buttonWrapper}>
        <Button
          title={saving ? "Сохраняю..." : "Сохранить"}
          onPress={handleSave}
          disabled={saving || loading}
        />
      </View>
    </ScrollView>
  );
};

export default QuestionScreen;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  contentContainer: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#FFFFFF",
    marginBottom: 12,
  },
  question: {
    fontSize: 18,
    color: "#E5E7EB",
    marginBottom: 16,
  },
  input: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#374151",
    padding: 12,
    color: "#FFFFFF",
    textAlignVertical: "top",
    backgroundColor: "#111827",
  },
  buttonWrapper: {
    marginTop: 16,
  },
  error: {
    color: "#F87171",
    marginBottom: 8,
  },
});
