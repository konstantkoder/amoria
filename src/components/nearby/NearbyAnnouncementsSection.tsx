import React, { useMemo } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import {
  NEARBY_ANNOUNCEMENT_CATEGORY_ORDER,
  type NearbyAnnouncement,
  type NearbyAnnouncementCategory,
} from "@/services/nearbyAnnouncements";
import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";
import { formatAgoLong } from "@/utils/timeAgo";

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
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={styles.heroKicker}>
              {copyOrFallback(t, "nearby.announcements.kicker", "Локальный маркетплейс")}
            </Text>
            <Text style={styles.heroTitle}>
              {copyOrFallback(t, "nearby.announcements.title", "Объявления рядом")}
            </Text>
            <Text style={styles.heroBody}>
              {copyOrFallback(
                t,
                "nearby.announcements.body",
                "Поездка, прогулка, кофе или совместная активность рядом."
              )}
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
        <Pressable onPress={onCreate} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>
            {copyOrFallback(t, "nearby.announcements.create", "Создать объявление")}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
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
      </ScrollView>

      {items.length ? (
        items.map((item) => {
          const expanded = expandedId === item.id;
          return (
            <Pressable
              key={item.id}
              onPress={() => onToggleOpen(item.id)}
              style={({ pressed }) => [
                styles.card,
                expanded ? styles.cardExpanded : null,
                pressed ? styles.cardPressed : null,
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <View style={styles.cardMetaRow}>
                    <View style={styles.categoryPill}>
                      <Text style={styles.categoryText}>{categoryLabels[item.category]}</Text>
                    </View>
                    <View style={styles.metaPill}>
                      <Ionicons name="location-outline" size={13} color={theme.colors.subtext} />
                      <Text style={styles.metaPillText}>{item.placeLabel || fallbackPlaceLabel}</Text>
                    </View>
                    {item.proximityLabel ? (
                      <View style={styles.metaPill}>
                        <Ionicons name="navigate-outline" size={13} color={theme.colors.subtext} />
                        <Text style={styles.metaPillText}>{item.proximityLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={expanded ? 3 : 2}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardDescription} numberOfLines={expanded ? undefined : 2}>
                    {item.description}
                  </Text>
                </View>

                <View style={[styles.mediaTile, item.hasPhoto ? styles.mediaTileActive : null]}>
                  {item.photoUri ? (
                    <Image source={{ uri: item.photoUri }} style={styles.mediaImage} />
                  ) : (
                    <Ionicons
                      name={item.hasPhoto ? "image-outline" : "document-text-outline"}
                      size={18}
                      color={item.hasPhoto ? theme.colors.accent : theme.colors.subtext}
                    />
                  )}
                  <Text style={styles.mediaTileText}>
                    {item.hasPhoto
                      ? copyOrFallback(t, "nearby.announcements.photoYes", "С фото")
                      : copyOrFallback(t, "nearby.announcements.photoNo", "Без фото")}
                  </Text>
                </View>
              </View>

              <View style={styles.cardFooter}>
                <View style={styles.authorBlock}>
                  <Text style={styles.cardAuthor}>{item.authorLabel}</Text>
                  <Text style={styles.cardTimestamp}>{formatAgoLong(item.createdAt, t)}</Text>
                </View>
                <View style={styles.openButton}>
                  <Text style={styles.openButtonText}>
                    {expanded
                      ? copyOrFallback(t, "nearby.announcements.close", "Свернуть")
                      : copyOrFallback(t, "nearby.announcements.open", "Открыть")}
                  </Text>
                  <Ionicons
                    name={expanded ? "chevron-up-outline" : "chevron-forward-outline"}
                    size={15}
                    color={theme.colors.text}
                  />
                </View>
              </View>
            </Pressable>
          );
        })
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <Ionicons name="compass-outline" size={22} color={theme.colors.accent} />
          </View>
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
          <Pressable onPress={onCreate} style={styles.emptyButton}>
            <Text style={styles.emptyButtonText}>
              {copyOrFallback(t, "nearby.announcements.create", "Создать объявление")}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingTop: 6,
    paddingBottom: 24,
    gap: 12,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
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
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
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
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  filterRow: {
    paddingRight: 4,
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
    gap: 14,
  },
  cardExpanded: {
    borderColor: "rgba(255,255,255,0.14)",
  },
  cardPressed: {
    opacity: 0.95,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardCopy: {
    flex: 1,
    gap: 8,
  },
  cardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "800",
  },
  categoryPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(255, 78, 138, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.22)",
  },
  categoryText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  metaPillText: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "700",
  },
  cardDescription: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 19,
  },
  mediaTile: {
    width: 82,
    minHeight: 82,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    gap: 6,
  },
  mediaTileActive: {
    backgroundColor: "rgba(255,122,60,0.08)",
    borderColor: "rgba(255,122,60,0.18)",
  },
  mediaImage: {
    width: "100%",
    height: 48,
    borderRadius: 12,
  },
  mediaTileText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  authorBlock: {
    flex: 1,
    gap: 3,
  },
  cardAuthor: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  cardTimestamp: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
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
    gap: 10,
    alignItems: "flex-start",
  },
  emptyIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,122,60,0.10)",
    borderWidth: 1,
    borderColor: "rgba(255,122,60,0.20)",
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  emptyBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  emptyButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
