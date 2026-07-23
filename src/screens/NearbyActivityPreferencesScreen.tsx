import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import type { RootStackNavigationProp } from "@/navigation/appRoutes";
import { ApiError } from "@/services/api/apiClient";
import * as nearbyApi from "@/services/api/nearbyApi";
import type {
  NearbyActivityCategory,
  NearbyActivityDefinition,
  NearbyActivityKey,
  NearbyActivityPreferencesResponse,
} from "@/services/api/types";
import { theme } from "@/theme";

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

const ACTIVITY_CATEGORY_FALLBACK: Record<NearbyActivityCategory, string> = {
  social: "Social / calm",
  movement: "Movement",
  team_sports: "Team sports",
  nature_water: "Nature & water",
  culture_events: "Culture & events",
  hobbies: "Hobbies",
};

type ActivitySection = {
  category: NearbyActivityCategory;
  activities: NearbyActivityDefinition[];
};

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string,
  params?: Record<string, string>
) {
  const value = t(key, params);
  if (value !== key) return value;
  return Object.entries(params ?? {}).reduce(
    (text, [paramKey, paramValue]) =>
      text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), paramValue),
    fallback
  );
}

function getErrorText(
  error: unknown,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (error instanceof ApiError) return error.message;
  return copyOrFallback(
    t,
    "nearby.activityPreferences.errorGeneric",
    "Activity preferences are temporarily unavailable. Try again."
  );
}

function getActivityLabel(
  activity: NearbyActivityDefinition,
  t: (key: string, params?: Record<string, string>) => string
) {
  return copyOrFallback(
    t,
    `nearby.activityPreferences.activity.${activity.activityKey}`,
    activity.title
  );
}

function getCategoryLabel(
  category: NearbyActivityCategory,
  t: (key: string, params?: Record<string, string>) => string
) {
  return copyOrFallback(
    t,
    `nearby.activityPreferences.category.${category}`,
    ACTIVITY_CATEGORY_FALLBACK[category]
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
  const { t } = useLocale();
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

  const applyResponse = useCallback((response: NearbyActivityPreferencesResponse) => {
    const activeKeys = getActivePreferenceKeys(response);
    setActivities(response.availableActivities ?? []);
    setSelectedKeys(activeKeys);
    setSavedKeys(new Set(activeKeys));
  }, []);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setErrorText("");
    setSaved(false);
    try {
      const response = await nearbyApi.getActivityPreferences();
      if (!mountedRef.current) return;
      applyResponse(response);
    } catch (error) {
      if (!mountedRef.current) return;
      setActivities([]);
      setSelectedKeys(new Set());
      setSavedKeys(new Set());
      setErrorText(getErrorText(error, t));
    } finally {
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
    if (saving || loading || !hasChanges) return;
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
      setErrorText(getErrorText(error, t));
    } finally {
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
    ? copyOrFallback(t, "nearby.activityPreferences.saving", "Saving…")
    : hasChanges
    ? copyOrFallback(t, "nearby.activityPreferences.save", "Save")
    : copyOrFallback(t, "nearby.activityPreferences.savedButton", "Saved ✓");
  const secondaryButtonText = hasChanges
    ? copyOrFallback(t, "nearby.activityPreferences.cancelChanges", "Cancel")
    : copyOrFallback(t, "nearby.activityPreferences.done", "Done");

  return (
    <ScreenShell
      title={copyOrFallback(
        t,
        "screen.nearbyActivityPreferences",
        "Nearby activities"
      )}
      titleNumberOfLines={2}
      background="nearbyWarm"
      overlayOpacity={0.16}
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
                t,
                "nearby.activityPreferences.title",
                "Choose nearby activities"
              )}
            </Text>
            <Text style={styles.body}>
              {copyOrFallback(
                t,
                "nearby.activityPreferences.body",
                "Mark what you are interested in nearby. This is optional and does not change your people feed."
              )}
            </Text>
          </View>

          {loading ? (
            <View style={styles.statePanel}>
              <ActivityIndicator color={theme.colors.textAccent} />
              <Text style={styles.stateText}>
                {copyOrFallback(
                  t,
                  "nearby.activityPreferences.loading",
                  "Loading activities..."
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
                    {copyOrFallback(t, "common.retry", "Retry")}
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
                            selected ? styles.activityRowSelected : null,
                            saving ? styles.rowDisabled : null,
                          ]}
                          accessibilityRole="checkbox"
                          accessibilityState={{
                            checked: selected,
                            disabled: saving,
                          }}
                        >
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
                          <Text
                            style={[
                              styles.activityLabel,
                              selected ? styles.activityLabelSelected : null,
                            ]}
                          >
                            {getActivityLabel(activity, t)}
                          </Text>
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
                  t,
                  "nearby.activityPreferences.empty",
                  "No activities are available yet."
                )}
              </Text>
            </View>
          ) : null}

          {saved ? (
            <View style={styles.successPanel}>
              <Ionicons name="checkmark-circle-outline" size={18} color="#B9F6D2" />
              <Text style={styles.successBody}>
                {copyOrFallback(
                  t,
                  "nearby.activityPreferences.savedReturnHint",
                  "Saved. You can return to Nearby Activities."
                )}
              </Text>
            </View>
          ) : null}
        </ScrollView>

        {!loading && activities.length ? (
          <View style={styles.footerPanel}>
            <Text style={styles.selectedCountText}>
              {copyOrFallback(
                t,
                "nearby.activityPreferences.selectedCount",
                "Selected: {count}",
                { count: String(selectedCount) }
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
    borderRadius: 20,
    padding: 16,
    gap: 6,
    backgroundColor: "rgba(4, 8, 20, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
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
    borderRadius: 18,
    padding: 16,
    backgroundColor: "rgba(10, 16, 24, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
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
    backgroundColor: "rgba(255, 77, 103, 0.16)",
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
    gap: 8,
  },
  activityRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(10, 16, 28, 0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  activityRowSelected: {
    backgroundColor: theme.colors.chipActiveBg,
    borderColor: theme.colors.chipActiveBorder,
  },
  rowDisabled: {
    opacity: 0.58,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(226,232,255,0.36)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  checkCircleSelected: {
    backgroundColor: theme.colors.primaryActionBg,
    borderColor: theme.colors.primaryActionBg,
  },
  activityLabel: {
    flex: 1,
    color: "rgba(226,232,255,0.86)",
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  activityLabelSelected: {
    color: theme.colors.text,
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
    backgroundColor: "rgba(4, 8, 20, 0.92)",
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
    backgroundColor: "rgba(201,120,104,0.12)",
    borderColor: "rgba(201,120,104,0.28)",
  },
  saveButtonTextDisabled: {
    color: "rgba(221,160,139,0.58)",
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
