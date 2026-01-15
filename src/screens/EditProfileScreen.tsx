import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  Switch,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import { theme } from "@/theme";
import type { Goal, Mood, UserProfile } from "../models/User";
import { getUserProfile, updateUserFields } from "../services/user";
import { useLocale } from "@/contexts/LocaleContext";

const GOAL_OPTIONS: Goal[] = [
  "dating",
  "friends",
  "chat",
  "long_term",
  "short_term",
  "casual",
  "sex",
];

const MOOD_OPTIONS: Mood[] = [
  "happy",
  "chill",
  "active",
  "serious",
  "party",
];

const GOAL_LABEL_KEYS: Record<Goal, string> = {
  dating: "profile.goal.dating",
  friends: "profile.goal.friends",
  chat: "profile.goal.chat",
  long_term: "profile.goal.long_term",
  short_term: "profile.goal.short_term",
  casual: "profile.goal.casual",
  sex: "profile.goal.sex",
};

const MOOD_LABEL_KEYS: Record<Mood, string> = {
  happy: "profile.mood.happy",
  chill: "profile.mood.chill",
  active: "profile.mood.active",
  serious: "profile.mood.serious",
  party: "profile.mood.party",
};

export default function EditProfileScreen() {
  const { t } = useLocale();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [about, setAbout] = useState("");
  const [interestsText, setInterestsText] = useState("");
  const [goal, setGoal] = useState<Goal>("dating");
  const [mood, setMood] = useState<Mood>("happy");

  const [allowAdultMode, setAllowAdultMode] = useState(false);
  const [mysteryMode, setMysteryMode] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const profile: UserProfile | null = await getUserProfile();
        if (!profile) {
          setLoading(false);
          return;
        }

        setDisplayName(profile.displayName ?? "");
        setAbout(profile.about ?? "");
        setInterestsText((profile.interests ?? []).join(", "));
        setGoal(profile.goal ?? "dating");
        setMood(profile.mood ?? "happy");
        setAllowAdultMode(profile.allowAdultMode ?? false);
        setMysteryMode(profile.mysteryMode ?? false);
      } catch {
        Alert.alert(t("common.error"), t("editProfile.loadErrorBody"));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      const interestsArray = interestsText
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      await updateUserFields({
        displayName,
        about,
        interests: interestsArray,
        goal,
        mood,
        allowAdultMode,
        mysteryMode,
      });

      Alert.alert(t("common.done"), t("editProfile.saveSuccessBody"));
    } catch {
      Alert.alert(t("common.error"), t("editProfile.saveErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
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
            marginTop: 8,
            color: theme.colors.subtext,
          }}
        >
          {t("editProfile.loading")}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        padding: theme.spacing,
        paddingBottom: theme.spacing * 2,
      }}
      keyboardShouldPersistTaps="handled"
    >
      <Text
        style={{
          fontSize: 24,
          fontWeight: "800",
          color: theme.colors.text,
          marginBottom: 16,
        }}
      >
        {t("editProfile.title")}
      </Text>

      {/* Имя */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {t("editProfile.nameLabel")}
      </Text>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        placeholder={t("editProfile.namePlaceholder")}
        placeholderTextColor={theme.colors.muted}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
          marginBottom: 12,
        }}
      />

      {/* О себе */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {t("editProfile.aboutLabel")}
      </Text>
      <TextInput
        value={about}
        onChangeText={setAbout}
        multiline
        placeholder={t("editProfile.aboutPlaceholder")}
        placeholderTextColor={theme.colors.muted}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
          minHeight: 80,
          textAlignVertical: "top",
          marginBottom: 12,
        }}
      />

      {/* Интересы */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {t("editProfile.interestsLabel")}
      </Text>
      <TextInput
        value={interestsText}
        onChangeText={setInterestsText}
        placeholder={t("editProfile.interestsPlaceholder")}
        placeholderTextColor={theme.colors.muted}
        style={{
          backgroundColor: theme.colors.card,
          borderRadius: theme.radius,
          paddingHorizontal: 14,
          paddingVertical: 10,
          color: theme.colors.text,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
          marginBottom: 16,
        }}
      />

      {/* Цель знакомства */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {t("editProfile.goalLabel")}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {GOAL_OPTIONS.map((g) => {
          const active = goal === g;
          return (
            <TouchableOpacity
              key={g}
              onPress={() => setGoal(g)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: theme.shapes.pill,
                marginRight: 8,
                marginBottom: 8,
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
                {t(GOAL_LABEL_KEYS[g])}
            </Text>
          </TouchableOpacity>
        );
      })}
      </View>

      {/* Настроение */}
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {t("editProfile.moodLabel")}
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        {MOOD_OPTIONS.map((m) => {
          const active = mood === m;
          return (
            <TouchableOpacity
              key={m}
              onPress={() => setMood(m)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: theme.shapes.pill,
                marginRight: 8,
                marginBottom: 8,
                backgroundColor: active
                  ? theme.colors.accent
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
                {t(MOOD_LABEL_KEYS[m])}
            </Text>
          </TouchableOpacity>
        );
      })}
      </View>

      {/* Переключатели 18+ и Mystery */}
      <View
        style={{
          marginTop: 8,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: theme.colors.borderSubtle,
        }}
      >
        {/* 18+ / casual */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 14,
                fontWeight: "600",
                marginBottom: 2,
              }}
            >
              {t("editProfile.adultModeTitle")}
            </Text>
            <Text
              style={{
                color: theme.colors.subtext,
                fontSize: 12,
              }}
            >
              {t("editProfile.adultModeDescription")}
            </Text>
          </View>
          <Switch
            value={allowAdultMode}
            onValueChange={setAllowAdultMode}
          />
        </View>

        {/* Mystery-режим */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 14,
                fontWeight: "600",
                marginBottom: 2,
              }}
            >
              {t("profile.mysteryBadge")}
            </Text>
            <Text
              style={{
                color: theme.colors.subtext,
                fontSize: 12,
              }}
            >
              {t("editProfile.mysteryDescription")}
            </Text>
          </View>
          <Switch
            value={mysteryMode}
            onValueChange={setMysteryMode}
          />
        </View>
      </View>

      {/* Кнопка сохранения */}
      <TouchableOpacity
        onPress={handleSave}
        disabled={saving}
        style={{
          marginTop: 24,
          backgroundColor: theme.colors.primary,
          borderRadius: theme.radius,
          paddingVertical: 12,
          alignItems: "center",
          justifyContent: "center",
          opacity: saving ? 0.7 : 1,
        }}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 16,
              fontWeight: "700",
            }}
          >
            {t("common.save")}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}
