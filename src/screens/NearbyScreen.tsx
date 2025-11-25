import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from "react-native";
import * as Location from "expo-location";

import { theme } from "../theme/theme";
import type { UserProfile, Goal, Mood } from "../models/User";
import { fetchNearbyUsers } from "../services/nearby";
import { getUserProfile } from "../services/user";
import UserCard from "../components/UserCard";
import { DEMO_USERS } from "../services/demoUsers";

type GoalFilter = Goal | "all";
type MoodFilter = Mood | "all";

const GOAL_FILTERS: { value: GoalFilter; label: string }[] = [
  { value: "all", label: "Все цели" },
  { value: "dating", label: "Знакомства" },
  { value: "friends", label: "Дружба" },
  { value: "chat", label: "Чат" },
  { value: "long_term", label: "Серьёзно" },
  { value: "short_term", label: "Лёгкие" },
  { value: "casual", label: "Casual" },
  { value: "sex", label: "18+ только секс" },
];

const MOOD_FILTERS: { value: MoodFilter; label: string }[] = [
  { value: "all", label: "Любое" },
  { value: "happy", label: "Весёлое" },
  { value: "chill", label: "Спокойное" },
  { value: "active", label: "В движении" },
  { value: "serious", label: "Серьёзное" },
  { value: "party", label: "Тусовка" },
];

const RADIUS_OPTIONS = [5, 10, 25];

export default function NearbyScreen() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [rawUsers, setRawUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [selectedGoal, setSelectedGoal] = useState<GoalFilter>("all");
  const [selectedMood, setSelectedMood] = useState<MoodFilter>("all");

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
    [coords, radiusKm]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  // Первый запуск + изменение радиуса
  useEffect(() => {
    loadLocationAndUsers();
  }, [loadLocationAndUsers, radiusKm]);

  const onRefresh = useCallback(() => {
    loadLocationAndUsers({ hardRefresh: true });
  }, [loadLocationAndUsers]);

  // Флаг: показывать ли 18+ цели (casual/sex)
  const allowAdult =
    !!currentUser?.allowAdultMode ||
    currentUser?.goal === "casual" ||
    currentUser?.goal === "sex";

  // Если из Firebase никого нет — используем DEMO_USERS
  const sourceUsers: UserProfile[] =
    rawUsers && rawUsers.length > 0 ? rawUsers : DEMO_USERS;

  const filteredUsers = sourceUsers.filter((u) => {
    if (!u.uid) return false;

    // не показываем самого себя (для реальных пользователей)
    if (currentUser && u.uid === currentUser.uid) return false;

    // если у нас выключен 18+ и обычные цели — прячем тех, у кого цель 18+
    if (
      !allowAdult &&
      (u.goal === "casual" || u.goal === "sex")
    ) {
      return false;
    }

    if (selectedGoal !== "all" && u.goal !== selectedGoal) {
      return false;
    }

    if (selectedMood !== "all" && u.mood !== selectedMood) {
      return false;
    }

    return true;
  });

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
          <UserCard user={item} />
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
              {currentUser.allowAdultMode ? "включён" : "выключен"}
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

        {/* Радиус */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: theme.colors.subtext,
              fontSize: 12,
              marginRight: 8,
            }}
          >
            Радиус:
          </Text>
          {RADIUS_OPTIONS.map((r) => {
            const active = radiusKm === r;
            return (
              <TouchableOpacity
                key={r}
                onPress={() => setRadiusKm(r)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: theme.shapes.pill,
                  marginRight: 6,
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
                  {r} км
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Фильтр по цели */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginBottom: 6,
          }}
        >
          {GOAL_FILTERS.map((g) => {
            const active = selectedGoal === g.value;
            return (
              <TouchableOpacity
                key={g.value}
                onPress={() => setSelectedGoal(g.value)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: theme.shapes.pill,
                  marginRight: 6,
                  marginBottom: 6,
                  backgroundColor: active
                    ? theme.colors.primary
                    : theme.colors.pillBg,
                }}
              >
                <Text
                  style={{
                    color: active ? "#FFFFFF" : theme.colors.pillText,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  {g.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Фильтр по настроению */}
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginBottom: 4,
          }}
        >
          {MOOD_FILTERS.map((m) => {
            const active = selectedMood === m.value;
            return (
              <TouchableOpacity
                key={m.value}
                onPress={() => setSelectedMood(m.value)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: theme.shapes.pill,
                  marginRight: 6,
                  marginBottom: 6,
                  backgroundColor: active
                    ? theme.colors.accent
                    : theme.colors.pillBg,
                }}
              >
                <Text
                  style={{
                    color: active ? "#FFFFFF" : theme.colors.pillText,
                    fontSize: 11,
                    fontWeight: "600",
                  }}
                >
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {!allowAdult && (
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 11,
              marginTop: 2,
            }}
          >
            18+ цели (casual/sex) скрыты — включи 18+ режим в профиле, чтобы их
            видеть.
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
    </View>
  );
}
