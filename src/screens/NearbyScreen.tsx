import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import * as Location from "expo-location";

import PillToggleRow from "@/components/PillToggleRow";
import { theme } from "@/theme";
import type { UserProfile, Goal, Mood } from "../models/User";
import { fetchNearbyUsers } from "../services/nearby";
import { getUserProfile } from "../services/user";
import UserCard from "../components/UserCard";
import { DEMO_USERS, type DemoUser } from "../services/demoUsers";
import { loadAdultModeEnabled } from "../services/adultMode";
import VoiceIntroModal from "@/components/VoiceIntroModal";

type RadiusFilter = "5" | "10" | "25";
type NearbyGoalFilter =
  | "all"
  | "dating"
  | "friends"
  | "chat"
  | "serious"
  | "light"
  | "casual"
  | "sex18";
type NearbyMoodFilter =
  | "any"
  | "fun"
  | "calm"
  | "moving"
  | "serious"
  | "party";

const ADULT_GOALS: Goal[] = ["casual", "sex"];

const mapGoalFilter = (filter: NearbyGoalFilter): Goal | null => {
  switch (filter) {
    case "all":
      return null;
    case "serious":
      return "long_term";
    case "light":
      return "short_term";
    case "sex18":
      return "sex";
    default:
      return filter;
  }
};

const mapMoodFilter = (filter: NearbyMoodFilter): Mood | null => {
  switch (filter) {
    case "any":
      return null;
    case "fun":
      return "happy";
    case "calm":
      return "chill";
    case "moving":
      return "active";
    default:
      return filter;
  }
};

