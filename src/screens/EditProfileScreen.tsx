import React from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import {
  GOAL_LABEL_FALLBACKS,
  GOAL_LABEL_KEYS,
  MOOD_LABEL_FALLBACKS,
  MOOD_LABEL_KEYS,
  PROFILE_GOAL_OPTIONS,
  PROFILE_INTERESTS_MAX_COUNT,
  PROFILE_INTEREST_MAX_LENGTH,
  PROFILE_INTEREST_SUGGESTIONS,
  PROFILE_MOOD_OPTIONS,
  normalizeProfileInterestInput,
} from "@/config/profileFields";
import { useLocale } from "@/contexts/LocaleContext";
import type { Goal, Mood, UserProfile } from "@/models/User";
import type { EditProfileRouteProp } from "@/navigation/appRoutes";
import { theme } from "@/theme";
import {
  getDisplayNameValidationErrorKey,
  getUserProfile,
  normalizeDisplayNameInput,
  updateUserFields,
} from "@/services/user";

function translatedOptionLabel(
  t: (key: string) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

function isValidBirthDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return false;
  }
  return date.getTime() <= Date.now();
}

export default function EditProfileScreen() {
  const route = useRoute<EditProfileRouteProp>();
  const { t } = useLocale();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [displayName, setDisplayName] = React.useState("");
  const [about, setAbout] = React.useState("");
  const [interests, setInterests] = React.useState<string[]>([]);
  const [interestDraft, setInterestDraft] = React.useState("");
  const [interestError, setInterestError] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [goal, setGoal] = React.useState<Goal | null>(null);
  const [mood, setMood] = React.useState<Mood | null>(null);
  const [mysteryMode, setMysteryMode] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const displayNameInputRef = React.useRef<TextInput>(null);
  const aboutInputRef = React.useRef<TextInput>(null);
  const interestsInputRef = React.useRef<TextInput>(null);
  const birthDateInputRef = React.useRef<TextInput>(null);
  const goalYRef = React.useRef(0);
  const moodYRef = React.useRef(0);
  const interestsYRef = React.useRef(0);
  const birthDateYRef = React.useRef(0);
  const focusTarget = route.params?.focus;

  const applyProfile = React.useCallback((profile: UserProfile) => {
    setDisplayName(profile.displayName ?? "");
    setAbout(profile.about ?? "");
    setInterests(profile.interests ?? []);
    setInterestDraft("");
    setInterestError("");
    setBirthDate(profile.birthDate ?? "");
    setGoal(profile.goal ?? null);
    setMood(profile.mood ?? null);
    setMysteryMode(profile.mysteryMode ?? false);
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      setLoading(true);

      void getUserProfile()
        .then((profile) => {
          if (!active) return;
          applyProfile(profile);
        })
        .catch(() => {
          if (active) {
            Alert.alert(t("common.error"), t("editProfile.loadErrorBody"));
          }
        })
        .finally(() => {
          if (active) {
            setLoading(false);
          }
        });

      return () => {
        active = false;
      };
    }, [applyProfile, t])
  );

  React.useEffect(() => {
    if (loading || !focusTarget) return;

    const timer = setTimeout(() => {
      if (focusTarget === "about") {
        scrollRef.current?.scrollTo({ y: 54, animated: true });
        aboutInputRef.current?.focus();
        return;
      }

      if (focusTarget === "goal") {
        scrollRef.current?.scrollTo({
          y: Math.max(goalYRef.current - 24, 0),
          animated: true,
        });
        return;
      }

      if (focusTarget === "mood") {
        scrollRef.current?.scrollTo({
          y: Math.max(moodYRef.current - 24, 0),
          animated: true,
        });
        return;
      }

      if (focusTarget === "interests") {
        scrollRef.current?.scrollTo({
          y: Math.max(interestsYRef.current - 24, 0),
          animated: true,
        });
        interestsInputRef.current?.focus();
        return;
      }

      if (focusTarget === "birthDate") {
        scrollRef.current?.scrollTo({
          y: Math.max(birthDateYRef.current - 24, 0),
          animated: true,
        });
        birthDateInputRef.current?.focus();
      }
    }, 240);

    return () => clearTimeout(timer);
  }, [focusTarget, loading]);

  const validateInterest = React.useCallback(
    (value: string, current: string[]) => {
      const normalized = normalizeProfileInterestInput(value);
      if (!normalized) {
        setInterestError(t("editProfile.interestEmptyError"));
        return "";
      }
      if (normalized.length > PROFILE_INTEREST_MAX_LENGTH) {
        setInterestError(
          t("editProfile.interestTooLongError", {
            max: String(PROFILE_INTEREST_MAX_LENGTH),
          })
        );
        return "";
      }
      if (!current.includes(normalized) && current.length >= PROFILE_INTERESTS_MAX_COUNT) {
        setInterestError(
          t("editProfile.interestTooManyError", {
            max: String(PROFILE_INTERESTS_MAX_COUNT),
          })
        );
        return "";
      }
      return normalized;
    },
    [t]
  );

  const addInterest = React.useCallback(
    (value = interestDraft) => {
      const normalized = validateInterest(value, interests);
      if (!normalized) return;
      setInterestError("");
      if (!interests.includes(normalized)) {
        setInterests([...interests, normalized]);
      }
      setInterestDraft("");
      interestsInputRef.current?.focus();
    },
    [interestDraft, interests, validateInterest]
  );

  const removeInterest = React.useCallback((value: string) => {
    setInterests((current) => current.filter((item) => item !== value));
    setInterestError("");
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const nextDisplayName = normalizeDisplayNameInput(displayName);
      const displayNameErrorKey = getDisplayNameValidationErrorKey(nextDisplayName);
      if (displayNameErrorKey) {
        Alert.alert(t("common.error"), t(displayNameErrorKey));
        return;
      }
      const nextInterests = [...interests];
      if (interestDraft.trim()) {
        const normalized = validateInterest(interestDraft, nextInterests);
        if (!normalized) return;
        if (!nextInterests.includes(normalized)) {
          nextInterests.push(normalized);
        }
      }
      const nextBirthDate = birthDate.trim();
      if (nextBirthDate && !isValidBirthDateInput(nextBirthDate)) {
        Alert.alert(t("common.error"), t("editProfile.birthDateInvalid"));
        return;
      }

      await updateUserFields({
        displayName: nextDisplayName,
        about,
        interests: nextInterests,
        birthDate: nextBirthDate || null,
        goal,
        mood,
        mysteryMode,
      });
      const refreshedProfile = await getUserProfile();
      applyProfile(refreshedProfile);
      displayNameInputRef.current?.blur();
      aboutInputRef.current?.blur();
      interestsInputRef.current?.blur();
      birthDateInputRef.current?.blur();
      Keyboard.dismiss();
      Alert.alert(t("common.done"), t("editProfile.saveSuccessBody"));
    } catch {
      Alert.alert(t("common.error"), t("editProfile.saveErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell
        title={t("editProfile.title")}
        background="profile"
        overlayOpacity={0.16}
        showBack
      >
        <View style={styles.loader}>
          <ActivityIndicator color={theme.colors.primary} />
          <Text style={styles.loaderText}>{t("editProfile.loading")}</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("editProfile.title")}
      background="profile"
      overlayOpacity={0.16}
      showBack
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.label}>{t("editProfile.nameLabel")}</Text>
          <TextInput
            ref={displayNameInputRef}
            value={displayName}
            onChangeText={setDisplayName}
            placeholder={t("editProfile.namePlaceholder")}
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            maxLength={30}
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => aboutInputRef.current?.focus()}
          />

          <Text style={styles.label}>{t("editProfile.aboutLabel")}</Text>
          <TextInput
            ref={aboutInputRef}
            value={about}
            onChangeText={setAbout}
            multiline
            blurOnSubmit
            returnKeyType="next"
            onSubmitEditing={() => interestsInputRef.current?.focus()}
            placeholder={t("editProfile.aboutPlaceholder")}
            placeholderTextColor={theme.colors.muted}
            style={[styles.input, styles.multilineInput]}
          />

          <View
            style={focusTarget === "interests" ? styles.focusedSection : null}
            onLayout={(event) => {
              interestsYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <View style={styles.labelRow}>
              <Text style={styles.label}>{t("editProfile.interestsLabel")}</Text>
              <Text style={styles.labelMeta}>
                {t("editProfile.interestsCount", {
                  count: String(interests.length),
                  max: String(PROFILE_INTERESTS_MAX_COUNT),
                })}
              </Text>
            </View>
            <View style={styles.interestInputRow}>
              <TextInput
                ref={interestsInputRef}
                value={interestDraft}
                onChangeText={(value) => {
                  setInterestDraft(value);
                  setInterestError("");
                }}
                placeholder={t("editProfile.interestsPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, styles.interestInput]}
                maxLength={PROFILE_INTEREST_MAX_LENGTH + 8}
                returnKeyType="done"
                autoCapitalize="none"
                autoCorrect={false}
                onSubmitEditing={() => addInterest()}
              />
              <TouchableOpacity
                style={styles.addInterestButton}
                onPress={() => addInterest()}
                disabled={saving}
                activeOpacity={0.86}
              >
                <Text style={styles.addInterestButtonText}>
                  {t("editProfile.addInterest")}
                </Text>
              </TouchableOpacity>
            </View>
            {interestError ? <Text style={styles.inlineError}>{interestError}</Text> : null}
            {interests.length ? (
              <View style={styles.interestChips}>
                {interests.map((interest) => (
                  <TouchableOpacity
                    key={interest}
                    style={styles.interestChip}
                    onPress={() => removeInterest(interest)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.interestText}>{interest}</Text>
                    <Text style={styles.removeInterestText}>x</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <Text style={styles.helperText}>
                {t("editProfile.interestsEmpty")}
              </Text>
            )}
            <Text style={styles.helperText}>
              {t("editProfile.interestsHelper")}
            </Text>
            <View style={styles.suggestionChips}>
              {PROFILE_INTEREST_SUGGESTIONS.map((interest) => {
                const selected = interests.includes(interest);
                return (
                  <TouchableOpacity
                    key={interest}
                    style={[
                      styles.suggestionChip,
                      selected ? styles.suggestionChipSelected : null,
                    ]}
                    onPress={() => addInterest(interest)}
                    disabled={selected || saving}
                    activeOpacity={0.82}
                  >
                    <Text
                      style={[
                        styles.suggestionText,
                        selected ? styles.suggestionTextSelected : null,
                      ]}
                    >
                      {translatedOptionLabel(t, `profile.interest.${interest}`, interest)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View
            style={focusTarget === "birthDate" ? styles.focusedSection : null}
            onLayout={(event) => {
              birthDateYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>{t("editProfile.birthDateLabel")}</Text>
            <TextInput
              ref={birthDateInputRef}
              value={birthDate}
              onChangeText={setBirthDate}
              placeholder={t("editProfile.birthDatePlaceholder")}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={10}
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
            />
            <Text style={styles.helperText}>
              {t("editProfile.birthDateSafetyBody")}
            </Text>
          </View>

          <View
            style={focusTarget === "goal" ? styles.focusedSection : null}
            onLayout={(event) => {
              goalYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>{t("editProfile.goalLabel")}</Text>
            <View style={styles.optionsWrap}>
              {PROFILE_GOAL_OPTIONS.map((option) => {
                const active = goal === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setGoal(option)}
                    style={[
                      styles.optionButton,
                      active ? styles.goalOptionButtonActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        active ? styles.optionButtonTextActive : null,
                      ]}
                    >
                      {translatedOptionLabel(
                        t,
                        GOAL_LABEL_KEYS[option],
                        GOAL_LABEL_FALLBACKS[option]
                      )}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View
            style={focusTarget === "mood" ? styles.focusedSection : null}
            onLayout={(event) => {
              moodYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>{t("editProfile.moodLabel")}</Text>
            <View style={styles.optionsWrap}>
              {PROFILE_MOOD_OPTIONS.map((option) => {
                const active = mood === option;
                return (
                  <TouchableOpacity
                    key={option}
                    onPress={() => setMood(option)}
                    style={[
                      styles.optionButton,
                      active ? styles.moodOptionButtonActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        active ? styles.optionButtonTextActive : null,
                      ]}
                    >
                      {translatedOptionLabel(
                        t,
                        MOOD_LABEL_KEYS[option],
                        MOOD_LABEL_FALLBACKS[option]
                      )}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.toggleCard}>
            <Text style={styles.toggleTitle}>{t("profile.mysteryBadge")}</Text>
            <Text style={styles.toggleBody}>{t("editProfile.mysteryDescription")}</Text>
            <Switch
              value={mysteryMode}
              onValueChange={setMysteryMode}
              thumbColor={mysteryMode ? theme.colors.accent : "#999"}
              trackColor={{
                false: "#444",
                true: `${theme.colors.accent}88`,
              }}
            />
          </View>

          <TouchableOpacity
            onPress={() => void handleSave()}
            disabled={saving}
            style={[styles.saveButton, saving ? styles.saveButtonDisabled : null]}
          >
            <Text style={styles.saveButtonText}>
              {saving ? t("common.saving") : t("common.save")}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: theme.spacing * 2,
  },
  loader: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loaderText: {
    color: theme.colors.subtext,
  },
  card: {
    backgroundColor: "rgba(8, 12, 24, 0.78)",
    borderRadius: 24,
    padding: theme.spacing,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  label: {
    color: theme.colors.subtext,
    fontSize: 12,
    marginBottom: 6,
  },
  labelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  labelMeta: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    marginBottom: 14,
  },
  multilineInput: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  interestInputRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
    marginBottom: 10,
  },
  interestInput: {
    flex: 1,
    marginBottom: 0,
  },
  addInterestButton: {
    borderRadius: theme.radius,
    paddingHorizontal: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  addInterestButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  inlineError: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: "700",
    marginTop: -4,
    marginBottom: 10,
  },
  interestChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  interestChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255, 78, 138, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.24)",
  },
  interestText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  removeInterestText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "900",
  },
  suggestionChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  suggestionChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  suggestionChipSelected: {
    backgroundColor: "rgba(255,255,255,0.04)",
    opacity: 0.6,
  },
  suggestionText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  suggestionTextSelected: {
    color: theme.colors.subtext,
  },
  helperText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    marginTop: -8,
    marginBottom: 14,
  },
  optionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
    gap: 8,
  },
  focusedSection: {
    borderRadius: theme.radius,
    borderWidth: 1,
    borderColor: theme.colors.accent,
    paddingHorizontal: 10,
    paddingTop: 10,
    marginHorizontal: -10,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.pillBg,
  },
  goalOptionButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  moodOptionButtonActive: {
    backgroundColor: theme.colors.accent,
  },
  optionButtonText: {
    color: theme.colors.pillText,
    fontSize: 12,
    fontWeight: "600",
  },
  optionButtonTextActive: {
    color: "#FFFFFF",
  },
  toggleCard: {
    backgroundColor: theme.colors.card,
    borderRadius: theme.radius,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    marginBottom: 12,
  },
  toggleTitle: {
    color: theme.colors.text,
    fontWeight: "700",
    marginBottom: 4,
  },
  toggleBody: {
    color: theme.colors.subtext,
    marginBottom: 8,
  },
  saveButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
});
