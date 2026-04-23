import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { getRuntimeLocale } from "@/i18n/translations";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import { openNearbySection, openRooms } from "@/navigation/nearbyNavigation";
import { getPlayLobbyModeCardCopy } from "@/services/playSessions";
import { theme } from "@/theme";

export default function PlayLobbyScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayMatch">>();
  const { t } = useLocale();
  const releaseText = React.useCallback(
    (en: string, ru: string) => (getRuntimeLocale() === "ru" ? ru : en),
    []
  );
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const colorMoodCopy = getPlayLobbyModeCardCopy("color_mood");

  return (
    <ScreenShell title={t("tabs.together")} background="togetherMain">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>
              {releaseText("Main release path", "Главный путь релиза")}
            </Text>
            <Text style={styles.heroTitle}>
              {releaseText(
                "Shared drawing is the core of Together",
                "Общий рисунок стал ядром «Вместе»"
              )}
            </Text>
            <Text style={styles.heroText}>
              {releaseText(
                "Start with one shared canvas, reach one shared result, and move into chat only if the opening turns out mutual.",
                "Начни с одного общего холста, приди к одному общему итогу и переходи в личный разговор только если открытие оказалось взаимным."
              )}
            </Text>
            <View style={styles.heroLoop}>
              {[
                releaseText("Shared drawing", "Общий рисунок"),
                releaseText("Shared result", "Общий итог"),
                releaseText("Mutual opening", "Взаимное открытие"),
                releaseText("Private chat", "Личный чат"),
              ].map((item) => (
                <View key={item} style={styles.heroLoopChip}>
                  <Text style={styles.heroLoopChipText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.heroBottom}>
            <Pressable
              onPress={() => navigation.navigate("PlayMatch", { activity: "draw" })}
              style={styles.primaryCta}
            >
              <Text style={styles.primaryCtaTitle}>
                {releaseText("Start shared drawing", "Начать общий рисунок")}
              </Text>
            </Pressable>
            <Text style={styles.primaryCtaHint}>
              {releaseText(
                "Seven minutes on one canvas, then one result and one honest decision about chat.",
                "7 минут на одном холсте, потом один итог и одно честное решение об открытии чата."
              )}
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>
              {releaseText("Shared stories", "Совместные истории")}
            </Text>
            <Text style={styles.historyText}>
              {releaseText(
                "Return to saved drawings, shared palettes, and the connection that already opened from them.",
                "Возвращайся к сохранённым рисункам, общим палитрам и связи, которая уже выросла из них."
              )}
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>
              {releaseText("Stories", "Истории")}
            </Text>
          </View>
        </Pressable>

        <View style={styles.secondarySection}>
          <Text style={styles.secondarySectionTitle}>
            {releaseText("One softer variation", "Одна мягкая вариация")}
          </Text>
          <Text style={styles.secondarySectionText}>
            {releaseText(
              "If drawing feels too direct, start through color instead. It is shorter, softer, and still leads to one honest decision about chat.",
              "Если рисунок кажется слишком прямым входом, начни через цвет. Это короче, мягче и всё равно ведёт к одному честному решению об открытии чата."
            )}
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayMatch", { activity: "color_mood" })}
          style={styles.secondaryCard}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{colorMoodCopy.title}</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                {releaseText("Variation", "Вариация")}
              </Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>{colorMoodCopy.description}</Text>
          <Text style={styles.cardDetails}>{colorMoodCopy.details}</Text>
        </Pressable>

        <View style={styles.supportingSection}>
          <Text style={styles.supportingSectionTitle}>
            {tt("together.lobby.supportingTitle", "Другие живые пути рядом")}
          </Text>
          <Text style={styles.supportingSectionText}>
            {tt(
              "together.lobby.supportingBody",
              "Nearby помогает с сигналом на ближайший момент. Rooms открывает живое общее пространство. «Вместе» остаётся местом для химии один на один и следующего шага в связь."
            )}
          </Text>
        </View>

        <View style={styles.quickRow}>
          <Pressable
            onPress={() => openNearbySection(navigation, "now")}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>
              {tt("together.lobby.quickNearbyTitle", "Nearby")}
            </Text>
            <Text style={styles.quickText}>
              {tt(
                "together.lobby.quickNearbyBody",
                "Посмотри пульс рядом, оставь статус на ближайший момент или открой объявления."
              )}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => openRooms(navigation, "together")}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>
              {tt("together.lobby.quickRoomsTitle", "Rooms")}
            </Text>
            <Text style={styles.quickText}>
              {tt(
                "together.lobby.quickRoomsBody",
                "Если нужен живой групповой сценарий рядом, открой Rooms и вернись сюда, когда захочется пути один на один."
              )}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  hero: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 20,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(10, 13, 26, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  heroTop: {
    maxWidth: 340,
    gap: 10,
  },
  kicker: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "800",
  },
  heroText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 15,
    lineHeight: 21,
  },
  heroBottom: {
    gap: 8,
  },
  heroLoop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroLoopChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroLoopChipText: {
    color: "#FFF5EA",
    fontSize: 11,
    fontWeight: "800",
  },
  primaryCta: {
    alignSelf: "center",
    minHeight: 56,
    width: "100%",
    maxWidth: 390,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 24,
    paddingVertical: 15,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.34,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  primaryCtaTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  primaryCtaHint: {
    color: "rgba(255,245,234,0.92)",
    fontSize: 12,
    lineHeight: 17,
    textAlign: "center",
  },
  historyCard: {
    borderRadius: theme.shapes.card,
    padding: 17,
    backgroundColor: "rgba(13, 17, 31, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  historyTextWrap: {
    flex: 1,
    gap: 6,
  },
  historyTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  historyText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  historyBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  historyBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  secondarySection: {
    gap: 4,
    paddingHorizontal: 2,
  },
  secondarySectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  secondarySectionText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  supportingSection: {
    gap: 4,
    paddingHorizontal: 2,
    paddingTop: 2,
  },
  supportingSectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  supportingSectionText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  secondaryCard: {
    borderRadius: theme.shapes.card,
    padding: 17,
    backgroundColor: "rgba(16, 20, 38, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  badge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 122, 60, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.24)",
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  cardDescription: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  cardDetails: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  quickRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.shapes.card,
    padding: 15,
    backgroundColor: "rgba(12, 16, 30, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 7,
  },
  quickTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  quickText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
});
