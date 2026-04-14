import React from "react";
import { BackHandler, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { auth } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type AnnouncementDetailRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { goBackOrOpenNearbyAnnouncements } from "@/navigation/nearbyNavigation";
import {
  nearbyAnnouncementsRepository,
  type NearbyAnnouncement,
} from "@/services/nearbyAnnouncements";
import { theme } from "@/theme";
import { formatAgoLong } from "@/utils/timeAgo";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

function DetailRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export default function AnnouncementDetailScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"AnnouncementDetail">>();
  const route = useRoute<AnnouncementDetailRouteProp>();
  const { t } = useLocale();
  const announcementId = route.params.announcementId.trim();
  const initialAnnouncement: NearbyAnnouncement | null =
    route.params.initialAnnouncement ?? null;
  const currentUid = auth?.currentUser?.uid ?? "";
  const [announcement, setAnnouncement] = React.useState<NearbyAnnouncement | null>(
    initialAnnouncement
  );
  const [loading, setLoading] = React.useState(!initialAnnouncement);
  const [respondedAt, setRespondedAt] = React.useState<number | null>(null);
  const [responding, setResponding] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      if (!announcementId) {
        setAnnouncement(null);
        setRespondedAt(null);
        setLoading(false);
        return () => {
          alive = false;
        };
      }

      setLoading(true);
      void Promise.all([
        nearbyAnnouncementsRepository.getAnnouncementById(announcementId),
        nearbyAnnouncementsRepository.getAnnouncementResponseState(
          announcementId,
          currentUid || "guest"
        ),
      ]).then(([nextAnnouncement, responseState]) => {
        if (!alive) return;
        setAnnouncement(nextAnnouncement);
        setRespondedAt(responseState.respondedAt);
        setLoading(false);
      });

      return () => {
        alive = false;
      };
    }, [announcementId, currentUid])
  );

  const handleBack = React.useCallback(() => {
    goBackOrOpenNearbyAnnouncements(navigation);
  }, [navigation]);

  useFocusEffect(
    React.useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => subscription.remove();
    }, [handleBack])
  );

  const categoryLabels = React.useMemo(
    () => ({
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
  const isOwnAnnouncement = Boolean(
    currentUid && announcement?.authorUid && currentUid === announcement.authorUid
  );

  const handleRespond = React.useCallback(async () => {
    if (!announcement || responding || isOwnAnnouncement) return;
    setResponding(true);
    try {
      const responseState = await nearbyAnnouncementsRepository.markAnnouncementResponded(
        announcement.id,
        currentUid || "guest"
      );
      setRespondedAt(responseState.respondedAt);
    } finally {
      setResponding(false);
    }
  }, [announcement, currentUid, isOwnAnnouncement, responding]);

  const screenTitle = copyOrFallback(t, "nearby.detail.title", "Объявление");

  if (!loading && !announcement) {
    return (
      <ScreenShell title={screenTitle} background="ads" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <View style={styles.centerCard}>
            <Text style={styles.centerTitle}>
              {copyOrFallback(t, "nearby.detail.missingTitle", "Объявление недоступно")}
            </Text>
            <Text style={styles.centerBody}>
              {copyOrFallback(
                t,
                "nearby.detail.missingBody",
                "Не удалось открыть это объявление. Можно вернуться к списку рядом."
              )}
            </Text>
            <Pressable onPress={handleBack} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {copyOrFallback(t, "nearby.detail.backToList", "К объявлениям")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={screenTitle} background="ads" showBack onBack={handleBack}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {announcement ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryMetaRow}>
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>
                    {categoryLabels[announcement.category]}
                  </Text>
                </View>
                <View style={styles.metaPill}>
                  <Ionicons name="location-outline" size={14} color={theme.colors.subtext} />
                  <Text style={styles.metaPillText}>
                    {announcement.placeLabel || fallbackPlaceLabel}
                  </Text>
                </View>
                {announcement.proximityLabel ? (
                  <View style={styles.metaPill}>
                    <Ionicons name="navigate-outline" size={14} color={theme.colors.subtext} />
                    <Text style={styles.metaPillText}>{announcement.proximityLabel}</Text>
                  </View>
                ) : null}
              </View>

              <Text style={styles.summaryTitle}>{announcement.title}</Text>

              <View style={styles.summaryFooter}>
                <Text style={styles.summaryAuthor}>{announcement.authorLabel}</Text>
                <Text style={styles.summaryDot}>•</Text>
                <Text style={styles.summaryTime}>{formatAgoLong(announcement.createdAt, t)}</Text>
              </View>
            </View>

            {announcement.hasPhoto || announcement.photoUri ? (
              <View style={styles.mediaCard}>
                <View
                  style={[styles.mediaTile, announcement.hasPhoto ? styles.mediaTileActive : null]}
                >
                  {announcement.photoUri ? (
                    <Image source={{ uri: announcement.photoUri }} style={styles.mediaImage} />
                  ) : (
                    <Ionicons name="image-outline" size={24} color={theme.colors.accent} />
                  )}
                </View>
                <View style={styles.mediaCopy}>
                  <Text style={styles.sectionLabel}>
                    {copyOrFallback(t, "nearby.detail.photoLabel", "Формат")}
                  </Text>
                  <Text style={styles.mediaTitle}>
                    {copyOrFallback(t, "nearby.detail.photoYes", "С фото")}
                  </Text>
                  <Text style={styles.mediaBody}>
                    {copyOrFallback(
                      t,
                      "nearby.detail.photoWithBody",
                      "У объявления есть визуальный слот. Полный media-flow подключим позже."
                    )}
                  </Text>
                </View>
              </View>
            ) : null}

            <View style={styles.detailsCard}>
              <Text style={styles.sectionLabel}>
                {copyOrFallback(t, "nearby.detail.metaTitle", "Детали")}
              </Text>
              <View style={styles.detailStack}>
                <DetailRow
                  label={copyOrFallback(t, "nearby.detail.categoryLabel", "Категория")}
                  value={categoryLabels[announcement.category]}
                />
                <DetailRow
                  label={copyOrFallback(t, "nearby.detail.placeLabel", "Место")}
                  value={announcement.placeLabel || fallbackPlaceLabel}
                />
                {announcement.proximityLabel ? (
                  <DetailRow
                    label={copyOrFallback(t, "nearby.detail.distanceLabel", "Расстояние")}
                    value={announcement.proximityLabel}
                  />
                ) : null}
                <DetailRow
                  label={copyOrFallback(t, "nearby.detail.authorLabel", "Автор")}
                  value={announcement.authorLabel}
                />
              </View>

              <View style={styles.detailsDivider} />

              <View style={styles.descriptionBlock}>
                <Text style={styles.descriptionLabel}>
                  {copyOrFallback(t, "nearby.detail.descriptionTitle", "Описание")}
                </Text>
                <Text style={styles.descriptionText}>{announcement.description}</Text>
              </View>
            </View>

            <View style={styles.responseCard}>
              <Text style={styles.responseTitle}>
                {isOwnAnnouncement
                  ? copyOrFallback(t, "nearby.detail.ownTitle", "Это ваше объявление")
                  : respondedAt
                    ? copyOrFallback(t, "nearby.detail.respondedTitle", "Интерес сохранён")
                    : copyOrFallback(t, "nearby.detail.responseTitle", "Хочешь откликнуться?")}
              </Text>
              <Text style={styles.responseBody}>
                {isOwnAnnouncement
                  ? copyOrFallback(
                      t,
                      "nearby.detail.ownBody",
                      "Оно уже видно в Nearby -> Объявления. Следующим шагом сюда подключим отклики."
                    )
                  : respondedAt
                    ? copyOrFallback(
                        t,
                        "nearby.detail.respondedBody",
                        "Мы сохранили интерес локально. Когда response flow будет готов, следующий шаг появится здесь."
                      )
                    : copyOrFallback(
                        t,
                        "nearby.detail.responseBody",
                        "Полноценный отклик через личный чат подключим позже. Пока можно мягко сохранить интерес к объявлению."
                      )}
              </Text>

              {isOwnAnnouncement ? (
                <Pressable onPress={handleBack} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>
                    {copyOrFallback(t, "nearby.detail.backToList", "К объявлениям")}
                  </Text>
                </Pressable>
              ) : respondedAt ? (
                <Pressable onPress={handleBack} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>
                    {copyOrFallback(t, "nearby.detail.backToList", "К объявлениям")}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => void handleRespond()}
                  disabled={responding}
                  style={[styles.primaryButton, responding ? styles.primaryButtonDisabled : null]}
                >
                  <Text style={styles.primaryButtonText}>
                    {responding
                      ? copyOrFallback(t, "nearby.detail.responding", "Сохраняем интерес...")
                      : copyOrFallback(t, "nearby.detail.respond", "Откликнуться")}
                  </Text>
                </Pressable>
              )}
            </View>
          </>
        ) : (
          <View style={styles.centerState}>
            <View style={styles.centerCard}>
              <Text style={styles.centerTitle}>
                {copyOrFallback(t, "nearby.loading", "Собираем Nearby…")}
              </Text>
              <Text style={styles.centerBody}>
                {copyOrFallback(
                  t,
                  "nearby.detail.loadingBody",
                  "Подтягиваем актуальные детали объявления и вернём действие сразу после загрузки."
                )}
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 14,
    paddingBottom: 32,
    gap: 12,
  },
  summaryCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(16, 20, 38, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  summaryMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(255, 78, 138, 0.14)",
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.22)",
  },
  categoryPillText: {
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  metaPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
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
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  summaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  summaryAuthor: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  summaryDot: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  summaryTime: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  mediaCard: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 12,
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(14, 18, 34, 0.84)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  mediaTile: {
    width: 96,
    minHeight: 96,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    padding: 9,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  mediaTileActive: {
    backgroundColor: "rgba(255,122,60,0.08)",
    borderColor: "rgba(255,122,60,0.18)",
  },
  mediaImage: {
    width: "100%",
    height: 78,
    borderRadius: 16,
  },
  mediaCopy: {
    flex: 1,
    gap: 5,
  },
  sectionLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  mediaTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  mediaBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
  detailsCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(17, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  detailStack: {
    gap: 10,
  },
  detailRow: {
    gap: 3,
  },
  detailLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  detailValue: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  detailsDivider: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
  },
  descriptionBlock: {
    gap: 8,
  },
  descriptionLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  descriptionText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  responseCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(25, 19, 35, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  responseTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  responseBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  primaryButton: {
    alignSelf: "stretch",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryButtonDisabled: {
    opacity: 0.65,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    alignSelf: "stretch",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    paddingVertical: 40,
  },
  centerCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(16, 20, 38, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  centerTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  centerBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