export default function NearbyScreen() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [rawUsers, setRawUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [radiusFilter, setRadiusFilter] = useState<RadiusFilter>("10");
  const [nearbyGoalFilter, setNearbyGoalFilter] =
    useState<NearbyGoalFilter>("all");
  const [nearbyMoodFilter, setNearbyMoodFilter] =
    useState<NearbyMoodFilter>("any");
  const [adultModeEnabled, setAdultModeEnabled] = useState(false);
  const [voiceIntroUser, setVoiceIntroUser] = useState<UserProfile | null>(null);

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );

  const loadProfile = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (profile) {
        setCurrentUser(profile);
      }
    } catch (e) {
      console.warn("NearbyScreen: failed to load profile", e);
    }
  }, []);

  const loadLocationAndUsers = useCallback(
    async (opts?: { hardRefresh?: boolean }) => {
      const hardRefresh = opts?.hardRefresh ?? false;
      const radiusKm = Number(radiusFilter);
      try {
        if (!hardRefresh) {
          setLoading(true);
        } else {
          setRefreshing(true);
        }
        setError(null);

        let lat = coords?.lat;
        let lng = coords?.lng;

        if (!lat || !lng) {
          // Запрашиваем разрешение на геолокацию
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({});
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          } else {
            // Если пользователь не дал разрешение — используем пример: центр Загреба
            lat = 45.815;
            lng = 15.9819;
          }
          setCoords({ lat, lng });
        }

        if (lat == null || lng == null) {
          throw new Error("Нет координат для поиска людей рядом");
        }

        const nearby = await fetchNearbyUsers(lat, lng, radiusKm);
        setRawUsers(nearby);
      } catch (e: any) {
        console.warn("NearbyScreen: load error", e);
        setError(
          e?.message ||
            "Не удалось загрузить людей рядом. Попробуй обновить позже."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [coords, radiusFilter]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

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

  // Первый запуск + изменение радиуса
  useEffect(() => {
    loadLocationAndUsers();
  }, [loadLocationAndUsers]);

  const onRefresh = useCallback(() => {
    loadLocationAndUsers({ hardRefresh: true });
  }, [loadLocationAndUsers]);

  // Флаг: показывать ли 18+ цели (casual/sex)
  const allowAdult = adultModeEnabled;

  // Если из Firebase никого нет — используем DEMO_USERS
  const sourceUsers: UserProfile[] =
    rawUsers && rawUsers.length > 0 ? rawUsers : DEMO_USERS;

  const goalValue = mapGoalFilter(nearbyGoalFilter);
  const moodValue = mapMoodFilter(nearbyMoodFilter);
  const effectiveGoal =
    !adultModeEnabled && goalValue && ADULT_GOALS.includes(goalValue)
      ? null
      : goalValue;

  const filteredUsers = sourceUsers.filter((u) => {
    if (!u.uid) return false;

    // не показываем самого себя (для реальных пользователей)
    if (currentUser && u.uid === currentUser.uid) return false;

    // если у нас выключен 18+ и обычные цели — прячем тех, у кого цель 18+
    if (!allowAdult && (u.goal === "casual" || u.goal === "sex")) {
      return false;
    }

    if (effectiveGoal && u.goal !== effectiveGoal) {
      return false;
    }

    if (moodValue && u.mood !== moodValue) {
      return false;
    }

    return true;
  });

  const radiusOptions = [
    { id: "5", label: "5 км" },
    { id: "10", label: "10 км" },
    { id: "25", label: "25 км" },
  ];

  const goalOptions = [
    { id: "all", label: "Все цели" },
    { id: "dating", label: "Знакомства" },
    { id: "friends", label: "Дружба" },
    { id: "chat", label: "Чат" },
    { id: "serious", label: "Серьёзно" },
    { id: "light", label: "Лёгкие" },
    { id: "casual", label: "Casual" },
    { id: "sex18", label: "18+ только секс", badge: "18+" },
  ].filter(
    (option) => allowAdult || (option.id !== "casual" && option.id !== "sex18")
  );

  const handleOpenNearbyUser = (user: DemoUser) => {
    const subtitle =
      user.bio ??
      user.about ??
      "Человек рядом. В полной версии можно будет открыть профиль и начать чат.";
    const title = user.displayName ?? user.name ?? "Профиль";
    const ageSuffix = user.age ? `, ${user.age}` : "";

    Alert.alert(
      `${title}${ageSuffix}`,
      `${subtitle}\n\nСейчас это демо-режим. В релизе здесь появится полноценный экран анкеты.`,
      [{ text: "OK" }]
    );
  };

  const handleOpenVoiceIntro = (user: UserProfile) => {
    setVoiceIntroUser(user);
  };

  const handleCloseVoiceIntro = () => {
    setVoiceIntroUser(null);
  };

  const renderUser = ({ item }: { item: UserProfile }) => {
    return (
      <View
        style={{
          marginBottom: 16,
          borderRadius: theme.shapes.card,
          overflow: "hidden",
          backgroundColor: theme.colors.card,
        }}
      >
        <View style={{ height: 320 }}>
          <UserCard
            user={item}
            showDistance
            showGoal
            onPress={handleOpenNearbyUser}
            onPressVoiceIntro={handleOpenVoiceIntro}
          />
        </View>
      </View>
    );
  };

  if (loading && !refreshing && sourceUsers.length === 0) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.colors.background,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <ActivityIndicator color={theme.colors.primary} />
        <Text
          style={{
            marginTop: 12,
            color: theme.colors.subtext,
            textAlign: "center",
          }}
        >
          Ищем людей поблизости…
        </Text>
      </View>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
      }}
    >
      {/* Заголовок / фильтры */}
      <View
        style={{
          paddingHorizontal: theme.spacing,
          paddingTop: theme.spacing,
          paddingBottom: 8,
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: theme.colors.text,
            marginBottom: 8,
          }}
        >
          Люди рядом
        </Text>

        {currentUser && (
          <Text
            style={{
              color: theme.colors.subtext,
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            Твоя цель:{" "}
            <Text style={{ color: theme.colors.text }}>
              {currentUser.goal ?? "не указана"}
            </Text>{" "}
            • 18+:{" "}
            <Text style={{ color: theme.colors.text }}>
              {adultModeEnabled ? "включён" : "выключен"}
            </Text>
          </Text>
        )}

        {error && (
          <Text
            style={{
              color: theme.colors.danger,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {error}
          </Text>
        )}

        <PillToggleRow
          title="Радиус"
          options={radiusOptions}
          selectedId={radiusFilter}
          onChange={(id) => setRadiusFilter(id as RadiusFilter)}
        />

        <PillToggleRow
          title="Цели"
          options={goalOptions}
          selectedId={nearbyGoalFilter}
          onChange={(id) => setNearbyGoalFilter(id as NearbyGoalFilter)}
        />

        <PillToggleRow
          title="Настроение"
          options={[
            { id: "any", label: "Любое" },
            { id: "fun", label: "Весёлое" },
            { id: "calm", label: "Спокойное" },
            { id: "moving", label: "В движении" },
            { id: "serious", label: "Серьёзное" },
            { id: "party", label: "Тусовка" },
          ]}
          selectedId={nearbyMoodFilter}
          onChange={(id) => setNearbyMoodFilter(id as NearbyMoodFilter)}
        />

        {!allowAdult && (
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 11,
              marginTop: 2,
            }}
          >
            18+ цели скрыты — включи 18+ режим в профиле, чтобы видеть Casual и
            «18+ только секс».
          </Text>
        )}
      </View>

      {/* Список пользователей */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.uid}
        renderItem={renderUser}
        contentContainerStyle={{
          paddingHorizontal: theme.spacing,
          paddingBottom: theme.spacing * 2,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={
          !loading ? (
            <View
              style={{
                paddingVertical: 40,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text
                style={{
                  color: theme.colors.subtext,
                  textAlign: "center",
                  marginBottom: 4,
                }}
              >
                Пока никого рядом не видно.
              </Text>
              <Text
                style={{
                  color: theme.colors.muted,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                Попробуй увеличить радиус, изменить фильтры или зайти чуть позже.
              </Text>
            </View>
          ) : null
        }
      />
      <VoiceIntroModal
        visible={!!voiceIntroUser}
        onClose={handleCloseVoiceIntro}
        userName={voiceIntroUser?.displayName ?? voiceIntroUser?.name}
        durationSeconds={voiceIntroUser?.voiceIntroDurationSec ?? 8}
      />
    </View>
  );
}
