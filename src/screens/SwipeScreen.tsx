import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from "react-native";
import * as Location from "expo-location";
import Swiper from "react-native-deck-swiper";

import { theme } from "../theme/theme";
import type { UserProfile, Goal } from "../models/User";
import { fetchNearbyUsers } from "../services/nearby";
import { getUserProfile } from "../services/user";
import { likeUser } from "../services/social";
import UserCard from "../components/UserCard";
import { DEMO_USERS } from "../services/demoUsers";

const DEFAULT_RADIUS_KM = 10;

function isAdultGoal(goal?: Goal | null): boolean {
  if (!goal) return false;
  return goal === "casual" || goal === "sex" || goal === "short_term";
}

export default function SwipeScreen() {
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);

  const [rawUsers, setRawUsers] = useState<UserProfile[]>([]);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cardIndex, setCardIndex] = useState(0);

  const loadProfile = useCallback(async () => {
    try {
      const profile = await getUserProfile();
      if (profile) {
        setCurrentUser(profile);
      }
    } catch (e) {
      console.warn("SwipeScreen: failed to load profile", e);
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
          const { status } =
            await Location.requestForegroundPermissionsAsync();
          if (status === "granted") {
            const loc = await Location.getCurrentPositionAsync({});
            lat = loc.coords.latitude;
            lng = loc.coords.longitude;
          } else {
            // заглушка — центр Загреба
            lat = 45.815;
            lng = 15.9819;
          }
          setCoords({ lat, lng });
        }

        if (lat == null || lng == null) {
          throw new Error("Нет координат для поиска людей рядом");
        }

        const nearby = await fetchNearbyUsers(lat, lng, DEFAULT_RADIUS_KM);
        setRawUsers(nearby);
        setCardIndex(0);
      } catch (e: any) {
        console.warn("SwipeScreen: load error", e);
        setError(
          e?.message ||
            "Не удалось загрузить людей для свайпа. Попробуй ещё раз позже."
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [coords]
  );

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    loadLocationAndUsers();
  }, [loadLocationAndUsers]);

  const allowAdult =
    !!currentUser?.allowAdultMode ||
    currentUser?.goal === "casual" ||
    currentUser?.goal === "sex";

  // Если из Firebase никого нет — используем DEMO_USERS
  const sourceUsers: UserProfile[] =
    rawUsers && rawUsers.length > 0 ? rawUsers : DEMO_USERS;

  const cards: UserProfile[] = sourceUsers.filter((u) => {
    if (!u.uid) return false;

    // не показываем самого себя для реальных аккаунтов
    if (currentUser && u.uid === currentUser.uid) return false;

    // фильтр 18+: если у нас выключен 18+, не показываем взрослых целей
    if (!allowAdult && isAdultGoal(u.goal)) {
      return false;
    }

    return true;
  });

  const handleRefresh = async () => {
    await loadLocationAndUsers({ hardRefresh: true });
  };

  const handleSwipeRight = async (index: number) => {
    try {
      const target = cards[index];
      if (!target || !currentUser) return;

      // демо-аккаунты не лайкаем в Firestore, это только заглушка для UI
      if (target.uid.startsWith("demo_")) {
        return;
      }

      const result: any = await likeUser(currentUser.uid, target.uid);
      const isMatch =
        result === true || result === "match" || result?.isMatch === true;

      if (isMatch) {
        Alert.alert(
          "Совпадение!",
          `У вас взаимная симпатия с ${target.displayName || "пользователем"} 🎉`
        );
      }
    } catch (e) {
      console.warn("SwipeScreen: like error", e);
    }
  };

  const handleSwiped = (index: number) => {
    setCardIndex(index + 1);
  };

  if (loading && !refreshing && cards.length === 0) {
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
            marginTop: 12,
            color: theme.colors.subtext,
          }}
        >
          Подбираем людей для свайпа…
        </Text>
      </View>
    );
  }

  const showEmpty = !loading && cards.length === 0;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingHorizontal: theme.spacing,
        paddingTop: theme.spacing,
        paddingBottom: theme.spacing * 1.5,
      }}
    >
      {/* Заголовок + подсказка */}
      <View style={{ marginBottom: 8 }}>
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: theme.colors.text,
            marginBottom: 4,
          }}
        >
          Свайп
        </Text>
        <Text
          style={{
            color: theme.colors.subtext,
            fontSize: 12,
          }}
        >
          Свайпай вправо, если нравится, и влево, если нет. При взаимной
          симпатии вы попадёте в список матчей.
        </Text>

        {currentUser && (
          <Text
            style={{
              marginTop: 4,
              color: theme.colors.muted,
              fontSize: 11,
            }}
          >
            Твоя цель: {currentUser.goal ?? "не указана"} • 18+:{" "}
            {allowAdult ? "включён" : "выключен"}
          </Text>
        )}

        {error && (
          <Text
            style={{
              marginTop: 4,
              color: theme.colors.danger,
              fontSize: 12,
            }}
          >
            {error}
          </Text>
        )}
      </View>

      {/* Колода карточек */}
      <View style={{ flex: 1 }}>
        {showEmpty ? (
          <View
            style={{
              flex: 1,
              borderRadius: theme.shapes.card,
              backgroundColor: theme.colors.card,
              alignItems: "center",
              justifyContent: "center",
              padding: 24,
            }}
          >
            <Text
              style={{
                color: theme.colors.subtext,
                textAlign: "center",
                marginBottom: 6,
              }}
            >
              Пока никого для свайпа рядом нет.
            </Text>
            <Text
              style={{
                color: theme.colors.muted,
                fontSize: 12,
                textAlign: "center",
              }}
            >
              Попробуй обновить, изменить радиус или зайти чуть позже.
            </Text>
          </View>
        ) : (
          <Swiper
            cards={cards}
            cardIndex={cardIndex}
            renderCard={(item) => {
              if (!item) {
                return (
                  <View
                    style={{
                      flex: 1,
                      borderRadius: theme.shapes.card,
                      backgroundColor: theme.colors.card,
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 24,
                    }}
                  >
                    <Text
                      style={{
                        color: theme.colors.subtext,
                        textAlign: "center",
                        marginBottom: 6,
                      }}
                    >
                      Больше никого нет.
                    </Text>
                    <Text
                      style={{
                        color: theme.colors.muted,
                        fontSize: 12,
                        textAlign: "center",
                      }}
                    >
                      Обнови список или попробуй позже.
                    </Text>
                  </View>
                );
              }

              return (
                <View
                  style={{
                    flex: 1,
                    borderRadius: theme.shapes.card,
                    backgroundColor: theme.colors.card,
                  }}
                >
                  <UserCard user={item} />
                </View>
              );
            }}
            onSwiped={handleSwiped}
            onSwipedRight={handleSwipeRight}
            stackSize={3}
            backgroundColor="transparent"
            verticalSwipe={false}
            overlayLabels={{
              left: {
                title: "Нет",
                style: {
                  label: {
                    color: "#FCA5A5",
                    fontSize: 28,
                    fontWeight: "800",
                  },
                },
              },
              right: {
                title: "Да",
                style: {
                  label: {
                    color: "#4ADE80",
                    fontSize: 28,
                    fontWeight: "800",
                  },
                },
              },
            }}
          />
        )}
      </View>

      {/* Кнопка обновления */}
      <View
        style={{
          marginTop: 12,
          flexDirection: "row",
          justifyContent: "center",
        }}
      >
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={refreshing}
          style={{
            paddingHorizontal: 18,
            paddingVertical: 8,
            borderRadius: theme.shapes.pill,
            backgroundColor: theme.colors.pillBg,
            opacity: refreshing ? 0.7 : 1,
          }}
        >
          <Text
            style={{
              color: theme.colors.pillText,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {refreshing ? "Обновляем…" : "Обновить подборку"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
