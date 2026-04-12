import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getPlayLobbyModeCardCopy,
  type PlayActivity,
} from "@/services/playSessions";
import { theme } from "@/theme";

const LIVE_MODE_ORDER: PlayActivity[] = ["daily_prompt", "chain_draw", "color_mood"];

export default function PlayLobbyScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLocale();

  return (
    <ScreenShell title={t("tabs.together")} background="togetherMain">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>Главный вход</Text>
            <Text style={styles.heroTitle}>Together запускает знакомство через общий опыт</Text>
            <Text style={styles.heroText}>
              Один тап запускает свободную совместную сессию. Если нужен более явный сценарий,
              режим можно выбрать сразу ниже.
            </Text>
          </View>

          <View style={styles.heroBottom}>
            <Pressable
              onPress={() => navigation.navigate("PlayMatch", { activity: "draw" })}
              style={styles.primaryCta}
            >
              <Text style={styles.primaryCtaTitle}>Начать совместную сессию</Text>
            </Pressable>
            <Text style={styles.primaryCtaHint}>
              Свободный старт, reveal и переход в чат только по взаимному желанию.
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>Совместные истории</Text>
            <Text style={styles.historyText}>
              Итоги, replay и быстрый вход обратно в уже открытую связь.
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>Архив</Text>
          </View>
        </Pressable>

        <View style={styles.liveSection}>
          <Text style={styles.liveSectionTitle}>Другие режимы</Text>
          <Text style={styles.liveSectionText}>
            Если нужен более явный сценарий, выбери его сразу.
          </Text>
        </View>

        {LIVE_MODE_ORDER.map((activity) => {
          const copy = getPlayLobbyModeCardCopy(activity);

          return (
            <Pressable
              key={activity}
              onPress={() => navigation.navigate("PlayMatch", { activity })}
              style={styles.liveCard}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{copy.title}</Text>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>Живой режим</Text>
                </View>
              </View>
              <Text style={styles.cardDescription}>{copy.description}</Text>
              <Text numberOfLines={2} style={styles.cardDetails}>
                {copy.details}
              </Text>
            </Pressable>
          );
        })}

        <View style={styles.quickRow}>
          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Nearby", params: { section: "now" } })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Рядом</Text>
            <Text style={styles.quickText}>
              Локальный слой рядом: статусы, объявления и вход в комнаты.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Rooms")}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Комнаты</Text>
            <Text style={styles.quickText}>
              Если нужен живой групповой geo-chat, открой Rooms напрямую и вернись сюда назад.
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
    paddingBottom: 36,
    gap: 14,
  },
  hero: {
    gap: 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(9, 11, 24, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
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
    fontSize: 14,
    lineHeight: 20,
  },
  heroBottom: {
    gap: 8,
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
    padding: 16,
    backgroundColor: "rgba(14, 16, 30, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
  liveSection: {
    gap: 4,
    paddingHorizontal: 2,
  },
  liveSectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  liveSectionText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  liveCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(18, 22, 40, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    gap: 8,
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
    gap: 10,
  },
  quickCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(12, 16, 30, 0.68)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 6,
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
