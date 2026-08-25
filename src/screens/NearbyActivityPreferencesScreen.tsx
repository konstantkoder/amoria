import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import type { RootStackNavigationProp } from "@/navigation/appRoutes";
import { reportClientError, sanitizeErrorForReport } from "@/services/api/clientErrorsApi";
import * as nearbyApi from "@/services/api/nearbyApi";
import type {
  NearbyActivityCategory,
  NearbyActivityDefinition,
  NearbyActivityKey,
  NearbyActivityPreferencesResponse,
} from "@/services/api/types";
import { theme } from "@/theme";
import { getNearbyActivityArt } from "@/assets/nearby/activityArt";

const ACTIVITY_CATEGORY_ORDER: NearbyActivityCategory[] = [
  "social",
  "movement",
  "team_sports",
  "nature_water",
  "culture_events",
  "hobbies",
];

const ACTIVITY_CATEGORY_RANK = ACTIVITY_CATEGORY_ORDER.reduce(
  (ranks, category, index) => ({
    ...ranks,
    [category]: index,
  }),
  {} as Record<NearbyActivityCategory, number>
);

type ActivitySection = {
  category: NearbyActivityCategory;
  activities: NearbyActivityDefinition[];
};

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  params?: Record<string, string>
) {
  return t(key, params);
}

function getErrorText(
  error: unknown,
  t: (key: string, params?: Record<string, string>) => string
) {
  return copyOrFallback(
    t, "nearby.activityPreferences.errorGeneric"
  );
}

function getActivityLabel(
  activity: NearbyActivityDefinition,
  t: (key: string, params?: Record<string, string>) => string
) {
  return copyOrFallback(
    t, `nearby.activityPreferences.activity.${activity.activityKey}`
  );
}

function getCategoryLabel(
  category: NearbyActivityCategory,
  t: (key: string, params?: Record<string, string>) => string
) {
  return copyOrFallback(
    t, `nearby.activityPreferences.category.${category}`
  );
}

function compareActivities(
  left: NearbyActivityDefinition,
  right: NearbyActivityDefinition
) {
  const categoryDelta =
    ACTIVITY_CATEGORY_RANK[left.category] - ACTIVITY_CATEGORY_RANK[right.category];
  if (categoryDelta !== 0) return categoryDelta;

  const sortDelta = left.sortOrder - right.sortOrder;
  if (sortDelta !== 0) return sortDelta;

  return left.title.localeCompare(right.title);
}

function groupActivitiesByCategory(
  activities: NearbyActivityDefinition[]
): ActivitySection[] {
  const sections = new Map<NearbyActivityCategory, NearbyActivityDefinition[]>();

  for (const activity of [...activities].sort(compareActivities)) {
    const categoryActivities = sections.get(activity.category) ?? [];
    categoryActivities.push(activity);
    sections.set(activity.category, categoryActivities);
  }

  return ACTIVITY_CATEGORY_ORDER.map((category) => ({
    category,
    activities: sections.get(category) ?? [],
  })).filter((section) => section.activities.length > 0);
}

function getActivePreferenceKeys(response: NearbyActivityPreferencesResponse) {
  return new Set(
    response.preferences
      .filter((preference) => preference.status === "active")
      .map((preference) => preference.activityKey)
  );
}

function sameSelectedKeys(
  first: ReadonlySet<NearbyActivityKey>,
  second: ReadonlySet<NearbyActivityKey>
) {
  if (first.size !== second.size) return false;
  for (const key of first) {
    if (!second.has(key)) return false;
  }
  return true;
}

export default function NearbyActivityPreferencesScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"NearbyActivityPreferences">>();
  const { t, locale } = useLocale();
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const { width: screenWidth } = useWindowDimensions();
  const availableGridWidth = screenWidth - 34;
  const activityCardWidth =
    screenWidth < 350 ? availableGridWidth : (availableGridWidth - 12) / 2;
  const mountedRef = useRef(true);
  const [activities, setActivities] = useState<NearbyActivityDefinition[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<NearbyActivityKey>>(
    () => new Set()
  );
  const [savedKeys, setSavedKeys] = useState<Set<NearbyActivityKey>>(
    () => new Set()
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [saved, setSaved] = useState(false);
  const loadInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);

  const applyResponse = useCallback((response: NearbyActivityPreferencesResponse) => {
    const activeKeys = getActivePreferenceKeys(response);
    setActivities(response.availableActivities ?? []);
    setSelectedKeys(activeKeys);
    setSavedKeys(new Set(activeKeys));
  }, []);

  const loadPreferences = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    setErrorText("");
    setSaved(false);
    try {
      const response = await nearbyApi.getActivityPreferences();
      if (!mountedRef.current) return;
      applyResponse(response);
    } catch (error) {
      if (!mountedRef.current) return;
      const safe = sanitizeErrorForReport(error);
      void reportClientError({ screen: "NearbyActivityPreferences", action: "load", code: safe.code, message: safe.message, stack: safe.stack });
      setActivities([]);
      setSelectedKeys(new Set());
      setSavedKeys(new Set());
      setErrorText(getErrorText(error, t));
    } finally {
      loadInFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [applyResponse, t]);

  useEffect(() => {
    mountedRef.current = true;
    void loadPreferences();
    return () => {
      mountedRef.current = false;
    };
  }, [loadPreferences]);

  const hasChanges = useMemo(
    () => !sameSelectedKeys(selectedKeys, savedKeys),
    [savedKeys, selectedKeys]
  );
  const activitySections = useMemo(
    () => groupActivitiesByCategory(activities),
    [activities]
  );
  const selectedCount = selectedKeys.size;

  const toggleActivity = useCallback((activityKey: NearbyActivityKey) => {
    setSaved(false);
    setSelectedKeys((current) => {
      const next = new Set(current);
      if (next.has(activityKey)) {
        next.delete(activityKey);
      } else {
        next.add(activityKey);
      }
      return next;
    });
  }, []);

  const savePreferences = useCallback(async () => {
    if (saveInFlightRef.current || saving || loading || !hasChanges) return;
    saveInFlightRef.current = true;
    setSaving(true);
    setErrorText("");
    setSaved(false);
    try {
      const preferences = activities
        .filter((activity) => selectedKeys.has(activity.activityKey))
        .map((activity) => ({ activityKey: activity.activityKey }));
      const response = await nearbyApi.updateActivityPreferences(preferences);
      if (!mountedRef.current) return;
      applyResponse(response);
      setSaved(true);
    } catch (error) {
      if (!mountedRef.current) return;
      const safe = sanitizeErrorForReport(error);
      void reportClientError({ screen: "NearbyActivityPreferences", action: "save", code: safe.code, message: safe.message, stack: safe.stack });
      setErrorText(getErrorText(error, t));
    } finally {
      saveInFlightRef.current = false;
      if (mountedRef.current) {
        setSaving(false);
      }
    }
  }, [activities, applyResponse, hasChanges, loading, saving, selectedKeys, t]);

  const cancelChanges = useCallback(() => {
    setSelectedKeys(new Set(savedKeys));
    setSaved(false);
    setErrorText("");
  }, [savedKeys]);

  const handleSecondaryAction = useCallback(() => {
    if (saving) return;
    if (hasChanges) {
      cancelChanges();
      return;
    }
    navigation.goBack();
  }, [cancelChanges, hasChanges, navigation, saving]);

  const canSave = !loading && !saving && hasChanges;
  const primaryButtonText = saving
    ? copyOrFallback(t, "nearby.activityPreferences.saving")
    : hasChanges
    ? copyOrFallback(t, "nearby.activityPreferences.save")
    : copyOrFallback(t, "nearby.activityPreferences.savedButton");
  const secondaryButtonText = hasChanges
    ? copyOrFallback(t, "nearby.activityPreferences.cancelChanges")
    : copyOrFallback(t, "nearby.activityPreferences.done");

  return (
    <ScreenShell
      title={copyOrFallback(
        t, "screen.nearbyActivityPreferences"
      )}
      titleNumberOfLines={2}
      background="nearbyHarborV6"
      blurRadius={0}
      showBack
    >
      <View style={styles.screen}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.introPanel}>
            <Text style={styles.title}>
              {copyOrFallback(
                t, "nearby.activityPreferences.title"
              )}
            </Text>
            <Text style={styles.body}>
              {copyOrFallback(
                t, "nearby.activityPreferences.body"
              )}
            </Text>
          </View>

          {loading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color={theme.colors.textAccent} />
              <Text style={styles.stateText}>
                {copyOrFallback(
                  t, "nearby.activityPreferences.loading"
                )}
              </Text>
            </View>
          ) : null}

          {!loading && errorText ? (
            <View style={styles.errorPanel}>
              <Ionicons name="alert-circle-outline" size={18} color="#FFD2DA" />
              <Text style={styles.errorText}>{errorText}</Text>
              {!activities.length ? (
                <Pressable onPress={loadPreferences} style={styles.retryButton}>
                  <Text style={styles.retryButtonText}>
                    {copyOrFallback(t, "common.retry")}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {!loading && activities.length ? (
            <View style={styles.activityList}>
              {activitySections.map((section) => (
                <View key={section.category} style={styles.categorySection}>
                  <Text style={styles.categoryTitle}>
                    {getCategoryLabel(section.category, t)}
                  </Text>
                  <View style={styles.categoryActivities}>
                    {section.activities.map((activity) => {
                      const selected = selectedKeys.has(activity.activityKey);
                      return (
                        <Pressable
                          key={activity.activityKey}
                          onPress={() => toggleActivity(activity.activityKey)}
                          disabled={saving}
                          style={[
                            styles.activityRow,
                            { width: activityCardWidth },
                            selected ? styles.activityRowSelected : null,
                            saving ? styles.rowDisabled : null,
                          ]}
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: selected,
                            disabled: saving,
                          }}
                          accessibilityLabel={getActivityLabel(activity, t)}
                        >
                          <Image
                            source={getNearbyActivityArt(activity.activityKey)}
                            style={styles.activityArt}
                            resizeMode="cover"
                            accessible={false}
                          />
                          <View
                            style={[
                              styles.checkCircle,
                              selected ? styles.checkCircleSelected : null,
                            ]}
                          >
                            {selected ? (
                              <Ionicons
                                name="checkmark"
                                size={16}
                                color={theme.colors.primaryActionText}
                              />
                            ) : null}
                          </View>
                          <View style={styles.activityCopy}>
                            <Text
                              style={[
                                styles.activityLabel,
                                selected ? styles.activityLabelSelected : null,
                              ]}
                              numberOfLines={2}
                            >
                              {getActivityLabel(activity, t)}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {!loading && !activities.length && !errorText ? (
            <View style={styles.statePanel}>
              <Text style={styles.stateText}>
                {copyOrFallback(
                  t, "nearby.activityPreferences.empty"
                )}
              </Text>
            </View>
          ) : null}

          {saved ? (
            <View style={styles.successPanel}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#B9F6D2" />
              <Text style={styles.successBody}>
                {copyOrFallback(
                  t, "nearby.activityPreferences.savedReturnHint"
                )}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {!loading && activities.length ? (
          <View style={styles.footerPanel}>
            <Text style={styles.selectedCountText}>
              {copyOrFallback(
                t, "nearby.activityPreferences.selectedCount", { count: numberFormatter.format(selectedCount) }
              )}
            </Text>
            <View style={styles.footerActions}>
              <Pressable
                onPress={savePreferences}
                disabled={!canSave}
                style={[
                  styles.saveButton,
                  !canSave ? styles.saveButtonDisabled : null,
                ]}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.colors.primaryActionText}
                  />
                ) : null}
                <Text
                  style={[
                    styles.saveButtonText,
                    !canSave ? styles.saveButtonTextDisabled : null,
                  ]}
                >
                  {primaryButtonText}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSecondaryAction}
                disabled={saving}
                style={[
                  styles.secondaryButton,
                  saving ? styles.buttonDisabled : null,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.secondaryButtonText}>{secondaryButtonText}</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    gap: 12,
    paddingHorizontal: 1,
    paddingBottom: 12,
  },
  introPanel: {
    padding: 16,
    gap: 6,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  title: {
    color: theme.colors.text,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "900",
  },
  body: {
    color: "rgba(226,232,255,0.76)",
    fontSize: 13,
    lineHeight: 18,
  },
  statePanel: {
    minHeight: 86,
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  stateText: {
    color: "#C5CADB",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  errorPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 14,
    padding: 11,
    backgroundColor: "rgba(217,92,75,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 218, 0.24)",
  },
  errorText: {
    flex: 1,
    color: "#FFD2DA",
    fontSize: 13,
    lineHeight: 18,
  },
  retryButton: {
    minHeight: 30,
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255, 210, 218, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 210, 218, 0.30)",
  },
  retryButtonText: {
    color: "#FFD2DA",
    fontSize: 12,
    fontWeight: "900",
  },
  activityList: {
    gap: 14,
  },
  categorySection: {
    gap: 8,
  },
  categoryTitle: {
    color: theme.colors.textAccent,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  categoryActivities: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  activityRow: {
    minHeight: 146,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  activityRowSelected: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: theme.colors.chipActiveBorder,
  },
  rowDisabled: {
    opacity: 0.58,
  },
  checkCircle: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(249,250,255,0.22)",
    backgroundColor: "rgba(5,8,22,0.22)",
  },
  checkCircleSelected: {
    backgroundColor: theme.colors.primaryActionBg,
    borderColor: theme.colors.primaryActionBg,
  },
  activityLabel: {
    color: "rgba(226,232,255,0.86)",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  activityLabelSelected: {
    color: theme.colors.text,
  },
  activityArt: {
    width: "100%",
    height: 84,
  },
  activityCopy: {
    minHeight: 58,
    padding: 10,
    justifyContent: "center",
  },
  successPanel: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 14,
    padding: 11,
    backgroundColor: "rgba(31, 185, 110, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(185, 246, 210, 0.28)",
  },
  successBody: {
    flex: 1,
    color: "rgba(226,232,255,0.76)",
    fontSize: 12,
    lineHeight: 16,
  },
  footerPanel: {
    marginTop: 10,
    borderRadius: 18,
    padding: 12,
    gap: 10,
    backgroundColor: "rgba(5,8,22,0.42)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  selectedCountText: {
    color: theme.colors.textAccent,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  footerActions: {
    minHeight: 50,
    flexDirection: "row",
    gap: 10,
  },
  saveButton: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 17,
    paddingHorizontal: 14,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: 1,
    borderColor: theme.buttons.primary.borderColor,
  },
  saveButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
  },
  saveButtonDisabled: {
    backgroundColor: "rgba(230,185,118,0.08)",
    borderColor: "rgba(230,185,118,0.18)",
  },
  saveButtonTextDisabled: {
    color: "rgba(230,185,118,0.52)",
  },
  secondaryButton: {
    minWidth: 104,
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryButtonText: {
    color: theme.buttons.secondary.textColor,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  buttonDisabled: {
    opacity: 0.58,
  },
});
