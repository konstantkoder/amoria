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
import { theme } from "@/theme";

type ActivityCard = {
  slug: string;
  title: string;
  description: string;
  details: string;
};

const SOON_CARDS: ActivityCard[] = [
  {
    slug: "chain_draw",
    title: "Chain Draw",
    description: "По очереди по 1 штриху. 30 секунд на ход, чтобы рисунок рос вместе.",
    details: "10 ходов, один общий результат.",
  },
  {
    slug: "daily_prompt",
    title: "Daily Prompt",
    description: "Одна тема дня: город, мечта, путешествие или символ. Каждый рисует свою часть.",
    details: "Одна общая тема, два взгляда, один итог.",
  },
  {
    slug: "color_mood",
    title: "Color Mood",
    description: "Каждый выбирает 3 цвета, а вместе вы собираете общую палитру и арт из настроения.",
    details: "Мягкий цветовой формат без лишних шагов.",
  },
];

export default function PlayLobbyScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLocale();

  return (
    <ScreenShell
      title={t("tabs.together")}
      background="togetherMain"
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Text style={styles.kicker}>Главный романтический вход</Text>
            <Text style={styles.heroTitle}>Один общий рисунок на двоих</Text>
            <Text style={styles.heroText}>
              Короткая совместная сессия, где знакомство начинается не с анкеты, а с одного
              общего холста.
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
              7 минут • один общий холст • чат по взаимному желанию
            </Text>
          </View>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>Мои совместные истории</Text>
            <Text style={styles.historyText}>
              Готовые сессии, итоговые рисунки и быстрый возврат к уже начатой связи.
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>История</Text>
          </View>
        </Pressable>

        <View style={styles.quickRow}>
          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Now" })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Now</Text>
            <Text style={styles.quickText}>
              Покажи настроение сейчас и вернись во Вместе, когда захочешь общий вход.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Rooms" })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Rooms</Text>
            <Text style={styles.quickText}>
              Если нужен живой контекст, перейди в Rooms и снова вернись к совместной сессии.
            </Text>
          </Pressable>
        </View>

        <View style={styles.soonSection}>
          <Text style={styles.soonTitle}>Что появится дальше</Text>
          <Text style={styles.soonText}>
            Следующие режимы уже зафиксированы и продолжат Together как одно цельное ядро.
          </Text>
        </View>

        {SOON_CARDS.map((card) => {
          return (
            <Pressable
              key={card.slug}
              disabled
              style={[styles.card, styles.cardSoon]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleWrap}>
                  <Text style={styles.cardTitle}>{card.title}</Text>
                  <Text style={styles.cardSlug}>{card.slug}</Text>
                </View>
                <View style={[styles.badge, styles.badgeSoon]}>
                  <Text style={styles.badgeText}>Скоро</Text>
                </View>
              </View>
              <Text style={styles.cardDescription}>{card.description}</Text>
              <Text style={styles.cardDetails}>{card.details}</Text>
            </Pressable>
          );
        })}
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
    minHeight: 338,
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 22,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(9, 11, 24, 0.58)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroTop: {
    maxWidth: 320,
    gap: 12,
  },
  kicker: {
    color: "#FFE0B8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
  },
  heroText: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 15,
    lineHeight: 21,
  },
  heroBottom: {
    gap: 10,
  },
  primaryCta: {
    alignSelf: "center",
    minHeight: 60,
    width: "100%",
    maxWidth: 390,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 30,
    paddingVertical: 16,
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
    fontSize: 18,
    fontWeight: "800",
  },
  primaryCtaHint: {
    color: "rgba(255,245,234,0.92)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  historyCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
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
    gap: 8,
  },
  historyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  historyText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  historyBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  historyBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  quickRow: {
    flexDirection: "row",
    gap: 12,
  },
  quickCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(12, 16, 30, 0.68)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 8,
  },
  quickTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  quickText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  soonSection: {
    gap: 6,
  },
  soonTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  soonText: {
    color: "rgba(255,255,255,0.78)",
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    borderRadius: theme.shapes.card,
    padding: 18,
    borderWidth: 1,
  },
  cardSoon: {
    backgroundColor: "rgba(12, 16, 30, 0.68)",
    borderColor: "rgba(255,255,255,0.09)",
    opacity: 0.9,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  cardTitleWrap: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  cardSlug: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
  },
  badge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeSoon: {
    backgroundColor: theme.colors.pillBg,
  },
  badgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  cardDescription: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  cardDetails: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
    marginTop: 10,
  },
});
