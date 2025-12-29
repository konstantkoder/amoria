import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, View, Text, Alert, TouchableOpacity } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import UserCard from "@/components/UserCard";
import { DEMO_USERS, type DemoUser } from "@/services/demoUsers";
import { QUESTIONS, getDailyQuestionId } from "@/services/questions";
import { loadAdultModeEnabled } from "@/services/adultMode";
import { theme } from "@/theme";
import VoiceIntroModal from "@/components/VoiceIntroModal";
import ScreenShell from "@/components/ScreenShell";
import { addDislike, addLike, getDislikes, getLikes } from "@/services/likes";

const getStableUserId = (user: DemoUser) =>
  (user as { id?: string }).id ?? user.uid ?? "";

export default function FeedScreen() {
  const [adultModeEnabled, setAdultModeEnabled] = useState(false);
  const [voiceIntroUser, setVoiceIntroUser] = useState<DemoUser | null>(null);
  const [likedIds, setLikedIds] = useState<string[]>([]);
  const [likedCount, setLikedCount] = useState(0);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const questionText = useMemo(() => {
    const qid = getDailyQuestionId();
    const q = QUESTIONS.find((item) => item.id === qid);
    return q?.text ?? "Сегодняшний вопрос недоступен.";
  }, []);

  const previewUsers = useMemo(() => {
    return DEMO_USERS.slice(0, 5);
  }, []);

  const visibleUsers = useMemo(() => {
    return previewUsers
      .map((user) => ({
        user,
        userId: getStableUserId(user),
      }))
      .filter((item) => !dismissedIds.has(item.userId));
  }, [previewUsers, dismissedIds]);

  const insets = useSafeAreaInsets();
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

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [likes, dislikes] = await Promise.all([
          getLikes(),
          getDislikes(),
        ]);
        if (alive) {
          setLikedIds(likes);
          setLikedCount(likes.length);
          setDismissedIds((prev) => new Set([...prev, ...likes, ...dislikes]));
        }
      } catch {
        // ignore
      }
    };
    load();
    return () => {
      alive = false;
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

  const dismissUser = (userId: string) => {
    if (!userId) return;
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(userId);
      return next;
    });
  };

  const onLike = async (user: DemoUser, userId: string) => {
    const resolvedId = userId || getStableUserId(user);
    dismissUser(resolvedId);
    try {
      if (resolvedId) {
        // TODO: Wire real match+chat flow via services/social.ts or services/swipe.ts.
        const next = await addLike(resolvedId);
        setLikedIds(next);
        setLikedCount(next.length);
        setDismissedIds((prev) => new Set([...prev, ...next]));
      } else {
        setLikedCount((prev) => prev + 1);
      }
    } catch {
      // ignore
    }
    Alert.alert("Лайк", "Лайк сохранён (demo). Позже тут будет чат/матч.");
  };

  const onDislike = async (user: DemoUser, userId: string) => {
    const resolvedId = userId || getStableUserId(user);
    dismissUser(resolvedId);
    if (!resolvedId) return;
    try {
      const next = await addDislike(resolvedId);
      setDismissedIds((prev) => new Set([...prev, ...next]));
    } catch {
      // ignore
    }
  };

  const isLiked = (userId: string) => likedIds.includes(userId);

  return (
    <ScreenShell
      title="AMORIA"
      background="hearts"
      debugTint={false}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 32 + insets.bottom,
        }}
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
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 18,
              fontWeight: "600",
            }}
          >
            Рядом с тобой
          </Text>
          <Text style={{ color: "#9CA3AF", fontSize: 12, fontWeight: "600" }}>
            Лайкнутые: {likedCount}
          </Text>
        </View>

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

        {visibleUsers.length === 0 && (
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 14,
            }}
          >
            Поблизости пока никого. Попробуй позже.
          </Text>
        )}

        {visibleUsers.map(({ user, userId }) => (
          <View key={userId} style={{ marginBottom: 18 }}>
            <View style={{ height: 320 }}>
              <UserCard
                user={user}
                onPress={handleOpenUser}
                onPressVoiceIntro={handleOpenVoiceIntro}
              />
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 10,
                marginTop: 10,
              }}
            >
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => onDislike(user, userId)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: "rgba(148, 163, 184, 0.14)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.08)",
                }}
              >
                <Ionicons name="close" size={22} color="#fff" />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => onLike(user, userId)}
                style={{
                  flex: 1,
                  height: 46,
                  borderRadius: 16,
                  alignItems: "center",
                  justifyContent: "center",
                backgroundColor: isLiked(userId)
                    ? "rgba(34, 197, 94, 0.22)"
                    : "rgba(236, 72, 153, 0.22)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                }}
              >
                <Ionicons name="checkmark" size={22} color="#fff" />
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
      <VoiceIntroModal
        visible={!!voiceIntroUser}
        onClose={handleCloseVoiceIntro}
        userName={voiceIntroUser?.displayName ?? voiceIntroUser?.name}
        durationSeconds={voiceIntroUser?.voiceIntroDurationSec ?? 8}
      />
    </ScreenShell>
  );
}
