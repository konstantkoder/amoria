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
      background="togetherDream"
      blurRadius={0}
      overlayOpacity={0.26}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Главный формат Together</Text>
          <Text style={styles.heroTitle}>Один общий рисунок на двоих, который сразу запускает знакомство</Text>
          <Text style={styles.heroText}>
            Без каталога и лишних шагов: входишь в короткую сессию, видишь итог и только потом
            решаешь, нужен ли чат.
          </Text>
          <View style={styles.heroFacts}>
            <View style={styles.heroFactChip}>
              <Text style={styles.heroFactText}>draw</Text>
            </View>
            <View style={styles.heroFactChip}>
              <Text style={styles.heroFactText}>2 человека</Text>
            </View>
            <View style={styles.heroFactChip}>
              <Text style={styles.heroFactText}>1 холст</Text>
            </View>
            <View style={styles.heroFactChip}>
              <Text style={styles.heroFactText}>7 минут</Text>
            </View>
          </View>
        </View>

        <View style={styles.ctaBlock}>
          <Pressable
            onPress={() => navigation.navigate("PlayMatch", { activity: "draw" })}
            style={styles.primaryCta}
          >
            <View style={styles.primaryCtaCopy}>
              <Text style={styles.primaryCtaEyebrow}>Сейчас доступно</Text>
              <Text style={styles.primaryCtaTitle}>Начать совместную сессию</Text>
            </View>
            <View style={styles.primaryCtaBadge}>
              <Text style={styles.primaryCtaBadgeText}>draw</Text>
            </View>
          </Pressable>
          <Text style={styles.primaryCtaHint}>
            2 человека, 1 холст, 7 минут. Сначала общий опыт, потом чат, если захотят оба.
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>Мои совместные истории</Text>
            <Text style={styles.historyText}>
              Готовые сессии, итоговые рисунки и короткий путь обратно в уже начатую связь.
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
              Если хочется сначала показать настроение, загляни в Now и вернись во Вместе одним тапом.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Rooms" })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Rooms</Text>
            <Text style={styles.quickText}>
              Если нужен живой групповой контекст, переходи в Rooms без лишних экранов между ними.
            </Text>
          </Pressable>
        </View>

        <View style={styles.soonSection}>
          <Text style={styles.soonTitle}>Форматы дальше</Text>
          <Text style={styles.soonText}>
            Следующие режимы уже зафиксированы по логике. Они пока закрыты, но путь продукта уже понятен.
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
    gap: 14,
  },
  hero: {
    padding: 22,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(10, 14, 28, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  kicker: {
    color: "#FFD7AA",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
    marginBottom: 12,
  },
  heroText: {
    color: "rgba(255,255,255,0.82)",
    fontSize: 15,
    lineHeight: 22,
  },
  heroFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 16,
  },
  heroFactChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  heroFactText: {
    color: "#FFF5EA",
    fontSize: 12,
    fontWeight: "800",
  },
  ctaBlock: {
    gap: 10,
    marginTop: -2,
  },
  primaryCta: {
    minHeight: 70,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 22,
    paddingVertical: 16,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.44,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 14 },
    elevation: 14,
  },
  primaryCtaCopy: {
    flex: 1,
    gap: 4,
  },
  primaryCtaEyebrow: {
    color: "rgba(255,255,255,0.76)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  primaryCtaTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    fontWeight: "800",
  },
  primaryCtaBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  primaryCtaBadgeText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  primaryCtaHint: {
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  historyCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(12, 16, 30, 0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
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
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  historyBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  quickRow: {
    gap: 12,
  },
  quickCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(12, 16, 30, 0.74)",
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
    lineHeight: 19,
  },
  soonSection: {
    gap: 6,
    marginTop: 2,
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
    backgroundColor: "rgba(12, 16, 30, 0.7)",
    borderColor: "rgba(255,255,255,0.08)",
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
