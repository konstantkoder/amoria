import React from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import type { Goal, Mood, ProfileGender, UserProfile } from "@/models/User";
import type { EditProfileRouteProp } from "@/navigation/appRoutes";
import { theme } from "@/theme";
import {
  getDisplayNameValidationErrorKey,
  getUserProfile,
  normalizeDisplayNameInput,
  updateUserFields,
} from "@/services/user";
import { ApiError } from "@/services/api/apiClient";

function translatedOptionLabel(
  t: (key: string) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

const MIN_ADULT_AGE = 18;
const MAX_PROFILE_AGE = 120;
const SELF_GENDER_OPTIONS: Array<{
  id: ProfileGender;
  value: ProfileGender;
  labelKey: string;
}> = [
  { id: "man", value: "man", labelKey: "profile.gender.man" },
  { id: "woman", value: "woman", labelKey: "profile.gender.woman" },
  { id: "nonbinary", value: "nonbinary", labelKey: "profile.gender.nonbinary" },
];
const SEARCH_GENDER_OPTIONS: Array<{
  id: "all" | ProfileGender;
  value: ProfileGender[];
  labelKey: string;
}> = [
  { id: "woman", value: ["woman"], labelKey: "profile.lookingFor.woman" },
  { id: "man", value: ["man"], labelKey: "profile.lookingFor.man" },
  { id: "all", value: [], labelKey: "profile.lookingFor.everyone" },
  { id: "nonbinary", value: ["nonbinary"], labelKey: "profile.lookingFor.nonbinary" },
];

type BirthDateParts = {
  day: string;
  month: string;
  year: string;
};
type BirthDateInputName = keyof BirthDateParts;

type BirthDateValidationResult =
  | { ok: true; value: string }
  | { ok: false; errorKey: string };

function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

function splitBirthDate(value?: string | null): BirthDateParts {
  const normalized = String(value ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  if (!match) {
    return { day: "", month: "", year: "" };
  }
  return {
    day: match[3],
    month: match[2],
    year: match[1],
  };
}

function isLeapYear(year: number) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number) {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function calculateAge(year: number, month: number, day: number, now = new Date()) {
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();
  let age = nowYear - year;
  if (nowMonth < month || (nowMonth === month && nowDay < day)) {
    age -= 1;
  }
  return age;
}

function formatBirthDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function validateBirthDateParts(parts: BirthDateParts): BirthDateValidationResult {
  const dayText = parts.day.trim();
  const monthText = parts.month.trim();
  const yearText = parts.year.trim();
  const hasAnyPart = Boolean(dayText || monthText || yearText);
  if (!hasAnyPart) {
    return { ok: false, errorKey: "editProfile.birthDateRequired" };
  }
  if (!dayText || !monthText || !yearText) {
    return { ok: false, errorKey: "editProfile.birthDateRequired" };
  }
  if (yearText.length !== 4) {
    return { ok: false, errorKey: "editProfile.birthDateYearInvalid" };
  }

  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  if (!Number.isInteger(day) || !Number.isInteger(month) || !Number.isInteger(year)) {
    return { ok: false, errorKey: "editProfile.birthDateInvalid" };
  }
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, errorKey: "editProfile.birthDateInvalid" };
  }

  const today = new Date();
  const birthTime = Date.UTC(year, month - 1, day);
  const todayTime = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate()
  );
  if (birthTime > todayTime) {
    return { ok: false, errorKey: "editProfile.birthDateFuture" };
  }

  const age = calculateAge(year, month, day, today);
  if (age > MAX_PROFILE_AGE) {
    return { ok: false, errorKey: "editProfile.birthDateYearInvalid" };
  }
  if (age < MIN_ADULT_AGE) {
    return { ok: false, errorKey: "editProfile.birthDateUnderage" };
  }

  return {
    ok: true,
    value: `${yearText}-${formatBirthDatePart(month)}-${formatBirthDatePart(day)}`,
  };
}

function firstApiFieldValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function getBirthDateApiErrorKey(error: unknown) {
  if (!(error instanceof ApiError)) return "";
  const fields = error.fields ?? {};
  const birthDateError = firstApiFieldValue(fields.birthDate);
  const ageError = firstApiFieldValue(fields.age);
  if (ageError === "underage") return "editProfile.birthDateUnderage";
  if (birthDateError === "future") return "editProfile.birthDateFuture";
  if (birthDateError === "required") return "editProfile.birthDateRequired";
  if (birthDateError === "unreasonable_age") return "editProfile.birthDateYearInvalid";
  if (birthDateError === "invalid") return "editProfile.birthDateInvalid";
  return "";
}

