import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

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
  const navigation = useNavigation<any>();
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
      <View style={styles.heroCard}>
        <View style={styles.heroIcon}>
          <Ionicons name="chatbox-ellipses-outline" size={22} color={theme.colors.accent} />
        </View>
        <Text style={styles.heroTitle}>{title}</Text>
        <Text style={styles.heroBody}>{body}</Text>
      </View>

      <View style={styles.featuresCard}>
        {features.map((item) => (
          <View key={item} style={styles.featureRow}>
            <View style={styles.featureDot} />
            <Text style={styles.featureText}>{item}</Text>
          </View>
        ))}
      </View>

      <View style={styles.ctaCard}>
        <Text style={styles.ctaTitle}>
          {copyOrFallback(t, "nearby.rooms.ctaTitle", "Нужен общий живой контекст?")}
        </Text>
        <Text style={styles.ctaBody}>
          {copyOrFallback(
            t,
            "nearby.rooms.ctaBody",
            "Здесь внутри Nearby это только входной слой. Полный выбор мест, карта и чат остаются в отдельном экране комнат."
          )}
        </Text>
        <Pressable onPress={() => navigation.navigate("Rooms")} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>{openLabel}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 6,
    paddingBottom: 24,
    gap: 14,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(11, 16, 30, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.20)",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  featuresCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(16, 20, 38, 0.82)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  featureDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: theme.colors.accent,
  },
  featureText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  ctaCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(20, 18, 35, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  ctaTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  ctaBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
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
});
