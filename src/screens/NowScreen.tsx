import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";

import {
  DEMO_NOW_REQUESTS,
  DemoNowGoal,
  DemoNowMood,
  DemoNowRequest,
} from "@/data/demoNowRequests";
import PillToggleRow from "@/components/PillToggleRow";
import { theme } from "@/theme";

type NowGoalFilter =
  | "all"
  | "dating"
  | "friends"
  | "chat"
  | "longterm"
  | "today"
  | "flirt";
type NowMoodFilter =
  | "any"
  | "calm"
  | "happy"
  | "active"
  | "serious"
  | "party";

type NowFilterState = {
  goal: NowGoalFilter;
  mood: NowMoodFilter;
  adultsOnly: boolean;
};

const NOW_FILTER_STORAGE_KEY = "amoria.now.filter.v1";
const NOW_DISMISSED_STORAGE_KEY = "amoria.now.dismissed.v1";

function formatGoal(goal: DemoNowGoal): string {
  switch (goal) {
    case "dating":
      return "Знакомства";
    case "friends":
      return "Друзья";
    case "chat":
      return "Чат";
    case "long_term":
      return "Надолго";
    case "short_term":
      return "На сегодня";
    case "casual":
      return "Флирт / 18+";
    default:
      return "Разное";
  }
}

function formatMood(mood: DemoNowMood): string {
  switch (mood) {
    case "chill":
      return "Спокойное";
    case "happy":
      return "Радостное";
    case "active":
      return "Активное";
    case "serious":
      return "Серьёзное";
    case "party":
      return "Вечеринка";
    default:
      return "Любое";
  }
}

const normalizeStoredGoal = (value: unknown): NowGoalFilter | undefined => {
  switch (value) {
    case "all":
    case "dating":
    case "friends":
    case "chat":
    case "longterm":
    case "today":
    case "flirt":
      return value;
    case "long_term":
      return "longterm";
    case "short_term":
      return "today";
    case "casual":
      return "flirt";
    default:
      return undefined;
  }
};

const normalizeStoredMood = (value: unknown): NowMoodFilter | undefined => {
  switch (value) {
    case "any":
      return "any";
    case "happy":
    case "active":
    case "serious":
    case "party":
      return value;
    case "calm":
      return "calm";
    case "chill":
      return "calm";
    case "all":
      return "any";
    default:
      return undefined;
  }
};

const goalFilterToGoal = (filter: NowGoalFilter): DemoNowGoal | null => {
  switch (filter) {
    case "all":
      return null;
    case "longterm":
      return "long_term";
    case "today":
      return "short_term";
    case "flirt":
      return "casual";
    default:
      return filter;
  }
};

const moodFilterToMood = (filter: NowMoodFilter): DemoNowMood | null => {
  switch (filter) {
    case "any":
      return null;
    case "calm":
      return "chill";
    default:
      return filter;
  }
};

