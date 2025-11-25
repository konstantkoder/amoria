import React from "react";
import { View, Text, Image } from "react-native";
import { theme, getMoodTheme } from "../theme/theme";
import type { UserProfile, Mood, Goal } from "../models/User";

type Props = {
  user: Partial<UserProfile> & { age?: number; distanceKm?: number };
  variant?: "feed" | "nearby" | "deck" | string;
  showDistance?: boolean;
  showGoal?: boolean;
  showMood?: boolean;
};

function formatMood(mood?: Mood): string {
  switch (mood) {
    case "happy":
      return "Весёлое настроение";
    case "chill":
      return "Спокойно";
    case "active":
      return "В движении";
    case "serious":
      return "Серьёзный настрой";
    case "party":
      return "Готов(а) тусить";
    default:
      return "Настроение не указано";
  }
}

function formatGoal(goal?: Goal): string {
  switch (goal) {
    case "dating":
      return "Знакомства";
    case "friends":
      return "Дружба";
    case "chat":
      return "Чат";
    case "long_term":
      return "Серьёзные отношения";
    case "short_term":
      return "Лёгкие встречи";
    case "casual":
      return "Casual / флирт";
    case "sex":
      return "Только секс";
    default:
      return "Цель не указана";
  }
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
}: Props) {
  const moodTheme = getMoodTheme(user.mood ?? null);

  const name = user.displayName || "Пользователь";
  const about = user.about || "Пока без описания…";
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

  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.shapes.card,
        padding: theme.spacing,
        width: "100%",
        height: "100%",
        borderWidth: 1,
        borderColor: moodTheme.glow,
      }}
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
                Режим тайны: фото откроются позже
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
              18+
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
            {distance.toFixed(1)} км
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
              {formatGoal(user.goal)}
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
              {formatMood(user.mood)}
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
              Режим тайны
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default UserCard;
