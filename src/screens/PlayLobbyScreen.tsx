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
  title: string;
  description: string;
};

const SOON_CARDS: ActivityCard[] = [
  {
    title: "Построить мир",
    description: "Совместная мини-сцена, где каждый достраивает идею второго.",
  },
  {
    title: "Составить плейлист",
    description: "Быстрый обмен треками и общий вайб из нескольких выборов.",
  },
  {
    title: "Пройти мини-квест",
    description: "Небольшое кооперативное испытание с мягкими подсказками.",
  },
];

export default function PlayLobbyScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLocale();

  return (
    <ScreenShell
      title={t("tabs.together")}
      background="hearts"
      blurRadius={8}
      overlayOpacity={0.28}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.kicker}>Совместный опыт</Text>
          <Text style={styles.heroTitle}>Начни совместную сессию и посмотри, куда она приведет</Text>
          <Text style={styles.heroText}>
            Вместе начинается общий опыт: сначала сессия, потом итог, история и чат, если вы
            оба захотите продолжить.
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayMatch", { activity: "draw" })}
          style={styles.primaryEntryCard}
        >
          <View style={styles.primaryEntryText}>
            <Text style={styles.primaryEntryTitle}>Начать совместную сессию</Text>
            <Text style={styles.primaryEntryBody}>
              Общий холст на двоих. Семь минут, один рисунок и один ритм.
            </Text>
          </View>
          <View style={styles.primaryEntryBadge}>
            <Text style={styles.primaryEntryBadgeText}>Сейчас</Text>
          </View>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>Мои совместные истории</Text>
            <Text style={styles.historyText}>
              Здесь остаются завершенные совместные сессии, replay и путь обратно в разговор.
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>Открыть</Text>
          </View>
        </Pressable>

        <View style={styles.quickRow}>
          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Now" })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Твой вайб сейчас</Text>
            <Text style={styles.quickText}>
              Покажи свой текущий настрой и при желании вернись во Вместе позже.
            </Text>
          </Pressable>

          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Rooms" })}
            style={styles.quickCard}
          >
            <Text style={styles.quickTitle}>Комнаты рядом</Text>
            <Text style={styles.quickText}>
              Если хочется живого группового контекста, переходи в Rooms без разрыва маршрута.
            </Text>
          </Pressable>
        </View>

        <View style={styles.soonSection}>
          <Text style={styles.soonTitle}>Что появится дальше</Text>
          <Text style={styles.soonText}>
            Следующие совместные форматы уже на подходе и позже расширят путь через Вместе.
          </Text>
        </View>

        {SOON_CARDS.map((card, index) => {
          return (
            <Pressable
              key={`${card.title}_${index}`}
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
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(17, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    marginBottom: 4,
  },
  kicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryEntryCard: {
    borderRadius: theme.shapes.card,
    padding: 20,
    backgroundColor: theme.colors.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.3)",
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 14,
  },
  primaryEntryText: {
    flex: 1,
    gap: 8,
  },
  primaryEntryTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  primaryEntryBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryEntryBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
  },
  primaryEntryBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  historyCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(255, 122, 60, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.2)",
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
    backgroundColor: "rgba(17, 20, 36, 0.84)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
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
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  card: {
    borderRadius: theme.shapes.card,
    padding: 18,
    borderWidth: 1,
  },
  cardSoon: {
    backgroundColor: "rgba(24, 24, 40, 0.72)",
    borderColor: theme.colors.borderSubtle,
    opacity: 0.82,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
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
});
