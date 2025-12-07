import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { theme } from "@/theme";
import type { Goal, Mood, UserProfile } from "../models/User";
import { getUserProfile, updateUserFields } from "../services/user";

const GOAL_OPTIONS: Goal[] = [
  "dating",
  "friends",
  "chat",
  "long_term",
  "short_term",
  "casual",
  "sex",
];

const MOOD_OPTIONS: Mood[] = [
  "happy",
  "chill",
  "active",
  "serious",
  "party",
];

function goalLabel(goal: Goal): string {
  switch (goal) {
    case "dating":
      return "Знакомства";
    case "friends":
      return "Дружба";
    case "chat":
      return "Чат";
    case "long_term":
      return "Серьёзные отношения";
    case "short_term":
      return "Лёгкие встречи";
    case "casual":
      return "Casual / флирт";
    case "sex":
      return "Только секс";
    default:
      return goal;
  }
}

function moodLabel(mood: Mood): string {
  switch (mood) {
    case "happy":
      return "Весёлое";
    case "chill":
      return "Спокойное";
    case "active":
      return "В движении";
    case "serious":
      return "Серьёзный настрой";
    case "party":
      return "Готов(а) тусить";
    default:
      return mood;
  }
}

export default function EditProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [interestsText, setInterestsText] = useState("");
  const [goal, setGoal] = useState<Goal>("dating");
  const [mood, setMood] = useState<Mood>("happy");

  const [allowAdultMode, setAllowAdultMode] = useState(false);
  const [mysteryMode, setMysteryMode] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const profile: UserProfile | null = await getUserProfile();
        if (!profile) {
          setLoading(false);
          return;
        }

        setDisplayName(profile.displayName ?? "");
        setAbout(profile.about ?? "");
        setInterestsText((profile.interests ?? []).join(", "));
        setGoal(profile.goal ?? "dating");
        setMood(profile.mood ?? "happy");
        setAllowAdultMode(profile.allowAdultMode ?? false);
        setMysteryMode(profile.mysteryMode ?? false);
      } catch (e) {
        console.warn("EditProfileScreen load error", e);
        Alert.alert("Ошибка", "Не удалось загрузить профиль.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const interestsArray = interestsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await updateUserFields({
        displayName,
        about,
        interests: interestsArray,
        goal,
        mood,
        allowAdultMode,
        mysteryMode,
      });

      Alert.alert("Готово", "Профиль обновлён.");
    } catch (e) {
      console.warn("EditProfileScreen save error", e);
      Alert.alert("Ошибка", "Не удалось сохранить изменения.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
        <Text
          style={{
            marginTop: 8,
            color: theme.colors.subtext,
          }}
        >
          Загружаем профиль…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: theme.spacing,
        paddingBottom: theme.spacing * 2,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: "800",
          color: theme.colors.text,
          marginBottom: 16,
        }}
      >
        Мой профиль
      </Text>

      {/* Имя */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        Имя
      </Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder="Как тебя зовут?"
        placeholderTextColor={theme.colors.muted}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
          marginBottom: 12,
        }}
      />

      {/* О себе */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        О себе
      </Text>
      <TextInput
        value={about}
        onChangeText={setAbout}
        multiline
        placeholder="Пара строк о тебе…"
        placeholderTextColor={theme.colors.muted}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
          minHeight: 80,
          textAlignVertical: "top",
          marginBottom: 12,
        }}
      />

      {/* Интересы */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        Интересы (через запятую)
      </Text>
      <TextInput
        value={interestsText}
        onChangeText={setInterestsText}
        placeholder="музыка, путешествия, спорт…"
        placeholderTextColor={theme.colors.muted}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
          marginBottom: 16,
        }}
      />

      {/* Цель знакомства */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        Цель знакомства
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {GOAL_OPTIONS.map((g) => {
          const active = goal === g;
          return (
            <TouchableOpacity
              key={g}
              onPress={() => setGoal(g)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: theme.shapes.pill,
                marginRight: 8,
                marginBottom: 8,
                backgroundColor: active
                  ? theme.colors.primary
                  : theme.colors.pillBg,
              }}
            >
              <Text
                style={{
                  color: active ? "#FFFFFF" : theme.colors.pillText,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {goalLabel(g)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Настроение */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        Текущее настроение
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {MOOD_OPTIONS.map((m) => {
          const active = mood === m;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => setMood(m)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: theme.shapes.pill,
                marginRight: 8,
                marginBottom: 8,
                backgroundColor: active
                  ? theme.colors.accent
                  : theme.colors.pillBg,
              }}
            >
              <Text
                style={{
                  color: active ? "#FFFFFF" : theme.colors.pillText,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {moodLabel(m)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Переключатели 18+ и Mystery */}
      <View
        style={{
          marginTop: 8,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.borderSubtle,
        }}
      >
        {/* 18+ / casual */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 14,
                fontWeight: "600",
                marginBottom: 2,
              }}
            >
              18+ режим / casual
            </Text>
            <Text
              style={{
                color: theme.colors.subtext,
                fontSize: 12,
              }}
            >
              Показывать меня тем, кто ищет кэжуал / 18+ формат.
            </Text>
          </View>
          <Switch
            value={allowAdultMode}
            onValueChange={setAllowAdultMode}
          />
        </View>

        {/* Mystery-режим */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 14,
                fontWeight: "600",
                marginBottom: 2,
              }}
            >
              Режим тайны
            </Text>
            <Text
              style={{
                color: theme.colors.subtext,
                fontSize: 12,
              }}
            >
              Фото и детали профиля открываются постепенно при общении.
            </Text>
          </View>
          <Switch
            value={mysteryMode}
            onValueChange={setMysteryMode}
          />
        </View>
      </View>

      {/* Кнопка сохранения */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={{
          marginTop: 24,
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radius,
          paddingVertical: 12,
          alignItems: "center",
          justifyContent: "center",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Сохранить
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
