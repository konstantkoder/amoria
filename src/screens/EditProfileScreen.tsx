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

const GOAL_OPTIONS: Goal[] = [
  "relationship",
  "dating",
  "friendship",
  "chat",
  "unsure",
];

const MOOD_OPTIONS: Mood[] = [
  "romantic",
  "playful",
  "chill",
  "curious",
  "adventurous",
];

const GOAL_LABEL_KEYS: Record<Goal, string> = {
  relationship: "profile.goal.relationship",
  dating: "profile.goal.dating",
  friendship: "profile.goal.friendship",
  chat: "profile.goal.chat",
  unsure: "profile.goal.unsure",
};

const MOOD_LABEL_KEYS: Record<Mood, string> = {
  romantic: "profile.mood.romantic",
  playful: "profile.mood.playful",
  chill: "profile.mood.chill",
  curious: "profile.mood.curious",
  adventurous: "profile.mood.adventurous",
};

const GOAL_LABEL_FALLBACKS: Record<Goal, string> = {
  relationship: "Relationship",
  dating: "Dating",
  friendship: "Friendship",
  chat: "Chat",
  unsure: "Not sure yet",
};

const MOOD_LABEL_FALLBACKS: Record<Mood, string> = {
  romantic: "Romantic",
  playful: "Playful",
  chill: "Chill",
  curious: "Curious",
  adventurous: "Adventurous",
};

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
  const [interestsText, setInterestsText] = React.useState("");
  const [birthDate, setBirthDate] = React.useState("");
  const [goal, setGoal] = React.useState<Goal>("dating");
  const [mood, setMood] = React.useState<Mood>("chill");
  const [mysteryMode, setMysteryMode] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const displayNameInputRef = React.useRef<TextInput>(null);
  const aboutInputRef = React.useRef<TextInput>(null);
  const interestsInputRef = React.useRef<TextInput>(null);
  const birthDateInputRef = React.useRef<TextInput>(null);
  const goalYRef = React.useRef(0);
  const moodYRef = React.useRef(0);
  const birthDateYRef = React.useRef(0);
  const focusTarget = route.params?.focus;

  const applyProfile = React.useCallback((profile: UserProfile) => {
    setDisplayName(profile.displayName ?? "");
    setAbout(profile.about ?? "");
    setInterestsText((profile.interests ?? []).join(", "));
    setBirthDate(profile.birthDate ?? "");
    setGoal(profile.goal ?? "dating");
    setMood(profile.mood ?? "chill");
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

  const handleSave = async () => {
    try {
      setSaving(true);
      const nextDisplayName = normalizeDisplayNameInput(displayName);
      const displayNameErrorKey = getDisplayNameValidationErrorKey(nextDisplayName);
      if (displayNameErrorKey) {
        Alert.alert(t("common.error"), t(displayNameErrorKey));
        return;
      }
      const interestsArray = interestsText
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      const nextBirthDate = birthDate.trim();
      if (nextBirthDate && !isValidBirthDateInput(nextBirthDate)) {
        Alert.alert(t("common.error"), t("editProfile.birthDateInvalid"));
        return;
      }

      const savedProfile = await updateUserFields({
        displayName: nextDisplayName,
        about,
        interests: interestsArray,
        birthDate: nextBirthDate || null,
        goal,
        mood,
        mysteryMode,
      });
      applyProfile(savedProfile);
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

          <Text style={styles.label}>{t("editProfile.interestsLabel")}</Text>
          <TextInput
            ref={interestsInputRef}
            value={interestsText}
            onChangeText={setInterestsText}
            placeholder={t("editProfile.interestsPlaceholder")}
            placeholderTextColor={theme.colors.muted}
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={() => birthDateInputRef.current?.focus()}
          />

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
              {GOAL_OPTIONS.map((option) => {
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
              {MOOD_OPTIONS.map((option) => {
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
