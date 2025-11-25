import React, { useMemo } from "react";
import { ScrollView, View, Text } from "react-native";

import { DEMO_USERS } from "../services/demoUsers";
import { QUESTIONS, getDailyQuestionId } from "../services/questions";
import UserCard from "../components/UserCard";
import { theme } from "../theme/theme";

export default function FeedScreen() {
  const questionText = useMemo(() => {
    const qid = getDailyQuestionId();
    const q = QUESTIONS.find((item) => item.id === qid);
    return q?.text ?? "Сегодняшний вопрос недоступен.";
  }, []);

  const previewUsers = useMemo(() => {
    return DEMO_USERS.slice(0, 5);
  }, []);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      {/* Карточка "Вопрос дня" */}
      <View
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: 24,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 14,
            marginBottom: 8,
          }}
        >
          Вопрос дня
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: 18,
            fontWeight: "600",
            marginBottom: 8,
          }}
        >
          {questionText}
        </Text>
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 13,
          }}
        >
          Ответ можно написать во вкладке «Question» внизу экрана.
        </Text>
      </View>

      {/* Блок "Рядом с тобой" */}
      <Text
        style={{
          color: theme.colors.text,
          fontSize: 18,
          fontWeight: "600",
          marginBottom: 12,
        }}
      >
        Рядом с тобой
      </Text>

      {previewUsers.length === 0 && (
        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 14,
          }}
        >
          Поблизости пока никого. Попробуй позже.
        </Text>
      )}

      {previewUsers.map((user) => (
        <View key={user.uid} style={{ marginBottom: 16 }}>
          <UserCard user={user} />
        </View>
      ))}
    </ScrollView>
  );
}
