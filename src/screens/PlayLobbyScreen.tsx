import React from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";

import GoldActionButton from "@/components/GoldActionButton";
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
  getMissingMatchingSafetyFields,
  refreshUserProfile,
  type MatchingSafetyField,
} from "@/services/user";
import { startStartupSpan } from "@/services/startupDiagnostics";
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

function getMissingSafetyFieldLabels(
  fields: MatchingSafetyField[],
  t: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  return fields.map((field) => {
    if (field === "birthDate") {
      return t("profile.birthDateMissingBadge", "Дата рождения");
    }
    if (field === "gender") {
      return t("profile.genderSummaryTitle", "Ваш пол");
    }
    return t("profile.lookingForSummaryTitle", "Кого искать");
  });
}

function getMissingSafetyFieldsBody(
  fields: MatchingSafetyField[],
  t: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  return t(
    "together.profileSafetyFieldsBody",
    "Для «Вместе» нужна основная анкета профиля: {fields}. Анкета активностей рядом здесь не используется. Точная дата рождения не показывается другим людям.",
    { fields: getMissingSafetyFieldLabels(fields, t).join(", ") }
  );
}

export default function PlayLobbyScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayMatch">>();
  const { t } = useLocale();
  const { height: screenHeight } = useWindowDimensions();
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
  const [missingSafetyFields, setMissingSafetyFields] = React.useState<MatchingSafetyField[]>([]);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [togetherFiltersSheetVisible, setTogetherFiltersSheetVisible] = React.useState(false);

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
      const finishTogetherInitialLoad = startStartupSpan("together.initial_load", {
        focused: true,
      });
      void refreshUserProfile()
        .then((profile) => {
          if (!alive) return;
          setProfileInterestCount(profile.interests.length);
          setMissingSafetyFields(getMissingMatchingSafetyFields(profile));
          finishTogetherInitialLoad({
            outcome: "success",
            interestCount: profile.interests.length,
          });
        })
        .catch(() => {
          if (!alive) return;
          setProfileInterestCount(null);
          setMissingSafetyFields(["birthDate", "gender", "preferredGenders"]);
          finishTogetherInitialLoad({ outcome: "error" });
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
      "После рисунка можно продолжить историю, если вы оба этого захотите."
    ),
    details: tt(
      "together.lobby.storySparksDetails",
      "Второй этап открывается после рисунка для той же пары."
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

  const openProfileSafetyFields = React.useCallback(() => {
    navigation.navigate("Profile", {
      screen: "EditProfile",
      params: {
        focus: missingSafetyFields.includes("birthDate") ? "birthDate" : "preferences",
        returnTo: "Together",
        requireMatchingSafetyFields: true,
      },
    });
  }, [missingSafetyFields, navigation]);

  const openTogetherFiltersSheet = React.useCallback(() => {
    setTogetherFiltersSheetVisible(true);
  }, []);

  const closeTogetherFiltersSheet = React.useCallback(() => {
    setTogetherFiltersSheetVisible(false);
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
        const profile = await refreshUserProfile();
        const missingFields = getMissingMatchingSafetyFields(profile);
        setMissingSafetyFields(missingFields);
        if (missingFields.length) {
          Alert.alert(
            tt(
              "together.profileSafetyTitle",
              "Заполните основную анкету профиля"
            ),
            getMissingSafetyFieldsBody(missingFields, tt),
            [
              {
                text: tt(
                  "together.profileSafetyAction",
                  "Открыть основную анкету"
                ),
                onPress: openProfileSafetyFields,
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
      openProfileSafetyFields,
      radiusLabel,
      resolveQueueLocation,
      selectedAgeFilter,
      selectedRadiusKm,
      tt,
    ]
  );

  const togetherFiltersSheetMaxHeight = screenHeight * 0.68;

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
              {tt("together.lobby.drawKicker", "Вместе")}
            </Text>
            <Text style={styles.heroTitle}>
              {tt("together.lobby.drawHeroTitle", "Начните с общего момента")}
            </Text>
            <Text style={styles.heroText}>
              {tt(
                "together.lobby.drawHeroBody",
                "Один короткий рисунок помогает почувствовать человека без лишних слов."
              )}
            </Text>
          </View>

          <View style={styles.heroBottom}>
            {missingSafetyFields.length ? (
              <View style={styles.completionPanel}>
                <Text style={styles.completionTitle}>
                  {tt(
                    "together.profileSafetyTitle",
                    "Заполните основную анкету профиля"
                  )}
                </Text>
                <Text style={styles.completionBody}>
                  {getMissingSafetyFieldsBody(missingSafetyFields, tt)}
                </Text>
                <Pressable
                  onPress={openProfileSafetyFields}
                  style={styles.completionButton}
                  accessibilityRole="button"
                >
                  <Text style={styles.completionButtonText}>
                    {tt(
                      "together.profileSafetyAction",
                      "Открыть основную анкету"
                    )}
                  </Text>
                </Pressable>
              </View>
            ) : null}

            <GoldActionButton
              label={
                locationBusy
                  ? tt("together.geo.locationLoading", "Получаем геолокацию...")
                  : tt("together.lobby.startDrawChallenge", "Начать")
              }
              onPress={() => void openActivity("draw", "startDraw")}
              disabled={locationBusy}
              loading={locationBusy}
              compact={false}
              subtleGlow
              style={styles.primaryCta}
            />
            <Text style={styles.primaryCtaHint}>
              {tt(
                "together.lobby.startDrawHint",
                "Сначала общий рисунок. Дальше - продолжение только по взаимности."
              )}
            </Text>

            {locationNotice ? (
              <Text style={styles.locationNotice}>{locationNotice}</Text>
            ) : null}

            <Pressable
              onPress={openTogetherFiltersSheet}
              style={styles.searchSettingsPill}
              accessibilityRole="button"
            >
              <Ionicons name="options-outline" size={15} color={theme.colors.textAccent} />
              <Text
                style={styles.searchSettingsPillText}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {tt(
                  "together.searchSettingsPill",
                  "Поиск: {radius} · {age}",
                  {
                    radius: radiusLabel(selectedRadiusKm),
                    age: ageFilterLabel(selectedAgeFilter),
                  }
                )}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setDetailsOpen((current) => !current)}
              style={styles.detailsToggle}
              accessibilityRole="button"
            >
              <Text style={styles.detailsToggleText}>
                {detailsOpen
                  ? tt("together.lobby.detailsHide", "Скрыть детали")
                  : tt("together.lobby.detailsShow", "Как это работает")}
              </Text>
              <Text style={styles.detailsToggleIcon}>{detailsOpen ? "-" : "+"}</Text>
            </Pressable>

            {detailsOpen ? (
              <View style={styles.detailsPanel}>
                <Text style={styles.detailsText}>
                  {tt(
                    "together.lobby.coreLoopPlain",
                    "Короткий рисунок помогает почувствовать совпадение. Если обоим хочется, дальше будет чат или история."
                  )}
                </Text>
                <View style={styles.detailSteps}>
                  {[
                    tt("together.lobby.drawStepChallenge", "Творческий вызов"),
                    tt("together.lobby.drawStepCanvas", "Общий холст"),
                    tt("together.lobby.drawStepResult", "Совместный результат"),
                    tt("together.lobby.drawStepStory", "История на двоих"),
                    tt("together.lobby.drawStepChat", "Чат по взаимности"),
                  ].map((item) => (
                    <View key={item} style={styles.detailStepChip}>
                      <Text style={styles.detailStepText}>{item}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.detailsTitle}>{storySparksCopy.title}</Text>
                <Text style={styles.detailsText}>{storySparksCopy.description}</Text>
                <Text style={styles.detailsMuted}>{storySparksCopy.details}</Text>
                <Text style={styles.detailsMuted}>
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
              </View>
            ) : null}
          </View>
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

      <Modal
        visible={togetherFiltersSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={closeTogetherFiltersSheet}
      >
        <View style={styles.filtersSheetBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeTogetherFiltersSheet} />
          <View style={[styles.filtersSheet, { maxHeight: togetherFiltersSheetMaxHeight }]}>
            <View style={styles.sheetHandle} />
            <View style={styles.filtersSheetHeader}>
              <View style={styles.filtersSheetTitleCopy}>
                <Text style={styles.filtersSheetTitle}>
                  {tt("together.searchSettingsTitle", "Настройки поиска")}
                </Text>
                <Text style={styles.filtersSheetSubtitle}>
                  {tt(
                    "together.searchSettingsSubtitle",
                    "Это влияет только на поиск во «Вместе»."
                  )}
                </Text>
              </View>
              <Pressable
                onPress={closeTogetherFiltersSheet}
                style={styles.sheetCloseButton}
                accessibilityRole="button"
              >
                <Ionicons
                  name="close"
                  size={theme.buttons.icon.iconSize}
                  color={theme.buttons.icon.iconColor}
                />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.filtersSheetContent}
            >
              <View style={styles.filterBlock}>
                <Text style={styles.filterTitle}>
                  {tt("together.geo.radiusTitle", "Радиус поиска")}
                </Text>
                <View style={styles.optionRow}>
                  {TOGETHER_RADIUS_OPTIONS.map((radiusKm) => {
                    const selected = selectedRadiusKm === radiusKm;
                    return (
                      <Pressable
                        key={radiusKm === null ? "anywhere" : String(radiusKm)}
                        onPress={() => selectRadius(radiusKm)}
                        style={[
                          styles.optionChip,
                          selected ? styles.optionChipSelected : null,
                        ]}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selected ? styles.optionChipTextSelected : null,
                          ]}
                        >
                          {radiusLabel(radiusKm)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.sheetDivider} />

              <View style={styles.filterBlock}>
                <Text style={styles.filterTitle}>
                  {tt("together.age.title", "Кого искать")}
                </Text>
                <View style={styles.optionRow}>
                  {AGE_FILTER_OPTIONS.map((option) => {
                    const selected = selectedAgeFilter === option.id;
                    return (
                      <Pressable
                        key={option.id}
                        onPress={() => selectAgeFilter(option.id)}
                        style={[
                          styles.optionChip,
                          selected ? styles.optionChipSelected : null,
                        ]}
                        accessibilityRole="button"
                      >
                        <Text
                          style={[
                            styles.optionChipText,
                            selected ? styles.optionChipTextSelected : null,
                          ]}
                        >
                          {ageFilterLabel(option.id)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <GoldActionButton
                label={tt("together.searchSettingsDone", "Готово")}
                onPress={closeTogetherFiltersSheet}
                compact
                style={styles.sheetDoneButton}
              />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 14,
    paddingBottom: 40,
    gap: 14,
  },
  hero: {
    gap: 14,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 18,
    borderRadius: 24,
    backgroundColor: "rgba(7, 10, 20, 0.50)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
  },
  heroTop: {
    alignItems: "center",
    gap: 8,
  },
  kicker: {
    color: theme.colors.textAccent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
    textAlign: "center",
    textTransform: "uppercase",
  },
  heroTitle: {
    alignSelf: "center",
    color: theme.colors.textPrimary,
    fontSize: 30,
    lineHeight: 35,
    fontWeight: "800",
    maxWidth: 390,
    textAlign: "center",
  },
  heroText: {
    alignSelf: "center",
    color: theme.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    maxWidth: 390,
    textAlign: "center",
  },
  heroBottom: {
    gap: 12,
  },
  completionPanel: {
    gap: 7,
    padding: 12,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(245,194,77,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,194,77,0.30)",
  },
  completionTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
  },
  completionBody: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  completionButton: {
    alignSelf: "flex-start",
    minHeight: 34,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(245,194,77,0.10)",
    borderWidth: 1,
    borderColor: "rgba(245,194,77,0.34)",
  },
  completionButtonText: {
    color: theme.colors.textAccent,
    fontSize: 12,
    fontWeight: "900",
  },
  filterBlock: {
    gap: 8,
  },
  filterTitle: {
    color: theme.colors.textPrimary,
    fontSize: 13,
    fontWeight: "900",
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  optionChip: {
    minHeight: 34,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  optionChipSelected: {
    backgroundColor: "rgba(245,194,77,0.16)",
    borderColor: "rgba(245,194,77,0.46)",
  },
  optionChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: "800",
  },
  optionChipTextSelected: {
    color: theme.colors.textAccent,
  },
  primaryCta: {
    alignSelf: "center",
    minHeight: 48,
    width: "100%",
    maxWidth: 390,
  },
  primaryCtaHint: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  locationNotice: {
    color: theme.colors.textAccent,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    textAlign: "center",
  },
  searchSettingsPill: {
    alignSelf: "center",
    minHeight: 38,
    maxWidth: "100%",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.055)",
    borderWidth: 1,
    borderColor: "rgba(245,194,77,0.30)",
  },
  searchSettingsPillText: {
    flexShrink: 1,
    color: theme.colors.textAccent,
    fontSize: 12,
    fontWeight: "900",
  },
  detailsToggle: {
    minHeight: 38,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 15,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    backgroundColor: "rgba(255,255,255,0.045)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  detailsToggleText: {
    color: theme.colors.textAccent,
    fontSize: 13,
    fontWeight: "800",
  },
  detailsToggleIcon: {
    color: theme.colors.textAccent,
    fontSize: 16,
    fontWeight: "900",
  },
  detailsPanel: {
    gap: 9,
    padding: 13,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(7, 10, 20, 0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
  },
  detailsTitle: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: "900",
    marginTop: 2,
  },
  detailsText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  detailsMuted: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 12,
    lineHeight: 17,
  },
  detailSteps: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  detailStepChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  detailStepText: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: "800",
  },
  historyCard: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(13, 17, 31, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
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
    fontSize: 15,
    fontWeight: "800",
  },
  historyText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
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
  filtersSheetBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.44)",
  },
  filtersSheet: {
    width: "100%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 18,
    backgroundColor: theme.sheets.backgroundColor,
    borderTopWidth: 1,
    borderColor: theme.sheets.borderColor,
  },
  sheetHandle: {
    alignSelf: "center",
    width: theme.sheets.handleWidth,
    height: theme.sheets.handleHeight,
    borderRadius: theme.sheets.handleRadius,
    backgroundColor: "rgba(255,255,255,0.22)",
    marginBottom: 12,
  },
  filtersSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
  filtersSheetTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  filtersSheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    lineHeight: 24,
    fontWeight: "900",
  },
  filtersSheetSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  sheetCloseButton: {
    width: theme.buttons.icon.width,
    height: theme.buttons.icon.height,
    borderRadius: theme.buttons.icon.borderRadius,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.buttons.icon.backgroundColor,
    borderWidth: theme.buttons.icon.borderWidth,
    borderColor: theme.buttons.icon.borderColor,
  },
  filtersSheetContent: {
    gap: 12,
    paddingBottom: 2,
  },
  sheetDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  sheetDoneButton: {
    marginTop: 2,
  },
});
