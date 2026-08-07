import React, { useEffect, useMemo, useRef } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import UserAvatar from "@/components/UserAvatar";
import {
  NEARBY_ANNOUNCEMENT_CATEGORY_ORDER,
  type NearbyAnnouncement,
  type NearbyAnnouncementCategory,
} from "@/services/announcementsModel";
import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";
import { formatAgoLong } from "@/utils/timeAgo";

type Props = {
  items: NearbyAnnouncement[];
  activeCategory: NearbyAnnouncementCategory | "all";
  highlightedId?: NearbyAnnouncement["id"] | null;
  blockedUserIds?: string[];
  onCategoryChange: (next: NearbyAnnouncementCategory | "all") => void;
  onOpen: (item: NearbyAnnouncement) => void;
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
  highlightedId,
  blockedUserIds = [],
  onCategoryChange,
  onOpen,
  onCreate,
}: Props) {
  const { t } = useLocale();
  const scrollRef = useRef<ScrollView | null>(null);

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
  const fallbackPlaceLabel = copyOrFallback(
    t,
    "nearby.placeFallback",
    "Место не указано"
  );
  const visibleItems = useMemo(() => {
    const blocked = new Set(blockedUserIds);
    return items.filter((item) => item.status === "active" && !blocked.has(item.authorUid));
  }, [blockedUserIds, items]);
  const emptyState = useMemo(() => {
    if (activeCategory === "all") {
      return {
        title: copyOrFallback(
          t,
          "nearby.announcements.emptyTitle",
          "Пока нет оформленных объявлений"
        ),
        body: copyOrFallback(
          t,
          "nearby.announcements.emptyBody",
          "Объявления нужны для более понятного запроса: кого ты ищешь, где и на какой формат встречи рассчитываешь. Можно разместить первое и задать тон разделу."
        ),
      };
    }

    const categoryLabel = categoryLabels[activeCategory];
    const filteredTitle = copyOrFallback(
      t,
      "nearby.announcements.emptyFilteredTitle",
      "В категории «{category}» пока пусто"
    ).replace("{category}", categoryLabel);
    return {
      title: filteredTitle,
      body: copyOrFallback(
        t,
        "nearby.announcements.emptyFilteredBody",
        "Попробуй другой фильтр или размести первое объявление в этом формате."
      ),
    };
  }, [activeCategory, categoryLabels, t]);

  useEffect(() => {
    if (!highlightedId) return;
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [highlightedId]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={styles.heroCopy}>
            <Text style={styles.heroKicker}>
              {copyOrFallback(t, "nearby.announcements.kicker", "Оформленные запросы")}
            </Text>
            <Text style={styles.heroTitle}>
              {copyOrFallback(t, "nearby.announcements.title", "Объявления")}
            </Text>
            <Text style={styles.heroBody}>
              {copyOrFallback(
                t,
                "nearby.announcements.body",
                "Это не быстрый статус рядом. Здесь остаются оформленные запросы: кого ты ищешь, где, для какого плана и на какой формат встречи рассчитываешь."
              )}
            </Text>
          </View>
        </View>
        <View style={styles.heroFooter}>
          <View style={styles.heroCountPill}>
            <Text style={styles.heroCountText}>
              {copyOrFallback(
                t,
                "nearby.announcements.count",
                "{count} requests"
              ).replace("{count}", String(visibleItems.length))}
            </Text>
          </View>
          <Pressable onPress={onCreate} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {copyOrFallback(t, "nearby.announcements.create", "Создать объявление")}
            </Text>
          </Pressable>
        </View>
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

      {visibleItems.length ? (
        visibleItems.map((item) => {
          const highlighted = highlightedId === item.id;
          const photoUrl = item.photoUrl?.startsWith("http")
            ? item.photoUrl
            : item.photoUri?.startsWith("http")
              ? item.photoUri
              : "";
          const rawAuthorLabel = item.authorName?.trim() || item.authorLabel;
          const authorLabel =
            rawAuthorLabel === "profile.amoriaUser"
              ? copyOrFallback(t, "profile.amoriaUser", "Пользователь Amoria")
              : rawAuthorLabel;
          const facts = [authorLabel, item.placeLabel || fallbackPlaceLabel, item.proximityLabel]
            .filter((value): value is string => Boolean(value))
            .join(" • ");
          return (
            <Pressable
              key={item.id}
              onPress={() => onOpen(item)}
              style={({ pressed }) => [
                styles.card,
                highlighted ? styles.cardHighlighted : null,
                pressed ? styles.cardPressed : null,
              ]}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardCopy}>
                  <View style={styles.cardMetaRow}>
                    <View style={styles.categoryPill}>
                      <Text style={styles.categoryText}>{categoryLabels[item.category]}</Text>
                    </View>
                    {highlighted ? (
                      <View style={styles.newBadge}>
                        <Text style={styles.newBadgeText}>
                          {copyOrFallback(t, "nearby.announcements.newBadge", "Новое")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <Text style={styles.cardDescription} numberOfLines={2}>
                    {item.description}
                  </Text>
                  <Text style={styles.cardFactsText} numberOfLines={2}>
                    {facts}
                  </Text>
                </View>

                <View style={[styles.mediaTile, item.hasPhoto ? styles.mediaTileActive : null]}>
                  {photoUrl ? (
                    <Image source={{ uri: photoUrl }} style={styles.mediaImage} />
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
                <View style={styles.cardAuthorWrap}>
                  <UserAvatar avatarUrl={item.authorAvatarUrl} label={authorLabel} size={28} />
                  <Text style={styles.cardTimestamp}>{formatAgoLong(item.createdAt, t)}</Text>
                </View>
                <View style={styles.openButton}>
                  <Text style={styles.openButtonText}>
                    {copyOrFallback(t, "nearby.announcements.open", "Открыть объявление")}
                  </Text>
                  <Ionicons
                    name="chevron-forward-outline"
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
          <Text style={styles.emptyKicker}>
            {copyOrFallback(t, "nearby.announcements.kicker", "Оформленные запросы")}
          </Text>
          <Text style={styles.emptyTitle}>{emptyState.title}</Text>
          <Text style={styles.emptyBody}>{emptyState.body}</Text>
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
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 14,
  },
  heroTop: {
    gap: 8,
  },
  heroCopy: {
    gap: 4,
  },
  heroFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  heroCountPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroCountText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  primaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  filterRow: {
    paddingRight: 4,
    gap: 6,
  },
  filterChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 11,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  filterChipActive: {
    backgroundColor: "rgba(255,122,60,0.22)",
    borderColor: "rgba(255,122,60,0.3)",
  },
  filterText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "700",
  },
  filterTextActive: {
    color: theme.colors.accent,
  },
  card: {
    padding: 15,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(230,185,118,0.14)",
    gap: 12,
  },
  cardHighlighted: {
    borderBottomColor: "rgba(230,185,118,0.28)",
    backgroundColor: "transparent",
  },
  cardPressed: {
    opacity: 0.95,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  cardCopy: {
    flex: 1,
    gap: 7,
  },
  cardMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  categoryPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(230,185,118,0.10)",
    borderWidth: 1,
    borderColor: "rgba(230,185,118,0.18)",
  },
  categoryText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  newBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(255, 122, 60, 0.18)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.28)",
  },
  newBadgeText: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
  },
  cardDescription: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  cardFactsText: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  mediaTile: {
    width: 76,
    minHeight: 76,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
    padding: 7,
    gap: 5,
  },
  mediaTileActive: {
    backgroundColor: "rgba(255,122,60,0.08)",
    borderColor: "rgba(255,122,60,0.18)",
  },
  mediaImage: {
    width: "100%",
    height: 42,
    borderRadius: 12,
  },
  mediaTileText: {
    color: theme.colors.text,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "center",
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  cardAuthorWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardTimestamp: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  openButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "rgba(255,122,60,0.20)",
    borderWidth: 1,
    borderColor: "rgba(255,122,60,0.30)",
  },
  openButtonText: {
    color: "#FFF4EC",
    fontSize: 12,
    fontWeight: "800",
  },
  emptyCard: {
    padding: 18,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 12,
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
  emptyKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
  emptyButton: {
    borderRadius: theme.shapes.pill,
    alignSelf: "stretch",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: theme.colors.primary,
  },
  emptyButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
});
