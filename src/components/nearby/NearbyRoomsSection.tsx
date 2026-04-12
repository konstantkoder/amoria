import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import {
  type NearbyTabNavigationProp,
  buildRoomsTarget,
} from "@/navigation/appRoutes";
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
        <View style={styles.featureWrap}>
          {features.map((item) => (
            <View key={item} style={styles.featureChip}>
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
          onPress={() => navigation.navigate(...buildRoomsTarget())}
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
    gap: 12,
  },
  overviewCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(11, 16, 30, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  overviewTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.20)",
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  featureWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  featureChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  featureText: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  ctaCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(18, 20, 36, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  ctaCopy: {
    gap: 6,
  },
  ctaTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  ctaBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  linkCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  linkCardText: {
    flex: 1,
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
});
