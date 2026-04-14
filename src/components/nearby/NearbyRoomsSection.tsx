import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { type NearbyTabNavigationProp } from "@/navigation/appRoutes";
import { openRooms } from "@/navigation/nearbyNavigation";
import { theme } from "@/theme";
import { useLocale } from "@/contexts/LocaleContext";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function NearbyRoomsSection() {
  const navigation = useNavigation<NearbyTabNavigationProp>();
  const { t } = useLocale();

  const title = copyOrFallback(t, "nearby.rooms.title", "Комнаты рядом");
  const body = copyOrFallback(
    t,
    "nearby.rooms.body",
    "Живой групповой geo-chat для людей поблизости. Здесь важны место, момент и быстрый вход в общий разговор."
  );
  const openLabel = copyOrFallback(t, "nearby.rooms.open", "Открыть комнаты");

  const features = [
    copyOrFallback(t, "nearby.rooms.featureOne", "Групповой чат, привязанный к месту"),
    copyOrFallback(t, "nearby.rooms.featureTwo", "Люди и контекст рядом прямо сейчас"),
    copyOrFallback(t, "nearby.rooms.featureThree", "Полный live experience открывается отдельным экраном"),
  ];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.overviewCard}>
        <View style={styles.overviewTop}>
          <View style={styles.heroIcon}>
            <Ionicons name="chatbox-ellipses-outline" size={20} color={theme.colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.heroKicker}>
              {copyOrFallback(t, "nearby.segment.rooms", "Комнаты")}
            </Text>
            <Text style={styles.heroTitle}>{title}</Text>
          </View>
        </View>
        <Text style={styles.heroBody}>{body}</Text>
        <View style={styles.featureList}>
          {features.map((item) => (
            <View key={item} style={styles.featureRow}>
              <View style={styles.featureDot} />
              <Text style={styles.featureText}>{item}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.ctaCard}>
        <View style={styles.ctaCopy}>
          <Text style={styles.ctaTitle}>
            {copyOrFallback(t, "nearby.rooms.ctaTitle", "Нужен общий живой контекст?")}
          </Text>
          <Text style={styles.ctaBody}>
            {copyOrFallback(
              t,
              "nearby.rooms.ctaBody",
              "Внутри Nearby это только вход. Полный выбор места и live chat остаются в Rooms."
            )}
          </Text>
        </View>
        <Pressable
          onPress={() => openRooms(navigation, "nearby")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>{openLabel}</Text>
        </Pressable>
      </View>

      <View style={styles.linkCard}>
        <Ionicons name="arrow-forward-outline" size={16} color={theme.colors.subtext} />
        <Text style={styles.linkCardText}>
          {copyOrFallback(
            t,
            "nearby.rooms.linkBody",
            "Откроется полноценный экран комнат, а назад ты вернёшься в Nearby."
          )}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 6,
    paddingBottom: 24,
    gap: 10,
  },
  overviewCard: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(11, 16, 30, 0.82)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  overviewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  heroIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.20)",
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  featureList: {
    gap: 8,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  featureDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
    backgroundColor: theme.colors.accent,
  },
  featureText: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
    flex: 1,
  },
  ctaCard: {
    borderRadius: theme.shapes.card,
    padding: 15,
    backgroundColor: "rgba(18, 20, 36, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  ctaCopy: {
    gap: 5,
  },
  ctaTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  ctaBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
  primaryButton: {
    alignSelf: "stretch",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: 4,
  },
  linkCardText: {
    flex: 1,
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
});