const NowScreen: React.FC = () => {
  const insets = useSafeAreaInsets();

  const [filter, setFilter] = useState<NowFilterState>({
    goal: "all",
    mood: "any",
    adultsOnly: true,
  });

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [isPrefsLoading, setIsPrefsLoading] = useState(true);
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);

  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const [filterJson, dismissedJson] = await Promise.all([
          AsyncStorage.getItem(NOW_FILTER_STORAGE_KEY),
          AsyncStorage.getItem(NOW_DISMISSED_STORAGE_KEY),
        ]);

        if (filterJson) {
          try {
            const parsed = JSON.parse(filterJson) as Partial<NowFilterState>;
            setFilter((prev) => ({
              goal: normalizeStoredGoal(parsed.goal) ?? prev.goal,
              mood: normalizeStoredMood(parsed.mood) ?? prev.mood,
              adultsOnly:
                typeof parsed.adultsOnly === "boolean"
                  ? parsed.adultsOnly
                  : prev.adultsOnly,
            }));
          } catch {
            // ignore corrupted data
          }
        }

        if (dismissedJson) {
          try {
            const parsed = JSON.parse(dismissedJson) as string[];
            if (Array.isArray(parsed)) {
              setDismissedIds(parsed);
            }
          } catch {
            // ignore corrupted data
          }
        }
      } finally {
        setIsPrefsLoading(false);
      }
    };

    loadPrefs();
  }, []);

  const persistFilter = async (next: NowFilterState) => {
    setIsSavingPrefs(true);
    try {
      await AsyncStorage.setItem(NOW_FILTER_STORAGE_KEY, JSON.stringify(next));
    } finally {
      setIsSavingPrefs(false);
    }
  };

  const persistDismissed = async (nextDismissed: string[]) => {
    try {
      await AsyncStorage.setItem(
        NOW_DISMISSED_STORAGE_KEY,
        JSON.stringify(nextDismissed)
      );
    } catch {
      // non-critical
    }
  };

  const handleGoalChange = (goalId: string) => {
    const goal = goalId as NowGoalFilter;
    const next: NowFilterState = { ...filter, goal };
    setFilter(next);
    void persistFilter(next);
  };

  const handleMoodChange = (moodId: string) => {
    const mood = moodId as NowMoodFilter;
    const next: NowFilterState = { ...filter, mood };
    setFilter(next);
    void persistFilter(next);
  };

  const handleAdultsToggle = () => {
    const next: NowFilterState = { ...filter, adultsOnly: !filter.adultsOnly };
    setFilter(next);
    void persistFilter(next);
  };

  const handleDismiss = (id: string) => {
    const next = dismissedIds.includes(id)
      ? dismissedIds
      : [...dismissedIds, id];
    setDismissedIds(next);
    void persistDismissed(next);
  };

  const handleResetFilters = () => {
    const next: NowFilterState = {
      goal: "all",
      mood: "any",
      adultsOnly: true,
    };
    setFilter(next);
    setDismissedIds([]);
    void Promise.all([
      persistFilter(next),
      AsyncStorage.removeItem(NOW_DISMISSED_STORAGE_KEY),
    ]);
  };

  const handlePressCreateNow = () => {
    Alert.alert(
      "Пока демо-режим",
      'В полной версии здесь можно будет публиковать свои "Я сейчас хочу..." запросы с радиусом и временем действия, а также сразу переходить к чату.',
      [{ text: "ОК" }]
    );
  };

  const handlePressReply = (request: DemoNowRequest) => {
    Alert.alert(
      "Пока демо-режим",
      `В полной версии ты бы сейчас писал(а) ${request.userName} первое сообщение.\n\nНапример:\n«Привет, я как раз тоже рядом. Давай встретимся?»`,
      [{ text: "Понятно" }]
    );
  };

  const filteredRequests = useMemo(() => {
    const goalValue = goalFilterToGoal(filter.goal);
    const moodValue = moodFilterToMood(filter.mood);

    return DEMO_NOW_REQUESTS.filter((req) => {
      if (dismissedIds.includes(req.id)) return false;

      if (filter.adultsOnly && !req.is18Plus) return false;

      if (goalValue && req.goal !== goalValue) return false;

      if (moodValue && req.mood !== moodValue) return false;

      return true;
    });
  }, [dismissedIds, filter]);

  const hasCustomFilter =
    filter.goal !== "all" ||
    filter.mood !== "any" ||
    !filter.adultsOnly ||
    dismissedIds.length > 0;

  const foundCount = filteredRequests.length;

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      edges={["top", "left", "right"]}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: 24 + insets.bottom,
        }}
      >
        {/* Заголовок */}
        <View style={{ marginBottom: 16, marginTop: 8 }}>
          <Text
            style={{
              fontSize: 28,
              fontWeight: "800",
              color: theme.colors.text,
              marginBottom: 4,
            }}
          >
            Сейчас
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: theme.colors.subtext,
            }}
          >
            Люди рядом пишут, чего они хотят прямо сейчас. Фильтруй по цели,
            настроению и 18+.
          </Text>
        </View>

        {/* Кнопка "Я сейчас хочу..." */}
        <TouchableOpacity
          onPress={handlePressCreateNow}
          activeOpacity={0.9}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: 14,
            borderRadius: 999,
            backgroundColor: theme.colors.accent,
            marginBottom: 16,
          }}
        >
          <Ionicons
            name="flash-outline"
            size={20}
            color={theme.colors.background}
            style={{ marginRight: 8 }}
          />
          <Text
            style={{
              color: theme.colors.background,
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            Я сейчас хочу...
          </Text>
        </TouchableOpacity>

        {/* Фильтры */}
        <PillToggleRow
          title="Цель сейчас"
          options={[
            { id: "all", label: "Все" },
            { id: "dating", label: "Знакомства" },
            { id: "friends", label: "Друзья" },
            { id: "chat", label: "Чат" },
            { id: "longterm", label: "Надолго" },
            { id: "today", label: "На сегодня" },
            { id: "flirt", label: "Флирт" },
          ]}
          selectedId={filter.goal}
          onChange={handleGoalChange}
        />

        <PillToggleRow
          title="Настроение"
          options={[
            { id: "any", label: "Все" },
            { id: "calm", label: "Спокойно" },
            { id: "happy", label: "Радостно" },
            { id: "active", label: "Активно" },
            { id: "serious", label: "Серьёзно" },
            { id: "party", label: "Вечеринка" },
          ]}
          selectedId={filter.mood}
          onChange={handleMoodChange}
        />

        {/* 18+ + найдено + сброс */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 12,
          }}
        >
          <TouchableOpacity
            onPress={handleAdultsToggle}
            activeOpacity={0.8}
            style={{ flexDirection: "row", alignItems: "center" }}
          >
            <View
              style={{
                width: 20,
                height: 20,
                borderRadius: 4,
                borderWidth: 1.5,
                borderColor: filter.adultsOnly
                  ? theme.colors.accent
                  : "rgba(148, 163, 184, 0.8)",
                marginRight: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: filter.adultsOnly
                  ? theme.colors.accent
                  : "transparent",
              }}
            >
              {filter.adultsOnly && (
                <Ionicons
                  name="checkmark-sharp"
                  size={14}
                  color={theme.colors.background}
                />
              )}
            </View>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.text,
              }}
            >
              Показывать только 18+
            </Text>
          </TouchableOpacity>

          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.subtext,
                marginRight: 12,
              }}
            >
              Найдено: {foundCount}
            </Text>

            {hasCustomFilter && (
              <TouchableOpacity
                onPress={handleResetFilters}
                activeOpacity={0.8}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: "rgba(148,163,184,0.6)",
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: theme.colors.subtext,
                  }}
                >
                  Сбросить
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Статус загрузки настроек */}
        {isPrefsLoading && (
          <View
            style={{
              paddingVertical: 24,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color={theme.colors.accent} />
            <Text
              style={{
                marginTop: 8,
                fontSize: 13,
                color: theme.colors.subtext,
              }}
            >
              Загружаем твои фильтры...
            </Text>
          </View>
        )}

        {/* Плашка про сохранение */}
        {!isPrefsLoading && isSavingPrefs && (
          <View
            style={{
              marginBottom: 8,
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 999,
              backgroundColor: "rgba(56,189,248,0.08)",
              alignSelf: "flex-start",
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <Ionicons
              name="cloud-done-outline"
              size={14}
              color={theme.colors.subtext}
              style={{ marginRight: 6 }}
            />
            <Text
              style={{
                fontSize: 11,
                color: theme.colors.subtext,
              }}
            >
              Фильтры сохранены
            </Text>
          </View>
        )}

        {/* Список запросов / пустое состояние */}
        {foundCount === 0 && !isPrefsLoading ? (
          <View
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 20,
              backgroundColor: theme.colors.card,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "700",
                color: theme.colors.text,
                marginBottom: 4,
              }}
            >
              Сейчас тихо
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: theme.colors.subtext,
                marginBottom: 8,
              }}
            >
              По выбранным фильтрам пока нет запросов. Попробуй сменить
              настроение или цель, либо загляни позже.
            </Text>
          </View>
        ) : (
          filteredRequests.map((req) => {
            const ageText = req.age ? `, ${req.age}` : "";

            return (
              <View
                key={req.id}
                style={{
                  marginTop: 12,
                  padding: 16,
                  borderRadius: 24,
                  backgroundColor: theme.colors.card,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 18,
                      fontWeight: "800",
                      color: theme.colors.text,
                      marginRight: 8,
                    }}
                  >
                    {req.userName}
                    {ageText}
                  </Text>

                  {req.is18Plus && (
                    <View
                      style={{
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: "rgba(248,113,113,0.18)",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: "700",
                          color: "#fecaca",
                        }}
                      >
                        18+
                      </Text>
                    </View>
                  )}
                </View>

                <Text
                  style={{
                    fontSize: 13,
                    color: theme.colors.subtext,
                    marginBottom: 8,
                  }}
                >
                  ~{req.distanceKm.toFixed(1)} км · {req.minutesAgo} мин назад
                </Text>

                <Text
                  style={{
                    fontSize: 15,
                    color: theme.colors.text,
                    marginBottom: 12,
                  }}
                >
                  {req.text}
                </Text>

                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: "rgba(148,163,184,0.18)",
                      marginRight: 8,
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: theme.colors.subtext,
                      }}
                    >
                      {formatGoal(req.goal)}
                    </Text>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderRadius: 999,
                      backgroundColor: "rgba(52,211,153,0.16)",
                      marginBottom: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: "600",
                        color: "#bbf7d0",
                      }}
                    >
                      Настроение: {formatMood(req.mood).toLowerCase()}
                    </Text>
                  </View>
                </View>

                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                  }}
                >
                  <TouchableOpacity
                    onPress={() => handleDismiss(req.id)}
                    activeOpacity={0.85}
                    style={{
                      flex: 1,
                      marginRight: 8,
                      paddingVertical: 12,
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: "rgba(148,163,184,0.6)",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        color: theme.colors.subtext,
                      }}
                    >
                      Неинтересно
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => handlePressReply(req)}
                    activeOpacity={0.9}
                    style={{
                      flex: 1,
                      marginLeft: 8,
                      paddingVertical: 12,
                      borderRadius: 999,
                      backgroundColor: theme.colors.accent,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="chatbubble-ellipses-outline"
                      size={18}
                      color={theme.colors.background}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "700",
                        color: theme.colors.background,
                      }}
                    >
                      Ответить
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

export default NowScreen;
