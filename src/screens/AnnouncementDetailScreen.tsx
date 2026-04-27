import React from "react";
import {
  Alert,
  BackHandler,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type AlertButton,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import CoreStateCard from "@/components/CoreStateCard";
import UserAvatar from "@/components/UserAvatar";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type AnnouncementDetailRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { goBackOrOpenAnnouncements } from "@/navigation/nearbyNavigation";
import { buildDmChatRouteParams, ensureDmThread } from "@/services/dm";
import {
  nearbyAnnouncementsRepository,
  type NearbyAnnouncement,
} from "@/services/nearbyAnnouncements";
import {
  blockUser,
  createReport,
  getBlockedUserIds,
  type SafetyReportReason,
} from "@/services/safety";
import { getUserProfile, getUserProfileById } from "@/services/user";
import { theme } from "@/theme";
import { formatAgoLong } from "@/utils/timeAgo";

type AnnouncementResponseMode = "own" | "direct_dm" | "unavailable";

type AnnouncementResponsePresentation = {
  title: string;
  body: string;
  actionLabel: string;
  busyLabel: string;
  buttonVariant: "primary" | "secondary";
};

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

function resolveAnnouncementResponseMode(params: {
  announcement: NearbyAnnouncement | null;
  currentUid: string;
  canOpenDirectChat: boolean;
  override?: AnnouncementResponseMode | null;
}): AnnouncementResponseMode {
  if (params.override) {
    return params.override;
  }

  const authorUid = String(params.announcement?.authorUid ?? "").trim();
  if (authorUid && params.currentUid && authorUid === params.currentUid) {
    return "own";
  }
  if (authorUid && params.currentUid && params.canOpenDirectChat) {
    return "direct_dm";
  }
  return "unavailable";
}

function buildAnnouncementResponsePresentation(
  t: (key: string, params?: Record<string, string>) => string,
  mode: AnnouncementResponseMode,
  hasResponded: boolean
): AnnouncementResponsePresentation {
  switch (mode) {
    case "own":
      return {
        title: copyOrFallback(t, "nearby.detail.ownTitle", "Это ваше объявление"),
        body: copyOrFallback(
          t,
          "nearby.detail.ownBody",
          "Это объявление уже опубликовано в разделе «Объявления». Отсюда можно спокойно вернуться к списку."
        ),
        actionLabel: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
        busyLabel: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
        buttonVariant: "secondary",
      };
    case "direct_dm":
      return {
        title: copyOrFallback(
          t,
          hasResponded ? "nearby.detail.chatReadyTitle" : "nearby.detail.chatTitle",
          hasResponded ? "Личный чат уже доступен" : "Здесь откроется личный чат"
        ),
        body: copyOrFallback(
          t,
          hasResponded ? "nearby.detail.chatReadyBody" : "nearby.detail.chatBody",
          hasResponded
            ? "Интерес к объявлению уже отмечен. Можно сразу продолжить разговор с автором."
            : "Это объявление связано с реальным автором. Кнопка ниже откроет личный чат с ним."
        ),
        actionLabel: hasResponded
          ? copyOrFallback(t, "nearby.detail.openChat", "Открыть чат")
          : copyOrFallback(t, "nearby.detail.messageAuthor", "Написать автору"),
        busyLabel: copyOrFallback(t, "nearby.detail.openingChat", "Открываем чат..."),
        buttonVariant: "primary",
      };
    case "unavailable":
      return {
        title: copyOrFallback(
          t,
          "nearby.detail.unavailableTitle",
          "Личный отклик сейчас недоступен"
        ),
        body: copyOrFallback(
          t,
          "nearby.detail.unavailableBody",
          "Для этого объявления сейчас нет реального пути в личный чат. Можно вернуться к списку и открыть другое объявление."
        ),
        actionLabel: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
        busyLabel: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
        buttonVariant: "secondary",
      };
  }
}

function buildReportReasonButtons(
  t: (key: string, params?: Record<string, string>) => string,
  onSelect: (reason: SafetyReportReason) => void
): AlertButton[] {
  return [
    {
      text: copyOrFallback(t, "safety.reason.spam", "Спам"),
      onPress: () => onSelect("spam"),
    },
    {
      text: copyOrFallback(t, "safety.reason.harassment", "Оскорбления или преследование"),
      onPress: () => onSelect("harassment"),
    },
    {
      text: copyOrFallback(
        t,
        "safety.reason.sexualServices",
        "Сексуальные услуги или оплатная встреча"
      ),
      onPress: () => onSelect("sexual_services"),
    },
    {
      text: copyOrFallback(t, "safety.reason.scam", "Мошенничество"),
      onPress: () => onSelect("scam"),
    },
    {
      text: copyOrFallback(t, "safety.reason.other", "Другое"),
      onPress: () => onSelect("other"),
    },
    {
      text: copyOrFallback(t, "common.cancel", "Отмена"),
      style: "cancel",
    },
  ];
}

function getAnnouncementUnavailableCopy(
  t: (key: string, params?: Record<string, string>) => string,
  status: NearbyAnnouncement["status"]
) {
  if (status === "closed") {
    return {
      title: copyOrFallback(t, "nearby.detail.closedTitle", "Объявление закрыто"),
      body: copyOrFallback(
        t,
        "nearby.detail.closedBody",
        "Автор закрыл это объявление. Оно больше не принимает отклики."
      ),
    };
  }
  if (status === "deleted") {
    return {
      title: copyOrFallback(t, "nearby.detail.deletedTitle", "Объявление удалено"),
      body: copyOrFallback(
        t,
        "nearby.detail.deletedBody",
        "Это объявление больше не доступно в релизном списке."
      ),
    };
  }
  if (status === "under_review") {
    return {
      title: copyOrFallback(t, "nearby.detail.underReviewTitle", "Объявление на проверке"),
      body: copyOrFallback(
        t,
        "nearby.detail.underReviewBody",
        "Это объявление временно скрыто, пока по нему идёт проверка."
      ),
    };
  }
  return null;
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
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [responseError, setResponseError] = React.useState<string | null>(null);
  const [responseModeOverride, setResponseModeOverride] =
    React.useState<AnnouncementResponseMode | null>(null);
  const [authorBlocked, setAuthorBlocked] = React.useState(false);
  const [authorAvatarUrl, setAuthorAvatarUrl] = React.useState(
    initialAnnouncement?.authorAvatarUrl ?? ""
  );
  const [authorDisplayName, setAuthorDisplayName] = React.useState(
    initialAnnouncement?.authorName?.trim() || initialAnnouncement?.authorLabel?.trim() || ""
  );
  const [currentProfileName, setCurrentProfileName] = React.useState("");
  const [safetyBusy, setSafetyBusy] = React.useState(false);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      if (!announcementId) {
        setAnnouncement(null);
        setRespondedAt(null);
        setAuthorBlocked(false);
        setLoading(false);
        return () => {
          alive = false;
        };
      }

      setLoading(true);
      setLoadError(null);
      setResponseError(null);
      setResponseModeOverride(null);
      void Promise.all([
        nearbyAnnouncementsRepository.getAnnouncementById(announcementId),
        currentUid
          ? nearbyAnnouncementsRepository.getAnnouncementResponseState(
              announcementId,
              currentUid
            )
          : Promise.resolve({ respondedAt: null, hasResponded: false }),
        currentUid ? getBlockedUserIds(currentUid).catch(() => []) : Promise.resolve([]),
      ])
        .then(([nextAnnouncement, responseState, blockedIds]) => {
          if (!alive) return;
          setAnnouncement(nextAnnouncement);
          setRespondedAt(responseState.respondedAt);
          setAuthorAvatarUrl(nextAnnouncement?.authorAvatarUrl ?? "");
          setAuthorDisplayName(
            nextAnnouncement?.authorName?.trim() || nextAnnouncement?.authorLabel?.trim() || ""
          );
          setAuthorBlocked(
            Boolean(
              nextAnnouncement?.authorUid &&
                blockedIds.includes(String(nextAnnouncement.authorUid))
            )
          );
        })
        .catch(() => {
          if (!alive) return;
          setAnnouncement(null);
          setRespondedAt(null);
          setAuthorAvatarUrl("");
          setAuthorDisplayName("");
          setAuthorBlocked(false);
          setLoadError(
            copyOrFallback(
              t,
              "nearby.detail.loadErrorBody",
              "Не удалось загрузить это объявление из Firestore. Попробуй ещё раз позже."
            )
          );
        })
        .finally(() => {
          if (!alive) return;
          setLoading(false);
        });

      return () => {
        alive = false;
      };
    }, [announcementId, currentUid, t])
  );

  const handleBack = React.useCallback(() => {
    goBackOrOpenAnnouncements(navigation);
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

  const fallbackPlaceLabel = copyOrFallback(
    t,
    "nearby.placeFallback",
    "Место не указано"
  );
  const announcementAuthorUid = String(announcement?.authorUid ?? "").trim();
  const canOpenDirectChat = Boolean(db);
  const hasResponded = respondedAt !== null;
  const responseMode = React.useMemo(
    () =>
      resolveAnnouncementResponseMode({
        announcement,
        currentUid,
        canOpenDirectChat,
        override: responseModeOverride,
      }),
    [announcement, canOpenDirectChat, currentUid, responseModeOverride]
  );
  const amoriaUserLabel = copyOrFallback(t, "profile.amoriaUser", "Пользователь Amoria");
  const currentAuthorLabel = currentProfileName || amoriaUserLabel;
  const rawAnnouncementAuthorLabel =
    authorDisplayName || announcement?.authorName?.trim() || announcement?.authorLabel?.trim() || amoriaUserLabel;
  const announcementAuthorLabel =
    rawAnnouncementAuthorLabel === "profile.amoriaUser"
      ? amoriaUserLabel
      : rawAnnouncementAuthorLabel;

  const responsePresentation = React.useMemo(
    () => buildAnnouncementResponsePresentation(t, responseMode, hasResponded),
    [hasResponded, responseMode, t]
  );

  React.useEffect(() => {
    let alive = true;
    if (!announcementAuthorUid) {
      setAuthorAvatarUrl("");
      return () => {
        alive = false;
      };
    }

    void getUserProfileById(announcementAuthorUid)
      .then((profile) => {
        if (!alive) return;
        setAuthorAvatarUrl(profile?.avatarUrl ?? announcement?.authorAvatarUrl ?? "");
        setAuthorDisplayName(
          profile?.displayName?.trim() ||
            announcement?.authorName?.trim() ||
            announcement?.authorLabel?.trim() ||
            ""
        );
      })
      .catch(() => {
        if (!alive) return;
        setAuthorAvatarUrl(announcement?.authorAvatarUrl ?? "");
      });

    return () => {
      alive = false;
    };
  }, [announcement?.authorAvatarUrl, announcementAuthorUid]);

  React.useEffect(() => {
    let alive = true;
    if (!currentUid) {
      setCurrentProfileName("");
      return () => {
        alive = false;
      };
    }

    void getUserProfile()
      .then((profile) => {
        if (!alive) return;
        setCurrentProfileName(profile.displayName?.trim() ?? "");
      })
      .catch(() => {
        if (!alive) return;
        setCurrentProfileName("");
      });

    return () => {
      alive = false;
    };
  }, [currentUid]);

  const handleRespond = React.useCallback(async () => {
    if (responding) return;

    switch (responseMode) {
      case "own":
        handleBack();
        return;
      case "unavailable":
        handleBack();
        return;
      case "direct_dm":
        if (!announcement || !db || !currentUid || !announcementAuthorUid) {
          setResponseModeOverride("unavailable");
          return;
        }

        setResponding(true);
        setResponseError(null);
        try {
          const threadId = await ensureDmThread(db, currentUid, announcementAuthorUid, {
            memberNames: {
              [currentUid]: currentAuthorLabel,
              [announcementAuthorUid]: announcementAuthorLabel,
            },
            source: "announcement",
            sourceSessionId: announcementId,
          });
          const responseState =
            await nearbyAnnouncementsRepository.respondToAnnouncement(announcementId, {
              uid: currentUid,
              dmThreadId: threadId,
            });
          setRespondedAt(responseState.respondedAt);

          navigation.navigate(
            "DMChat",
            buildDmChatRouteParams({
              threadId,
              peerId: announcementAuthorUid,
              peerName: announcementAuthorLabel,
              backTarget: "inbox",
              sourceContext: {
                source: "announcement",
                sourceSessionId: announcementId,
              },
            })
          );
        } catch {
          setResponseError(
            copyOrFallback(
              t,
              "nearby.detail.responseErrorBody",
              "Не удалось отправить отклик и открыть чат. Попробуй ещё раз чуть позже."
            )
          );
        } finally {
          setResponding(false);
        }
    }
  }, [
    announcement,
    announcementAuthorLabel,
    announcementAuthorUid,
    currentAuthorLabel,
    currentUid,
    handleBack,
    announcementId,
    navigation,
    responding,
    responseMode,
    t,
  ]);

  const reportAnnouncement = React.useCallback(
    async (reason: SafetyReportReason) => {
      if (!announcement || !currentUid || safetyBusy) {
        if (!currentUid) {
          Alert.alert(
            copyOrFallback(t, "safety.signInRequiredTitle", "Нужен вход"),
            copyOrFallback(
              t,
              "safety.signInRequiredBody",
              "Чтобы отправить жалобу или заблокировать пользователя, сначала войди в аккаунт."
            )
          );
        }
        return;
      }

      setSafetyBusy(true);
      try {
        await createReport({
          targetType: "announcement",
          targetId: announcement.id,
          targetOwnerUid: announcementAuthorUid,
          reason,
        });
        Alert.alert(
          copyOrFallback(t, "safety.reportSentTitle", "Жалоба отправлена"),
          copyOrFallback(
            t,
            "safety.reportSentBody",
            "Спасибо. Жалоба сохранена и будет доступна для проверки."
          )
        );
      } catch {
        Alert.alert(
          copyOrFallback(t, "safety.reportErrorTitle", "Жалоба не отправилась"),
          copyOrFallback(
            t,
            "safety.reportErrorBody",
            "Не удалось сохранить жалобу в Firestore. Попробуй ещё раз позже."
          )
        );
      } finally {
        setSafetyBusy(false);
      }
    },
    [announcement, announcementAuthorUid, currentUid, safetyBusy, t]
  );

  const handleReportAnnouncement = React.useCallback(() => {
    if (!announcement) return;
    Alert.alert(
      copyOrFallback(t, "safety.reportTitle", "Пожаловаться"),
      copyOrFallback(t, "safety.reportBody", "Выбери причину жалобы."),
      buildReportReasonButtons(t, (reason) => void reportAnnouncement(reason))
    );
  }, [announcement, reportAnnouncement, t]);

  const handleBlockAuthor = React.useCallback(() => {
    if (!currentUid) {
      Alert.alert(
        copyOrFallback(t, "safety.signInRequiredTitle", "Нужен вход"),
        copyOrFallback(
          t,
          "safety.signInRequiredBody",
          "Чтобы отправить жалобу или заблокировать пользователя, сначала войди в аккаунт."
        )
      );
      return;
    }
    if (!announcementAuthorUid || announcementAuthorUid === currentUid) return;
    Alert.alert(
      copyOrFallback(t, "safety.blockTitle", "Заблокировать пользователя?"),
      copyOrFallback(
        t,
        "safety.blockBody",
        "Вы больше не будете видеть его объявления в обычном списке, а личные чаты будут скрыты из вкладки «Чаты»."
      ),
      [
        {
          text: copyOrFallback(t, "common.cancel", "Отмена"),
          style: "cancel",
        },
        {
          text: copyOrFallback(t, "safety.blockConfirm", "Заблокировать"),
          style: "destructive",
          onPress: () => {
            setSafetyBusy(true);
            void blockUser(announcementAuthorUid, "announcement")
              .then(() => {
                setAuthorBlocked(true);
                Alert.alert(
                  copyOrFallback(t, "safety.userBlockedTitle", "Пользователь заблокирован"),
                  copyOrFallback(
                    t,
                    "safety.userBlockedBody",
                    "Этот пользователь скрыт из релизных списков на вашем аккаунте."
                  )
                );
              })
              .catch(() => {
                Alert.alert(
                  copyOrFallback(t, "safety.blockErrorTitle", "Не удалось заблокировать"),
                  copyOrFallback(
                    t,
                    "safety.blockErrorBody",
                    "Блокировка не сохранилась в Firestore. Попробуй ещё раз позже."
                  )
                );
              })
              .finally(() => setSafetyBusy(false));
          },
        },
      ]
    );
  }, [announcementAuthorUid, currentUid, t]);

  const screenTitle = copyOrFallback(t, "nearby.detail.title", "Объявление");
  const announcementPhotoUrl = announcement?.photoUrl ?? announcement?.photoUri ?? "";
  const unavailableAnnouncementCopy = announcement
    ? getAnnouncementUnavailableCopy(t, announcement.status)
    : null;

  if (!loading && loadError) {
    return (
      <ScreenShell title={screenTitle} background="ads" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={copyOrFallback(
              t,
              "nearby.detail.loadErrorTitle",
              "Объявление временно недоступно"
            )}
            body={loadError}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
              onPress: handleBack,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!loading && !announcement) {
    return (
      <ScreenShell title={screenTitle} background="ads" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="document-text-outline"
            title={copyOrFallback(t, "nearby.detail.missingTitle", "Объявление недоступно")}
            body={copyOrFallback(
              t,
              "nearby.detail.missingBody",
              "Не удалось открыть это объявление. Можно вернуться к списку объявлений."
            )}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
              onPress: handleBack,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!loading && announcement && authorBlocked && announcementAuthorUid !== currentUid) {
    return (
      <ScreenShell title={screenTitle} background="ads" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="eye-off-outline"
            title={copyOrFallback(t, "safety.blockedContentTitle", "Контент скрыт")}
            body={copyOrFallback(
              t,
              "safety.blockedAnnouncementBody",
              "Это объявление скрыто, потому что автор находится в вашем списке заблокированных пользователей."
            )}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
              onPress: handleBack,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!loading && announcement && unavailableAnnouncementCopy) {
    return (
      <ScreenShell title={screenTitle} background="ads" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="shield-checkmark-outline"
            title={unavailableAnnouncementCopy.title}
            body={unavailableAnnouncementCopy.body}
            primaryAction={{
              label: copyOrFallback(t, "nearby.detail.backToList", "К объявлениям"),
              onPress: handleBack,
            }}
          />
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
              <Text style={styles.summaryKicker}>
                {copyOrFallback(t, "nearby.create.kicker", "Оформленный запрос")}
              </Text>
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
                <UserAvatar
                  avatarUrl={authorAvatarUrl}
                  label={announcementAuthorLabel}
                  size={34}
                />
                <View style={styles.summaryAuthorCopy}>
                  <Text style={styles.summaryAuthor}>{announcementAuthorLabel}</Text>
                  <Text style={styles.summaryTime}>{formatAgoLong(announcement.createdAt, t)}</Text>
                </View>
              </View>
            </View>

            <View style={styles.mediaCard}>
              <View
                style={[
                  styles.mediaTile,
                  announcement.hasPhoto ? styles.mediaTileActive : styles.mediaTileIdle,
                ]}
              >
                {announcementPhotoUrl ? (
                  <Image source={{ uri: announcementPhotoUrl }} style={styles.mediaImage} />
                ) : (
                  <Ionicons
                    name="document-text-outline"
                    size={24}
                    color={announcement.hasPhoto ? theme.colors.accent : theme.colors.subtext}
                  />
                )}
              </View>
              <View style={styles.mediaCopy}>
                <Text style={styles.sectionLabel}>
                  {copyOrFallback(t, "nearby.detail.photoLabel", "Формат")}
                </Text>
                <Text style={styles.mediaTitle}>
                  {announcement.hasPhoto || announcementPhotoUrl
                    ? copyOrFallback(t, "nearby.detail.photoYes", "С фото")
                    : copyOrFallback(t, "nearby.detail.photoNo", "Без фото")}
                </Text>
                <Text style={styles.mediaBody}>
                  {announcement.hasPhoto || announcementPhotoUrl
                    ? copyOrFallback(
                        t,
                        "nearby.detail.photoWithBody",
                        "Фото помогает быстрее понять формат объявления и контекст встречи."
                      )
                    : copyOrFallback(
                        t,
                        "nearby.detail.photoWithoutBody",
                        "Это текстовое объявление. Весь смысл уже раскрыт в описании ниже."
                      )}
                </Text>
              </View>
            </View>

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
                  value={announcementAuthorLabel}
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
              <Text style={styles.responseTitle}>{responsePresentation.title}</Text>
              <Text style={styles.responseBody}>{responsePresentation.body}</Text>
              {responseError ? (
                <Text style={styles.responseErrorText}>{responseError}</Text>
              ) : null}

              <Pressable
                onPress={() => void handleRespond()}
                disabled={responding}
                style={[
                  responsePresentation.buttonVariant === "secondary"
                    ? styles.secondaryButton
                    : styles.primaryButton,
                  responding ? styles.primaryButtonDisabled : null,
                ]}
              >
                <Text
                  style={
                    responsePresentation.buttonVariant === "secondary"
                      ? styles.secondaryButtonText
                      : styles.primaryButtonText
                  }
                >
                  {responding
                    ? responsePresentation.busyLabel
                    : responsePresentation.actionLabel}
                </Text>
              </Pressable>
            </View>

            <View style={styles.safetyCard}>
              <Text style={styles.safetyTitle}>
                {copyOrFallback(t, "safety.announcementSafetyTitle", "Безопасность")}
              </Text>
              <Text style={styles.safetyBody}>
                {copyOrFallback(
                  t,
                  "safety.announcementSafetyBody",
                  "Если объявление нарушает правила или автор нежелателен, действие сохранится в Firestore."
                )}
              </Text>
              <View style={styles.safetyActions}>
                <Pressable
                  onPress={handleReportAnnouncement}
                  disabled={safetyBusy}
                  style={[styles.safetyButton, safetyBusy ? styles.safetyButtonDisabled : null]}
                >
                  <Text style={styles.safetyButtonText}>
                    {copyOrFallback(t, "safety.report", "Пожаловаться")}
                  </Text>
                </Pressable>
                {announcementAuthorUid && announcementAuthorUid !== currentUid ? (
                  <Pressable
                    onPress={handleBlockAuthor}
                    disabled={safetyBusy}
                    style={[styles.safetyButton, safetyBusy ? styles.safetyButtonDisabled : null]}
                  >
                    <Text style={styles.safetyButtonText}>
                      {copyOrFallback(t, "safety.blockAuthor", "Заблокировать автора")}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          </>
        ) : (
          <View style={styles.centerState}>
            <CoreStateCard
              loading
              icon="document-text-outline"
              title={copyOrFallback(
                t,
                "nearby.detail.loadingTitle",
                "Подтягиваем объявление"
              )}
              body={copyOrFallback(
                t,
                "nearby.detail.loadingBody",
                "Подтягиваем актуальные детали объявления и вернём действие сразу после загрузки."
              )}
            />
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
    gap: 14,
  },
  summaryCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(16, 20, 38, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  summaryKicker: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
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
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  summaryFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 9,
  },
  summaryAuthorCopy: {
    flex: 1,
    gap: 2,
  },
  summaryAuthor: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
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
    padding: 16,
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
  mediaTileIdle: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: theme.colors.borderSubtle,
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
    lineHeight: 18,
  },
  detailsCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(17, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 14,
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
    lineHeight: 22,
  },
  responseCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(25, 19, 35, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.14)",
    gap: 10,
  },
  responseTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  responseBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  responseErrorText: {
    color: "#FCA5A5",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
  },
  safetyCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(12, 16, 30, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 10,
  },
  safetyTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  safetyBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  safetyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  safetyButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  safetyButtonDisabled: {
    opacity: 0.55,
  },
  safetyButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
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
    paddingHorizontal: 8,
  },
});
