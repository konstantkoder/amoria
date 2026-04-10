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

const ROADMAP_CARDS: ActivityCard[] = [];

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
              Здесь начинается совместная сессия. Сначала вы проходите один общий опыт, потом
              рисунок остаётся в совместной истории, а чат открывается только по взаимному желанию.
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
              Здесь сохраняются итоговые рисунки, статусы открытия и вход обратно в уже начатую связь.
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>Архив</Text>
          </View>
        </Pressable>

        <View style={styles.liveSection}>
          <Text style={styles.liveSectionTitle}>Живые режимы Together</Text>
          <Text style={styles.liveSectionText}>
            Вместе уже работает в четырёх реальных состояниях: свободный общий рисунок, рисунок по
            очереди, общая тема дня и палитра настроения.
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayMatch", { activity: "color_mood" })}
          style={styles.liveCard}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Палитра настроения</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Живой режим</Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>
            Каждый выбирает цвета, а вместе вы собираете общую палитру и мягкую совместную композицию.
          </Text>
          <Text style={styles.cardDetails}>
            Короткая сессия выбора, одна общая палитра и тот же итог с решением об открытии чата.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("PlayMatch", { activity: "daily_prompt" })}
          style={styles.liveCard}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Общая тема дня</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Живой режим</Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>
            Одна тема на двоих, один общий рисунок и один итог.
          </Text>
          <Text style={styles.cardDetails}>
            Сегодняшняя тема откроется после матча, а дальше вы соберете один рисунок на двоих.
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("PlayMatch", { activity: "chain_draw" })}
          style={styles.liveCard}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Рисунок по очереди</Text>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Живой режим</Text>
            </View>
          </View>
          <Text style={styles.cardDescription}>
            Вы рисуете по очереди короткими ходами и собираете один общий рисунок.
          </Text>
          <Text style={styles.cardDetails}>
            10 ходов по 30 секунд, один холст и понятный ритм передачи хода.
          </Text>
        </Pressable>

        <View style={styles.quickRow}>
          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Now" })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Твой вайб</Text>
            <Text style={styles.quickText}>
              Раздел «Сейчас» помогает показать настроение до входа в совместную сессию.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Rooms" })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Комнаты рядом</Text>
            <Text style={styles.quickText}>
              Если нужен живой групповой контекст, загляни в комнаты и вернись сюда одним тапом.
            </Text>
          </Pressable>
        </View>

        {ROADMAP_CARDS.length ? (
          <>
            <View style={styles.soonSection}>
              <Text style={styles.soonTitle}>Что появится дальше</Text>
              <Text style={styles.soonText}>
                Это следующие режимы Together. Они расширят общий опыт, но останутся частью того же пути.
              </Text>
            </View>

            {ROADMAP_CARDS.map((card) => {
              return (
                <Pressable
                  key={card.slug}
                  disabled
                  style={[styles.card, styles.cardSoon]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.cardTitle}>{card.title}</Text>
                    <View style={[styles.badge, styles.badgeSoon]}>
                      <Text style={styles.badgeText}>Скоро</Text>
                    </View>
                  </View>
                  <Text style={styles.cardDescription}>{card.description}</Text>
                  <Text style={styles.cardDetails}>{card.details}</Text>
                </Pressable>
              );
            })}
          </>
        ) : null}
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
  liveSection: {
    gap: 6,
    paddingHorizontal: 2,
  },
  liveSectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  liveSectionText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  liveCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(18, 22, 40, 0.8)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    gap: 10,
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
    marginBottom: 10,
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  badge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255, 122, 60, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.24)",
  },
  badgeSoon: {
    backgroundColor: theme.colors.pillBg,
    borderColor: theme.colors.borderSubtle,
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
