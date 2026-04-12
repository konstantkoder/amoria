import React, { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  NEARBY_ANNOUNCEMENT_CATEGORY_ORDER,
  type NearbyAnnouncement,
  type NearbyAnnouncementCategory,
} from "@/services/nearbyAnnouncements";
import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";

type Props = {
  items: NearbyAnnouncement[];
  activeCategory: NearbyAnnouncementCategory | "all";
  expandedId?: string | null;
  onCategoryChange: (next: NearbyAnnouncementCategory | "all") => void;
  onToggleOpen: (id: string) => void;
  onCreate: () => void;
};

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function NearbyAnnouncementsSection({
  items,
  activeCategory,
  expandedId,
  onCategoryChange,
  onToggleOpen,
  onCreate,
}: Props) {
  const { t } = useLocale();

  const categoryLabels = useMemo(
    () => ({
      all: copyOrFallback(t, "nearby.announcements.filterAll", "Все"),
      walk: copyOrFallback(t, "nearby.announcements.category.walk", "Прогулка"),
      trip: copyOrFallback(t, "nearby.announcements.category.trip", "Поездка"),
      coffee: copyOrFallback(t, "nearby.announcements.category.coffee", "Кофе"),
      activity: copyOrFallback(t, "nearby.announcements.category.activity", "Активность"),
      sport: copyOrFallback(t, "nearby.announcements.category.sport", "Спорт"),
      ride: copyOrFallback(t, "nearby.announcements.category.ride", "Вместе по пути"),
    }),
    [t]
  );
  const fallbackPlaceLabel = copyOrFallback(t, "tabs.nearby", "Nearby");

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <Text style={styles.heroKicker}>
              {copyOrFallback(t, "nearby.announcements.kicker", "Локальный маркетплейс")}
            </Text>
            <Text style={styles.heroTitle}>
              {copyOrFallback(t, "nearby.announcements.title", "Объявления рядом")}
            </Text>
          </View>
          <View style={styles.heroCountPill}>
            <Text style={styles.heroCountText}>
              {copyOrFallback(
                t,
                "nearby.announcements.count",
                "{count} listings"
              ).replace("{count}", String(items.length))}
            </Text>
          </View>
        </View>
        <Text style={styles.heroBody}>
          {copyOrFallback(
            t,
            "nearby.announcements.body",
            "Здесь люди ищут компанию на прогулку, поездку или общую активность. Это отдельный сценарий от «Сейчас» и от «Комнат»."
          )}
        </Text>
        <Pressable onPress={onCreate} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {copyOrFallback(t, "nearby.announcements.create", "Создать объявление")}
          </Text>
        </Pressable>
      </View>

      <View style={styles.filterRow}>
        <Pressable
          onPress={() => onCategoryChange("all")}
          style={[styles.filterChip, activeCategory === "all" ? styles.filterChipActive : null]}
        >
          <Text style={[styles.filterText, activeCategory === "all" ? styles.filterTextActive : null]}>
            {categoryLabels.all}
          </Text>
        </Pressable>
        {NEARBY_ANNOUNCEMENT_CATEGORY_ORDER.map((category) => {
          const active = activeCategory === category;
          return (
            <Pressable
              key={category}
              onPress={() => onCategoryChange(category)}
              style={[styles.filterChip, active ? styles.filterChipActive : null]}
            >
              <Text style={[styles.filterText, active ? styles.filterTextActive : null]}>
                {categoryLabels[category]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {items.length ? (
        items.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <View style={styles.categoryPill}>
                      <Text style={styles.categoryText}>{categoryLabels[item.category]}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardMeta}>
                    {item.placeLabel || fallbackPlaceLabel}
                    {item.proximityLabel ? ` • ${item.proximityLabel}` : ""}
                  </Text>
                </View>
                <View style={styles.photoPill}>
                  <Ionicons
                    name={item.hasPhoto ? "image-outline" : "document-text-outline"}
                    size={14}
                    color={item.hasPhoto ? theme.colors.accent : theme.colors.text}
                  />
                  <Text style={styles.photoPillText}>
                    {item.hasPhoto
                      ? copyOrFallback(t, "nearby.announcements.photoYes", "С фото")
                      : copyOrFallback(t, "nearby.announcements.photoNo", "Без фото")}
                  </Text>
                </View>
              </View>

              <Text
                style={styles.cardDescription}
                numberOfLines={expanded ? undefined : 3}
              >
                {item.description}
              </Text>

              <View style={styles.cardFooter}>
                <Text style={styles.cardAuthor}>{item.authorLabel}</Text>
                <Pressable onPress={() => onToggleOpen(item.id)} style={styles.openButton}>
                  <Text style={styles.openButtonText}>
                    {expanded
                      ? copyOrFallback(t, "nearby.announcements.close", "Свернуть")
                      : copyOrFallback(t, "nearby.announcements.open", "Открыть")}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        })
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>
            {copyOrFallback(t, "nearby.announcements.emptyTitle", "Здесь появятся объявления рядом")}
          </Text>
          <Text style={styles.emptyBody}>
            {copyOrFallback(
              t,
              "nearby.announcements.emptyBody",
              "Смените фильтр или создайте первое объявление для своей локальной активности."
            )}
          </Text>
        </View>
      )}
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
    backgroundColor: "rgba(13, 18, 34, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 6,
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
  heroCountPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroCountText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
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
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: "rgba(255,122,60,0.18)",
    borderColor: "rgba(255,122,60,0.26)",
  },
  filterText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  filterTextActive: {
    color: theme.colors.accent,
  },
  card: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(16, 20, 38, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
    flexShrink: 1,
  },
  categoryPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 78, 138, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.22)",
  },
  categoryText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  cardMeta: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  photoPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  photoPillText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  cardDescription: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardAuthor: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  openButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  openButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  emptyCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(17, 20, 36, 0.82)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
