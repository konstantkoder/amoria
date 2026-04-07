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
  id: string;
  title: string;
  description: string;
  status: "active" | "soon";
};

const CARDS: ActivityCard[] = [
  {
    id: "draw",
    title: "Нарисовать вместе",
    description: "Общий холст на двоих. Семь минут, один рисунок, один ритм.",
    status: "active",
  },
  {
    id: "world",
    title: "Построить мир",
    description: "Совместная мини-сцена, где каждый достраивает идею второго.",
    status: "soon",
  },
  {
    id: "playlist",
    title: "Составить плейлист",
    description: "Быстрый обмен треками и общий вайб из нескольких выборов.",
    status: "soon",
  },
  {
    id: "quest",
    title: "Пройти мини-квест",
    description: "Небольшое кооперативное испытание с мягкими подсказками.",
    status: "soon",
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
          <Text style={styles.kicker}>MVP</Text>
          <Text style={styles.heroTitle}>Найди напарника и соберите что-то вместе</Text>
          <Text style={styles.heroText}>
            Быстрые совместные активности без долгой переписки. Сейчас доступен
            только общий рисунок.
          </Text>
        </View>

        <Pressable
          onPress={() => navigation.navigate("PlayHistory")}
          style={styles.historyCard}
        >
          <View style={styles.historyTextWrap}>
            <Text style={styles.historyTitle}>Мои совместные истории</Text>
            <Text style={styles.historyText}>
              Здесь остаются завершенные совместные сессии, replay и путь обратно в чат.
            </Text>
          </View>
          <View style={styles.historyBadge}>
            <Text style={styles.historyBadgeText}>Открыть</Text>
          </View>
        </Pressable>

        {CARDS.map((card) => {
          const active = card.status === "active";
          return (
            <Pressable
              key={card.id}
              disabled={!active}
              onPress={() =>
                navigation.navigate("PlayMatch", { activity: "draw" })
              }
              style={[
                styles.card,
                active ? styles.cardActive : styles.cardSoon,
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{card.title}</Text>
                <View
                  style={[
                    styles.badge,
                    active ? styles.badgeActive : styles.badgeSoon,
                  ]}
                >
                  <Text style={styles.badgeText}>
                    {active ? "Активно" : "Скоро"}
                  </Text>
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
  card: {
    borderRadius: theme.shapes.card,
    padding: 18,
    borderWidth: 1,
  },
  cardActive: {
    backgroundColor: theme.colors.cardElevated,
    borderColor: "rgba(255, 122, 60, 0.28)",
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
  badgeActive: {
    backgroundColor: theme.colors.accentSoft,
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
