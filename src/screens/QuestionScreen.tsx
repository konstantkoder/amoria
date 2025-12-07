import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, Button } from "react-native";
import {
  QUESTIONS,
  getDailyQuestionId,
  loadQuestionOfTheDayAnswer,
  saveQuestionOfTheDayAnswer,
} from "@/services/questions";
import { theme } from "@/theme";

const QuestionScreen: React.FC = () => {
  const [questionText, setQuestionText] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const id = getDailyQuestionId();
    const q = QUESTIONS.find((item) => item.id === id);
    setQuestionText(q ? q.text : "Вопрос дня");

    (async () => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const saved = await loadQuestionOfTheDayAnswer();
        if (saved) {
          setAnswer(saved);
          setIsSaved(true);
        }
      } catch (err) {
        console.warn(
          "[QuestionScreen] Failed to load question of the day answer",
          err,
        );
        setErrorMessage("Не удалось загрузить ответ.");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    const trimmed = answer.trim();
    if (!trimmed) {
      return;
    }

    if (isSaving) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      await saveQuestionOfTheDayAnswer(trimmed);
      setIsSaved(true);
    } catch (err) {
      console.error(
        "[QuestionScreen] Failed to save question of the day answer",
        err,
      );
      setErrorMessage("Не удалось сохранить ответ. Попробуй ещё раз.");
      setIsSaved(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
    >
      <Text style={styles.title}>Вопрос дня</Text>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Text style={styles.question}>{questionText}</Text>

      <TextInput
        style={styles.input}
        multiline
        placeholder="Твой ответ..."
        placeholderTextColor="#9CA3AF"
        value={answer}
        onChangeText={(text) => {
          setAnswer(text);
          setIsSaved(false);
        }}
        editable={!isSaving && !isLoading}
      />

      <View style={styles.buttonWrapper}>
        <Button
          title={isSaving ? "СОХРАНЯЮ..." : isSaved ? "СОХРАНЕНО" : "СОХРАНИТЬ"}
          onPress={handleSave}
          disabled={isSaving || isLoading || !answer.trim()}
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