function sameGenderPreference(
  left: ProfileGender[] | undefined,
  right: ProfileGender[]
) {
  if (!Array.isArray(left)) return false;
  if (left.length !== right.length) return false;
  return right.every((value) => left.includes(value));
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
  const [birthDay, setBirthDay] = React.useState("");
  const [birthMonth, setBirthMonth] = React.useState("");
  const [birthYear, setBirthYear] = React.useState("");
  const [focusedBirthDateInput, setFocusedBirthDateInput] =
    React.useState<BirthDateInputName | null>(null);
  const [keyboardVisible, setKeyboardVisible] = React.useState(false);
  const [birthDateKeyboardActive, setBirthDateKeyboardActive] = React.useState(false);
  const [gender, setGender] = React.useState<ProfileGender | null | undefined>(
    undefined
  );
  const [preferredGenders, setPreferredGenders] = React.useState<
    ProfileGender[] | undefined
  >(undefined);
  const [goal, setGoal] = React.useState<Goal | null>(null);
  const [mood, setMood] = React.useState<Mood | null>(null);
  const [mysteryMode, setMysteryMode] = React.useState(false);
  const scrollRef = React.useRef<ScrollView>(null);
  const displayNameInputRef = React.useRef<TextInput>(null);
  const aboutInputRef = React.useRef<TextInput>(null);
  const interestsInputRef = React.useRef<TextInput>(null);
  const birthDayInputRef = React.useRef<TextInput>(null);
  const birthMonthInputRef = React.useRef<TextInput>(null);
  const birthYearInputRef = React.useRef<TextInput>(null);
  const goalYRef = React.useRef(0);
  const moodYRef = React.useRef(0);
  const interestsYRef = React.useRef(0);
  const birthDateYRef = React.useRef(0);
  const preferencesYRef = React.useRef(0);
  const focusTarget = route.params?.focus;
  const showBirthDateDone = Boolean(focusedBirthDateInput) ||
    (keyboardVisible && birthDateKeyboardActive);

  const dismissKeyboard = React.useCallback(() => {
    setFocusedBirthDateInput(null);
    setKeyboardVisible(false);
    setBirthDateKeyboardActive(false);
    displayNameInputRef.current?.blur();
    aboutInputRef.current?.blur();
    interestsInputRef.current?.blur();
    birthDayInputRef.current?.blur();
    birthMonthInputRef.current?.blur();
    birthYearInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const focusBirthDateInput = React.useCallback((inputName: BirthDateInputName) => {
    setFocusedBirthDateInput(inputName);
    setBirthDateKeyboardActive(true);
  }, []);

  const blurBirthDateInput = React.useCallback((inputName: BirthDateInputName) => {
    setFocusedBirthDateInput((current) => (current === inputName ? null : current));
  }, []);

  const clearBirthDateKeyboardActive = React.useCallback(() => {
    setBirthDateKeyboardActive(false);
  }, []);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardVisible(false);
      setFocusedBirthDateInput(null);
      setBirthDateKeyboardActive(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleBirthDayChange = React.useCallback((value: string) => {
    const nextValue = digitsOnly(value, 2);
    setBirthDay(nextValue);
    if (nextValue.length === 2) {
      birthMonthInputRef.current?.focus();
    }
  }, []);

  const handleBirthMonthChange = React.useCallback((value: string) => {
    const nextValue = digitsOnly(value, 2);
    setBirthMonth(nextValue);
    if (nextValue.length === 2) {
      birthYearInputRef.current?.focus();
    }
  }, []);

  const handleBirthYearChange = React.useCallback((value: string) => {
    const nextValue = digitsOnly(value, 4);
    setBirthYear(nextValue);
    if (nextValue.length === 4) {
      dismissKeyboard();
    }
  }, [dismissKeyboard]);

  const applyProfile = React.useCallback((profile: UserProfile) => {
    setDisplayName(profile.displayName ?? "");
    setAbout(profile.about ?? "");
    setInterests(profile.interests ?? []);
    setInterestDraft("");
    setInterestError("");
    const parts = splitBirthDate(profile.birthDate);
    setBirthDay(parts.day);
    setBirthMonth(parts.month);
    setBirthYear(parts.year);
    setGender(profile.gender);
    setPreferredGenders(profile.preferredGenders);
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
        birthDayInputRef.current?.focus();
        return;
      }

      if (focusTarget === "preferences") {
        scrollRef.current?.scrollTo({
          y: Math.max(preferencesYRef.current - 24, 0),
          animated: true,
        });
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
        if (normalized && !nextInterests.includes(normalized)) {
          nextInterests.push(normalized);
        }
      }
      const birthDateValidation = validateBirthDateParts({
        day: birthDay,
        month: birthMonth,
        year: birthYear,
      });
      if (birthDateValidation.ok === false) {
        Alert.alert(t("common.error"), t(birthDateValidation.errorKey));
        return;
      }
      if (!gender) {
        Alert.alert(t("common.error"), t("editProfile.genderRequired"));
        return;
      }
      if (!Array.isArray(preferredGenders)) {
        Alert.alert(t("common.error"), t("editProfile.preferredGendersRequired"));
        return;
      }

      const profilePatch: Partial<UserProfile> = {
        displayName: nextDisplayName,
        about,
        interests: nextInterests,
        birthDate: birthDateValidation.value,
        gender,
        preferredGenders,
        goal,
        mood,
        mysteryMode,
      };

      const updatedProfile = await updateUserFields(profilePatch);
      applyProfile(updatedProfile);
      dismissKeyboard();
      Alert.alert(t("common.done"), t("editProfile.saveSuccessBody"));
    } catch (error) {
      const birthDateErrorKey = getBirthDateApiErrorKey(error);
      Alert.alert(
        t("common.error"),
        birthDateErrorKey ? t(birthDateErrorKey) : t("editProfile.saveErrorBody")
      );
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
        showMainTabs
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
      showMainTabs
    >
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
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
            onFocus={clearBirthDateKeyboardActive}
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
            onFocus={clearBirthDateKeyboardActive}
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
                onFocus={clearBirthDateKeyboardActive}
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
            <View style={styles.birthDateRow}>
              <TextInput
                ref={birthDayInputRef}
                value={birthDay}
                onChangeText={handleBirthDayChange}
                placeholder={t("editProfile.birthDateDayPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, styles.birthDateInput]}
                keyboardType="number-pad"
                inputMode="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={2}
                returnKeyType="next"
                blurOnSubmit={false}
                selectTextOnFocus
                onFocus={() => focusBirthDateInput("day")}
                onBlur={() => blurBirthDateInput("day")}
                onSubmitEditing={() => birthMonthInputRef.current?.focus()}
              />
              <TextInput
                ref={birthMonthInputRef}
                value={birthMonth}
                onChangeText={handleBirthMonthChange}
                placeholder={t("editProfile.birthDateMonthPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, styles.birthDateInput]}
                keyboardType="number-pad"
                inputMode="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={2}
                returnKeyType="next"
                blurOnSubmit={false}
                selectTextOnFocus
                onFocus={() => focusBirthDateInput("month")}
                onBlur={() => blurBirthDateInput("month")}
                onSubmitEditing={() => birthYearInputRef.current?.focus()}
              />
              <TextInput
                ref={birthYearInputRef}
                value={birthYear}
                onChangeText={handleBirthYearChange}
                placeholder={t("editProfile.birthDateYearPlaceholder")}
                placeholderTextColor={theme.colors.muted}
                style={[styles.input, styles.birthDateYearInput]}
                keyboardType="number-pad"
                inputMode="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={4}
                returnKeyType="done"
                selectTextOnFocus
                onFocus={() => focusBirthDateInput("year")}
                onBlur={() => blurBirthDateInput("year")}
                onSubmitEditing={dismissKeyboard}
              />
            </View>
            {showBirthDateDone ? (
              <TouchableOpacity
                style={styles.keyboardDoneButton}
                onPress={dismissKeyboard}
                activeOpacity={0.86}
              >
                <Text style={styles.keyboardDoneButtonText}>{t("common.done")}</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.helperText}>
              {t("editProfile.birthDateSafetyBody")}
            </Text>
          </View>

          <View
            style={focusTarget === "preferences" ? styles.focusedSection : null}
            onLayout={(event) => {
              preferencesYRef.current = event.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.label}>{t("editProfile.genderLabel")}</Text>
            <View style={styles.optionsWrap}>
              {SELF_GENDER_OPTIONS.map((option) => {
                const active = gender === option.value;
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => setGender(option.value)}
                    style={[
                      styles.optionButton,
                      active ? styles.preferenceOptionButtonActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        active ? styles.optionButtonTextActive : null,
                      ]}
                    >
                      {t(option.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.label}>{t("editProfile.lookingForLabel")}</Text>
            <View style={styles.optionsWrap}>
              {SEARCH_GENDER_OPTIONS.map((option) => {
                const active = sameGenderPreference(preferredGenders, option.value);
                return (
                  <TouchableOpacity
                    key={option.id}
                    onPress={() => setPreferredGenders(option.value)}
                    style={[
                      styles.optionButton,
                      active ? styles.preferenceOptionButtonActive : null,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionButtonText,
                        active ? styles.optionButtonTextActive : null,
                      ]}
                    >
                      {t(option.labelKey)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.helperText}>
              {t("editProfile.preferencesHelper")}
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
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  keyboardAvoider: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: theme.spacing * 8,
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
  birthDateRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  birthDateInput: {
    flex: 1,
    marginBottom: 0,
    textAlign: "center",
  },
  birthDateYearInput: {
    flex: 1.3,
    marginBottom: 0,
    textAlign: "center",
  },
  keyboardDoneButton: {
    alignSelf: "flex-end",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 12,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  keyboardDoneButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
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
  preferenceOptionButtonActive: {
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
