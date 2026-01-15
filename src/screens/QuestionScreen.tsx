import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View, Button } from "react-native";
import {
  QUESTIONS,
  getDailyQuestionId,
  loadQuestionOfTheDayAnswer,
  saveQuestionOfTheDayAnswer,
} from "@/services/questions";
import { theme } from "@/theme";
import { useLocale } from "@/contexts/LocaleContext";

const QuestionScreen: React.FC = () => {
  const { t } = useLocale();
  const [answer, setAnswer] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const questionKey = useMemo(() => {
    const id = getDailyQuestionId();
    const q = QUESTIONS.find((item) => item.id === id);
    return q?.textKey ?? "question.title";
  }, []);

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      setErrorKey(null);

      try {
        const saved = await loadQuestionOfTheDayAnswer();
        if (saved) {
          setAnswer(saved);
          setIsSaved(true);
        }
      } catch {
        setErrorKey("question.loadError");
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
    setErrorKey(null);

    try {
      await saveQuestionOfTheDayAnswer(trimmed);
      setIsSaved(true);
    } catch (err) {
      console.error(
        "[QuestionScreen] Failed to save question of the day answer",
        err,
      );
      setErrorKey("question.saveError");
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
      <Text style={styles.title}>{t("question.title")}</Text>

      {errorKey && <Text style={styles.error}>{t(errorKey)}</Text>}

      <Text style={styles.question}>{t(questionKey)}</Text>

      <TextInput
        style={styles.input}
        multiline
        placeholder={t("question.answerPlaceholder")}
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
          title={
            isSaving
              ? t("question.saving")
              : isSaved
                ? t("question.saved")
                : t("question.save")
          }
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
