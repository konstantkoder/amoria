import React from "react";
import { View, Text, Image, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { theme, getMoodTheme } from "@/theme";
import { DemoUser } from "@/services/demoUsers";
import { getIcebreakerForUser } from "@/services/icebreakers";
import { useLocale } from "@/contexts/LocaleContext";
import type { Mood, Goal } from "../models/User";

type Props = {
  user: DemoUser & { age?: number; distanceKm?: number };
  variant?: "feed" | "nearby" | "deck" | string;
  showDistance?: boolean;
  showGoal?: boolean;
  showMood?: boolean;
  onPress?: (user: DemoUser) => void;
  onPressVoiceIntro?: (user: DemoUser) => void;
};

const MOOD_LABEL_KEYS: Record<Mood, string> = {
  happy: "profile.mood.happy",
  chill: "profile.mood.chill",
  active: "profile.mood.active",
  serious: "profile.mood.serious",
  party: "profile.mood.party",
};

const GOAL_LABEL_KEYS: Record<Goal, string> = {
  dating: "profile.goal.dating",
  friends: "profile.goal.friends",
  chat: "profile.goal.chat",
  long_term: "profile.goal.long_term",
  short_term: "profile.goal.short_term",
  casual: "profile.goal.casual",
  sex: "profile.goal.sex",
};

function moodLabelKey(mood?: Mood): string {
  return (mood && MOOD_LABEL_KEYS[mood]) || "profile.mood.unknown";
}

function goalLabelKey(goal?: Goal): string {
  return (goal && GOAL_LABEL_KEYS[goal]) || "profile.goal.unknown";
}

function isAdultGoal(goal?: Goal | null): boolean {
  if (!goal) return false;
  return goal === "casual" || goal === "sex" || goal === "short_term";
}

export function UserCard({
  user,
  showDistance = false,
  showGoal = true,
  showMood = true,
  onPress,
  onPressVoiceIntro,
}: Props) {
  const { t } = useLocale();
  const moodTheme = getMoodTheme(user.mood ?? null);
  const icebreaker = getIcebreakerForUser({
    goal: user.goal,
    mood: user.mood,
    interests: user.interests ?? [],
    displayName: user.displayName ?? "",
  });
  const icebreakerText = icebreaker
    ? t(icebreaker.key, icebreaker.params)
    : null;

  const name = user.displayName || t("common.user");
  const about = user.about || t("profile.noDescription");
  const interests = Array.isArray(user.interests) ? user.interests : [];

  const isMystery = !!user.mysteryMode;
  const distance = showDistance ? user.distanceKm : undefined;
  const hasPhotos =
    Array.isArray(user.photos) &&
    user.photos.length > 0 &&
    typeof user.photos[0] === "string";

  const showPhoto = hasPhotos && !isMystery;
  const photo = showPhoto ? (user.photos![0] as string) : undefined;
  const initial = name[0]?.toUpperCase?.() ?? "U";
  const isAdult = isAdultGoal(user.goal ?? null);
  const hasVoiceIntro = !!(user.hasVoiceIntro || user.voiceIntroDurationSec);
  const introSeconds = Math.max(
    1,
    Math.round(user.voiceIntroDurationSec ?? 8)
  );
  const introDuration =
    introSeconds >= 60
      ? `${Math.floor(introSeconds / 60)}:${(introSeconds % 60)
          .toString()
          .padStart(2, "0")}`
      : `0:${introSeconds.toString().padStart(2, "0")}`;
  const adultSuffix = isAdult ? ` ${t("common.adultShort")}` : "";
  const voiceIntroLabel = t("profile.voiceIntroLabel", {
    duration: introDuration,
    adultSuffix,
  });
  const Container =
    (onPress ? TouchableOpacity : View) as React.ComponentType<any>;

  return (
    <Container
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.shapes.card,
        padding: theme.spacing,
        width: "100%",
        borderWidth: 1,
        borderColor: moodTheme.glow,
      }}
      activeOpacity={onPress ? 0.9 : undefined}
      onPress={onPress ? () => onPress(user) : undefined}
    >
      {/* Фото / превью */}
      <View
        style={{
          flex: 1,
          borderRadius: theme.shapes.cardInner,
          backgroundColor: "#111827",
          marginBottom: 12,
          overflow: "hidden",
        }}
      >
        {photo ? (
          <Image
            source={{ uri: photo }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            <Text
              style={{
                fontSize: 40,
                fontWeight: "800",
                color: "#F9FAFF",
                opacity: 0.9,
                marginBottom: isMystery ? 4 : 0,
              }}
            >
              {initial}
            </Text>
            {isMystery && (
              <Text
                style={{
                  color: theme.colors.subtext,
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {t("profile.mysteryHint")}
              </Text>
            )}
          </View>
        )}

        {/* Бэйдж 18+ поверх фото */}
        {isAdult && (
          <View
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: theme.shapes.pill,
              backgroundColor: "rgba(248, 113, 113, 0.9)",
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontWeight: "800",
                fontSize: 11,
              }}
            >
              {t("common.adultShort")}
            </Text>
          </View>
        )}
      </View>

      {/* Имя + about */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: theme.colors.text,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {name}
        </Text>

        {distance != null && (
          <Text
            style={{
              color: theme.colors.subtext,
              fontSize: 12,
              marginLeft: 8,
            }}
          >
            {distance.toFixed(1)} {t("units.km")}
          </Text>
        )}
      </View>

      <Text
        numberOfLines={2}
        style={{
          marginTop: 4,
          marginBottom: 6,
          color: theme.colors.subtext,
          fontSize: 14,
        }}
      >
        {about}
      </Text>

      {/* Интересы */}
      {interests.length > 0 && (
        <Text
          numberOfLines={2}
          style={{
            color: theme.colors.muted,
            fontSize: 13,
          }}
        >
          {interests.join(" • ")}
        </Text>
      )}

      {icebreakerText && (
        <View
          style={{
            marginTop: 8,
            padding: 8,
            borderRadius: 12,
            backgroundColor: "rgba(148, 163, 184, 0.15)",
          }}
        >
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.muted,
              marginBottom: 2,
            }}
          >
            💬 {t("icebreaker.title")}
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: theme.colors.text,
            }}
          >
            {icebreakerText}
          </Text>
        </View>
      )}

      {hasVoiceIntro ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => onPressVoiceIntro?.(user)}
          style={{ marginTop: 8 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: "rgba(15, 23, 42, 0.7)",
            }}
          >
            <Ionicons
              name="mic-outline"
              size={14}
              color={theme.colors.subtext}
              style={{ marginRight: 6 }}
            />
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.subtext,
              }}
            >
              {voiceIntroLabel}
            </Text>
          </View>
        </TouchableOpacity>
      ) : null}

      {/* Бэйджи цели, настроения и тайны */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          marginTop: 10,
        }}
      >
        {showGoal && user.goal && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: theme.shapes.pill,
              marginRight: 8,
              marginBottom: 6,
              backgroundColor: theme.colors.pillBg,
            }}
          >
            <Text
              style={{
                color: theme.colors.pillText,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {t(goalLabelKey(user.goal))}
            </Text>
          </View>
        )}

        {showMood && user.mood && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: theme.shapes.pill,
              marginRight: 8,
              marginBottom: 6,
              backgroundColor: moodTheme.badgeBg,
            }}
          >
            <Text
              style={{
                color: moodTheme.badgeText,
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {t(moodLabelKey(user.mood))}
            </Text>
          </View>
        )}

        {isMystery && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: theme.shapes.pill,
              marginRight: 8,
              marginBottom: 6,
              backgroundColor: "rgba(59, 130, 246, 0.25)",
            }}
          >
            <Text
              style={{
                color: "#E0F2FE",
                fontSize: 12,
                fontWeight: "600",
              }}
            >
              {t("profile.mysteryBadge")}
            </Text>
          </View>
        )}
      </View>
    </Container>
  );
}

export default UserCard;
