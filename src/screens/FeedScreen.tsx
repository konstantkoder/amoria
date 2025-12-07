import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Text, Alert, TouchableOpacity } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";

import UserCard from "@/components/UserCard";
import { DEMO_USERS, type DemoUser } from "@/services/demoUsers";
import { QUESTIONS, getDailyQuestionId } from "@/services/questions";
import { loadAdultModeEnabled } from "@/services/adultMode";
import { theme } from "@/theme";
import VoiceIntroModal from "@/components/VoiceIntroModal";

export default function FeedScreen() {
  const [adultModeEnabled, setAdultModeEnabled] = useState(false);
  const [voiceIntroUser, setVoiceIntroUser] = useState<DemoUser | null>(null);
  const questionText = useMemo(() => {
    const qid = getDailyQuestionId();
    const q = QUESTIONS.find((item) => item.id === qid);
    return q?.text ?? "Сегодняшний вопрос недоступен.";
  }, []);

  const previewUsers = useMemo(() => {
    return DEMO_USERS.slice(0, 5);
  }, []);

  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  useEffect(() => {
    let isMounted = true;
    (async () => {
      const enabled = await loadAdultModeEnabled();
      if (isMounted) {
        setAdultModeEnabled(enabled);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleOpenUser = (user: DemoUser) => {
    const subtitle =
      user.bio ??
      user.about ??
      "В полной версии здесь откроется подробный профиль и чат.";
    const title = user.displayName ?? user.name ?? "Профиль";
    const ageSuffix = user.age ? `, ${user.age}` : "";

    Alert.alert(
      `${title}${ageSuffix}`,
      `${subtitle}\n\nСейчас это демо-профиль. В релизе здесь будет экран анкеты и чат.`,
      [{ text: "OK" }]
    );
  };

  const handleOpenVoiceIntro = (user: DemoUser) => {
    setVoiceIntroUser(user);
  };

  const handleCloseVoiceIntro = () => {
    setVoiceIntroUser(null);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32 + insets.bottom,
        }}
      >
        {/* Верхняя шапка: логотип + профиль */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 20,
              fontWeight: "800",
            }}
          >
            AMORIA
          </Text>

          <TouchableOpacity
            activeOpacity={0.9}
            onPress={() => navigation.navigate("Profile" as never)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: "rgba(148, 163, 184, 0.18)",
            }}
          >
            <Text style={{ fontSize: 16, marginRight: 6 }}>👤</Text>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Профиль
            </Text>
          </TouchableOpacity>
        </View>

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

        {!adultModeEnabled && (
          <Text
            style={{
              color: "#A1A1AA",
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            18+ цели (casual/sex) сейчас скрыты. Ты можешь включить 18+ режим
            во вкладке «Profile», чтобы видеть больше анкет.
          </Text>
        )}

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
          <View key={user.uid} style={{ marginBottom: 16, height: 320 }}>
            <UserCard
              user={user}
              onPress={handleOpenUser}
              onPressVoiceIntro={handleOpenVoiceIntro}
            />
          </View>
        ))}
      </ScrollView>
      <VoiceIntroModal
        visible={!!voiceIntroUser}
        onClose={handleCloseVoiceIntro}
        userName={voiceIntroUser?.displayName ?? voiceIntroUser?.name}
        durationSeconds={voiceIntroUser?.voiceIntroDurationSec ?? 8}
      />
    </SafeAreaView>
  );
}
