import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import { getPlayLobbyModeCardCopy } from "@/services/playSessions";
import { theme } from "@/theme";

export default function PlayLobbyScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayMatch">>();
  const { t } = useLocale();
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
              {tt("together.lobby.drawKicker", "Главный сценарий")}
            </Text>
            <Text style={styles.heroTitle}>
              {tt("together.lobby.drawHeroTitle", "Создай общий рисунок с другим человеком")}
            </Text>
            <Text style={styles.heroText}>
              {tt(
                "together.lobby.drawHeroBody",
                "Вы получите один короткий творческий вызов, будете рисовать на одном холсте и сохраните общий след, который потом может стать поводом для чата."
              )}
            </Text>
            <Text style={styles.heroBridgeText}>
              {tt(
                "together.lobby.coreLoopPlain",
                "Сначала создайте общий момент, потом спокойно решите, хотите ли продолжить в личном разговоре."
              )}
            </Text>
            <View style={styles.heroLoop}>
              {[
                tt("together.lobby.drawStepChallenge", "Творческий вызов"),
                tt("together.lobby.drawStepCanvas", "Общий холст"),
                tt("together.lobby.drawStepResult", "Совместный результат"),
                tt("together.lobby.drawStepChat", "Чат по взаимности"),
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
                {tt("together.lobby.startDrawChallenge", "Начать общий рисунок")}
              </Text>
            </Pressable>
            <Text style={styles.primaryCtaHint}>
              {tt(
                "together.lobby.startDrawHint",
                "7 минут на общий ответ, затем итог, история и честное решение про личный разговор."
              )}
            </Text>
          </View>
        </View>

        <View style={styles.secondarySection}>
          <Text style={styles.secondarySectionTitle}>
            {tt("together.lobby.colorMoodSectionTitle", "Мягкий второй сценарий")}
          </Text>
          <Text style={styles.secondarySectionText}>
            {tt(
              "together.lobby.colorMoodSectionBody",
              "Если рисовать сейчас слишком прямо, начни через цвет. Палитра настроения короче и мягче, но всё равно создаёт общий результат."
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
                {tt("together.lobby.colorMoodBadge", "Второй сценарий")}
              </Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>{colorMoodCopy.description}</Text>
          <Text style={styles.cardDetails}>{colorMoodCopy.details}</Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>
              {tt("together.lobby.historyTitle", "Совместные истории")}
            </Text>
            <Text style={styles.historyText}>
              {tt(
                "together.lobby.historyBodyCore",
                "Возвращайся к сохранённым рисункам, творческим вызовам, общим палитрам и разговорам, которые выросли из них."
              )}
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>
              {tt("together.lobby.historyBadge", "Истории")}
            </Text>
          </View>
        </Pressable>
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
  heroBridgeText: {
    color: "#FFF5EA",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
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
});
