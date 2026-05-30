import React from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type ReleasePlayActivity,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import type { TogetherPreferredAgeRangeInput } from "@/services/api/types";
import {
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import {
  DEFAULT_TOGETHER_RADIUS_KM,
  TOGETHER_RADIUS_OPTIONS,
  parseTogetherRadiusPreference,
  requestTogetherQueueLocation,
  serializeTogetherRadiusPreference,
  type TogetherRadiusKm,
} from "@/services/togetherLocation";
import {
  getUserProfile,
  hasBirthDate,
} from "@/services/user";
import { theme } from "@/theme";

function isReleasePlayActivity(
  value: string
): value is ReleasePlayActivity {
  return value === "draw" || value === "story_sparks";
}

const RADIUS_STORAGE_KEY = "amoria:together:radiusKm:v2";
const AGE_FILTER_STORAGE_KEY = "amoria:together:ageFilter:v1";
type AgeFilterId = "any" | "18-24" | "25-34" | "35-44" | "45-54" | "55+";
const AGE_FILTER_OPTIONS: Array<{ id: AgeFilterId; range: TogetherPreferredAgeRangeInput }> = [
  { id: "any", range: { min: 18, max: null } },
  { id: "18-24", range: { min: 18, max: 24 } },
  { id: "25-34", range: { min: 25, max: 34 } },
  { id: "35-44", range: { min: 35, max: 44 } },
  { id: "45-54", range: { min: 45, max: 54 } },
  { id: "55+", range: { min: 55, max: null } },
];

function parseAgeFilterPreference(value: string | null): AgeFilterId | undefined {
  return AGE_FILTER_OPTIONS.some((option) => option.id === value)
    ? (value as AgeFilterId)
    : undefined;
}

function ageRangeForFilter(id: AgeFilterId): TogetherPreferredAgeRangeInput {
  return AGE_FILTER_OPTIONS.find((option) => option.id === id)?.range ?? AGE_FILTER_OPTIONS[0].range;
}

export default function PlayLobbyScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayMatch">>();
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const [selectedRadiusKm, setSelectedRadiusKm] = React.useState<TogetherRadiusKm>(
    DEFAULT_TOGETHER_RADIUS_KM
  );
  const [selectedAgeFilter, setSelectedAgeFilter] = React.useState<AgeFilterId>("any");
  const [locationBusy, setLocationBusy] = React.useState(false);
  const [locationNotice, setLocationNotice] = React.useState("");
  const [profileInterestCount, setProfileInterestCount] = React.useState<number | null>(null);

  React.useEffect(() => {
    let alive = true;
    void Promise.all([
      AsyncStorage.getItem(RADIUS_STORAGE_KEY),
      AsyncStorage.getItem(AGE_FILTER_STORAGE_KEY),
    ])
      .then(([radiusValue, ageValue]) => {
        if (!alive) return;
        const parsed = parseTogetherRadiusPreference(radiusValue);
        if (parsed !== undefined) {
          setSelectedRadiusKm(parsed);
        }
        const parsedAge = parseAgeFilterPreference(ageValue);
        if (parsedAge !== undefined) {
          setSelectedAgeFilter(parsedAge);
        }
        if (parsed === undefined) {
          void AsyncStorage.setItem(
            RADIUS_STORAGE_KEY,
            serializeTogetherRadiusPreference(DEFAULT_TOGETHER_RADIUS_KM)
          ).catch(() => undefined);
        }
        if (parsedAge === undefined) {
          void AsyncStorage.setItem(AGE_FILTER_STORAGE_KEY, "any").catch(() => undefined);
        }
      })
      .catch(() => undefined);

    return () => {
      alive = false;
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      void getUserProfile()
        .then((profile) => {
          if (!alive) return;
          setProfileInterestCount(profile.interests.length);
        })
        .catch(() => {
          if (!alive) return;
          setProfileInterestCount(null);
        });

      return () => {
        alive = false;
      };
    }, [])
  );

  const storySparksCopy = {
    title: tt("together.lobby.storySparksTitle", "История на двоих"),
    description: tt(
      "together.lobby.storySparksContinuationBody",
      "После рисунка можно продолжить через Историю на двоих"
    ),
    details: tt(
      "together.lobby.storySparksDetails",
      "Если вы оба выберете продолжение, откроется общий Story Sparks этап для той же пары."
    ),
  };

  const radiusLabel = React.useCallback(
    (radiusKm: TogetherRadiusKm) => {
      if (radiusKm === null) {
        return tt("together.geo.anywhere", "Без ограничения");
      }
      return tt(`together.geo.${radiusKm}km`, `${radiusKm} км`);
    },
    [tt]
  );

  const ageFilterLabel = React.useCallback(
    (id: AgeFilterId) => {
      if (id === "any") {
        return tt("together.age.anyAdult", "Любой 18+");
      }
      return tt(`together.age.${id}`, id);
    },
    [tt]
  );

  const selectRadius = React.useCallback((radiusKm: TogetherRadiusKm) => {
    setSelectedRadiusKm(radiusKm);
    setLocationNotice("");
    void AsyncStorage.setItem(RADIUS_STORAGE_KEY, serializeTogetherRadiusPreference(radiusKm))
      .catch(() => undefined);
  }, []);

  const selectAgeFilter = React.useCallback((id: AgeFilterId) => {
    setSelectedAgeFilter(id);
    void AsyncStorage.setItem(AGE_FILTER_STORAGE_KEY, id).catch(() => undefined);
  }, []);

  const resolveQueueLocation = React.useCallback(async () => {
    const result = await requestTogetherQueueLocation(selectedRadiusKm);
    if ("location" in result) {
      return result.location;
    }

    if (result.reason === "permissionDenied") {
      const message = tt(
        "together.geo.permissionDenied",
        "Для совместного поиска нужна геолокация. Мы не показываем точную позицию другим людям."
      );
      setLocationNotice(message);
      Alert.alert(tt("together.geo.permissionTitle", "Нужна геолокация"), message, [
        { text: tt("together.geo.retryLocation", "Попробовать снова") },
        { text: tt("common.backToMainTabs", "Вернуться в меню"), style: "cancel" },
      ]);
      return null;
    }

    const safeError = sanitizeErrorForReport(result.error);
    const isDeviceLocationUnavailable = result.permissionStatus === "granted";
    const message = isDeviceLocationUnavailable
      ? tt(
          "together.geo.deviceLocationUnavailable",
          "Устройство не отдаёт координаты. Проверьте GPS/геолокацию. В эмуляторе BlueStacks установите местоположение и откройте Google Maps для проверки."
        )
      : tt(
          "together.geo.locationReadFailed",
          "Не удалось получить геолокацию. Проверьте доступ и попробуйте ещё раз."
        );
    reportClientError({
      screen: "PlayLobbyScreen",
      action: "startTogetherQueue",
      step: "locationReadFailed",
      code: safeError.code,
      message: safeError.message,
      stack: safeError.stack,
      metadata: {
        radiusKm: selectedRadiusKm,
        permissionStatus: result.permissionStatus,
        hasCoordinates: false,
        platform: Platform.OS,
        deviceModel: Device.modelName ?? null,
      },
    });
    setLocationNotice(message);
    Alert.alert(
      tt("together.geo.permissionTitle", "Нужна геолокация"),
      message,
      [
        { text: tt("together.geo.retryLocation", "Попробовать снова") },
        { text: tt("common.backToMainTabs", "Вернуться в меню"), style: "cancel" },
      ]
    );
    return null;
  }, [selectedRadiusKm, tt]);

  const openActivity = React.useCallback(
    async (activity: string, action: "startDraw" | "startStorySparks") => {
      const safeActivity = String(activity ?? "").trim();
      if (!isReleasePlayActivity(safeActivity)) {
        Alert.alert(
          tt("together.lobby.startFailedTitle", "Не удалось открыть сценарий"),
          tt("together.lobby.startFailedBody", "Формат этой совместной сессии не распознан.")
        );
        reportClientError({
          screen: "PlayLobbyScreen",
          action,
          step: "invalidActivity",
          message: "Together activity is empty or invalid",
          metadata: {
            activityPresent: Boolean(safeActivity),
          },
        });
        return;
      }

      try {
        setLocationBusy(true);
        setLocationNotice("");
        const profile = await getUserProfile();
        if (!hasBirthDate(profile)) {
          Alert.alert(
            tt("together.age.birthDateRequiredTitle", "Заполните профиль"),
            tt(
              "together.age.birthDateRequiredBody",
              "Дата рождения нужна для безопасности и подбора. Точная дата не показывается другим людям."
            ),
            [
              {
                text: tt("profile.completeProfile", "Заполнить профиль"),
                onPress: () => {
                  navigation.navigate("Profile", {
                    screen: "EditProfile",
                    params: { focus: "birthDate" },
                  });
                },
              },
              { text: tt("common.cancel", "Отмена"), style: "cancel" },
            ]
          );
          return;
        }
        const location = await resolveQueueLocation();
        if (location === null) {
          return;
        }
        navigation.navigate("PlayMatch", {
          activity: safeActivity,
          location,
          radiusLabel: radiusLabel(selectedRadiusKm),
          agePreference: ageRangeForFilter(selectedAgeFilter),
          ageLabel: ageFilterLabel(selectedAgeFilter),
        });
      } catch (error) {
        const safeError = sanitizeErrorForReport(error);
        Alert.alert(
          tt("together.lobby.startFailedTitle", "Не удалось открыть сценарий"),
          tt("together.lobby.startFailedBody", "Формат этой совместной сессии не распознан.")
        );
        reportClientError({
          screen: "PlayLobbyScreen",
          action,
          step:
            safeActivity === "story_sparks"
              ? "failedStorySparksNavigation"
              : "failedNavigation",
          code: safeError.code,
          message: safeError.message,
          stack: safeError.stack,
          metadata: {
            activity: safeActivity,
            radiusKm: selectedRadiusKm,
            ageFilter: selectedAgeFilter,
            hasCoordinates: false,
          },
        });
      } finally {
        setLocationBusy(false);
      }
    },
    [
      ageFilterLabel,
      navigation,
      radiusLabel,
      resolveQueueLocation,
      selectedAgeFilter,
      selectedRadiusKm,
      tt,
    ]
  );

  return (
    <ScreenShell title={t("tabs.together")} background="togetherMain">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>
              {tt("together.lobby.drawKicker", "Главный сценарий")}
            </Text>
            <Text style={styles.heroTitle}>
              {tt("together.lobby.drawHeroTitle", "Создай общий рисунок с другим человеком")}
            </Text>
            <Text style={styles.heroText}>
              {tt(
                "together.lobby.drawHeroBody",
                "Вы получите один короткий творческий вызов, будете рисовать на одном холсте и сохраните общий след, который потом может стать поводом для чата."
              )}
            </Text>
            <Text style={styles.heroBridgeText}>
              {tt(
                "together.lobby.coreLoopPlain",
                "Сначала создайте общий момент, потом спокойно решите, хотите ли продолжить в личном разговоре."
              )}
            </Text>
            <View style={styles.heroLoop}>
              {[
                tt("together.lobby.drawStepChallenge", "Творческий вызов"),
                tt("together.lobby.drawStepCanvas", "Общий холст"),
                tt("together.lobby.drawStepResult", "Совместный результат"),
                tt("together.lobby.drawStepStory", "История на двоих"),
                tt("together.lobby.drawStepChat", "Чат по взаимности"),
              ].map((item) => (
                <View key={item} style={styles.heroLoopChip}>
                  <Text style={styles.heroLoopChipText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.heroBottom}>
            <View style={styles.radiusPanel}>
              <Text style={styles.radiusTitle}>
                {tt("together.geo.radiusTitle", "Радиус поиска")}
              </Text>
              <View style={styles.radiusOptions}>
                {TOGETHER_RADIUS_OPTIONS.map((radiusKm) => {
                  const selected = selectedRadiusKm === radiusKm;
                  return (
                    <Pressable
                      key={radiusKm === null ? "anywhere" : String(radiusKm)}
                      onPress={() => selectRadius(radiusKm)}
                      style={[
                        styles.radiusOption,
                        selected ? styles.radiusOptionSelected : null,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.radiusOptionText,
                          selected ? styles.radiusOptionTextSelected : null,
                        ]}
                      >
                        {radiusLabel(radiusKm)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {locationNotice ? (
                <Text style={styles.radiusNotice}>{locationNotice}</Text>
              ) : (
                <Text style={styles.radiusHint}>
                  {tt(
                    "together.geo.radiusHint",
                    "Сначала ищите рядом. Если никого нет — расширьте радиус."
                  )}
                  {" "}
                  {tt(
                    "together.geo.privacyHint",
                    "Точная геолокация не показывается другим людям."
                  )}
                </Text>
              )}
            </View>
            <View style={styles.radiusPanel}>
              <Text style={styles.radiusTitle}>
                {tt("together.age.title", "Кого искать")}
              </Text>
              <View style={styles.radiusOptions}>
                {AGE_FILTER_OPTIONS.map((option) => {
                  const selected = selectedAgeFilter === option.id;
                  return (
                    <Pressable
                      key={option.id}
                      onPress={() => selectAgeFilter(option.id)}
                      style={[
                        styles.radiusOption,
                        selected ? styles.radiusOptionSelected : null,
                      ]}
                      accessibilityRole="button"
                    >
                      <Text
                        style={[
                          styles.radiusOptionText,
                          selected ? styles.radiusOptionTextSelected : null,
                        ]}
                      >
                        {ageFilterLabel(option.id)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={styles.radiusHint}>
                {tt(
                  "together.age.privacyHint",
                  "Возраст используется для подбора. Точная дата рождения не показывается."
                )}
              </Text>
            </View>
            <View style={styles.searchSummaryPanel}>
              <Text style={styles.radiusTitle}>
                {tt("together.profileSummary.title", "Контекст поиска")}
              </Text>
              <Text style={styles.radiusHint}>
                {tt(
                  "together.profileSummary.body",
                  "Радиус: {radius}. Возраст: {age}. Интересы в профиле: {count}.",
                  {
                    radius: radiusLabel(selectedRadiusKm),
                    age: ageFilterLabel(selectedAgeFilter),
                    count: profileInterestCount === null ? "-" : String(profileInterestCount),
                  }
                )}
              </Text>
              <Text style={styles.radiusHint}>
                {tt(
                  "together.profileSummary.futureMatching",
                  "Интересы видны в анкете и подготовлены для будущего подбора, но сейчас не ограничивают старт Together."
                )}
              </Text>
            </View>
            <Pressable
              onPress={() => void openActivity("draw", "startDraw")}
              style={[styles.primaryCta, locationBusy ? styles.primaryCtaDisabled : null]}
              disabled={locationBusy}
            >
              <Text style={styles.primaryCtaTitle}>
                {locationBusy
                  ? tt("together.geo.locationLoading", "Получаем геолокацию...")
                  : tt("together.lobby.startDrawChallenge", "Начать вместе")}
              </Text>
            </Pressable>
            <Text style={styles.primaryCtaHint}>
              {tt(
                "together.lobby.startDrawHint",
                "7 минут на общий ответ, затем итог, история и честное решение про личный разговор."
              )}
            </Text>
          </View>
        </View>

        <View style={styles.secondarySection}>
          <Text style={styles.secondarySectionTitle}>
            {tt("together.lobby.storySparksSectionTitle", "Второй этап")}
          </Text>
          <Text style={styles.secondarySectionText}>
            {tt(
              "together.lobby.storySparksSectionBody",
              "История на двоих усиливает знакомство после рисунка, а не конкурирует с ним на первом шаге."
            )}
          </Text>
        </View>

        <View style={styles.secondaryCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{storySparksCopy.title}</Text>
          </View>
          <Text style={styles.cardDescription}>{storySparksCopy.description}</Text>
          <Text style={styles.cardDetails}>{storySparksCopy.details}</Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>
              {tt("together.lobby.historyTitle", "Совместные истории")}
            </Text>
            <Text style={styles.historyText}>
              {tt(
                "together.lobby.historyBodyCore",
                "Возвращайся к сохранённым рисункам, историям на двоих и разговорам, которые выросли из них."
              )}
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>
              {tt("together.lobby.historyBadge", "Истории")}
            </Text>
          </View>
        </Pressable>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(10, 13, 26, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  heroTop: {
    maxWidth: 340,
    gap: 10,
  },
  kicker: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "800",
  },
  heroText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 15,
    lineHeight: 21,
  },
  heroBridgeText: {
    color: "#FFF5EA",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  heroBottom: {
    gap: 8,
  },
  radiusPanel: {
    gap: 9,
    padding: 12,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  searchSummaryPanel: {
    gap: 7,
    padding: 12,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  radiusTitle: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "900",
  },
  radiusOptions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  radiusOption: {
    minHeight: 36,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  radiusOptionSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: "rgba(255,255,255,0.24)",
  },
  radiusOptionText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  radiusOptionTextSelected: {
    color: "#FFFFFF",
  },
  radiusHint: {
    color: "rgba(255,245,234,0.74)",
    fontSize: 12,
    lineHeight: 17,
  },
  radiusNotice: {
    color: "#FFE0B8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  heroLoop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroLoopChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroLoopChipText: {
    color: "#FFF5EA",
    fontSize: 11,
    fontWeight: "800",
  },
  primaryCta: {
    alignSelf: "center",
    minHeight: 56,
    width: "100%",
    maxWidth: 390,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 24,
    paddingVertical: 15,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  primaryCtaDisabled: {
    opacity: 0.68,
  },
  primaryCtaTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  primaryCtaHint: {
    color: "rgba(255,245,234,0.92)",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  historyCard: {
    borderRadius: theme.shapes.card,
    padding: 17,
    backgroundColor: "rgba(13, 17, 31, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyTextWrap: {
    flex: 1,
    gap: 6,
  },
  historyTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  historyText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  historyBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  historyBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  secondarySection: {
    gap: 4,
    paddingHorizontal: 2,
  },
  secondarySectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  secondarySectionText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  secondaryCard: {
    borderRadius: theme.shapes.card,
    padding: 17,
    backgroundColor: "rgba(16, 20, 38, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  cardDescription: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  cardDetails: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  secondaryCta: {
    minHeight: 48,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: theme.colors.accent,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryCtaText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
