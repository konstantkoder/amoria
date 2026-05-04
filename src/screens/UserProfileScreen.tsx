import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type AlertButton,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type RootStackNavigationProp,
  type UserProfileRouteProp,
} from "@/navigation/appRoutes";
import * as announcementsApi from "@/services/api/announcementsApi";
import * as safetyApi from "@/services/api/safetyApi";
import type { SafetyReportReason } from "@/services/api/safetyApi";
import { getUserProfileById } from "@/services/user";
import type { UserProfile } from "@/models/User";
import { theme } from "@/theme";

function buildReportReasonButtons(
  tt: (key: string, fallback: string, params?: Record<string, string>) => string,
  onSelect: (reason: SafetyReportReason) => void
): AlertButton[] {
  return [
    {
      text: tt("safety.reason.spam", "Спам"),
      onPress: () => onSelect("spam"),
    },
    {
      text: tt("safety.reason.harassment", "Оскорбления или преследование"),
      onPress: () => onSelect("harassment"),
    },
    {
      text: tt("safety.reason.sexualServices", "Сексуальные услуги или оплатная встреча"),
      onPress: () => onSelect("sexual_services"),
    },
    {
      text: tt("safety.reason.scam", "Мошенничество"),
      onPress: () => onSelect("scam"),
    },
    {
      text: tt("safety.reason.other", "Другое"),
      onPress: () => onSelect("other"),
    },
    {
      text: tt("common.cancel", "Отмена"),
      style: "cancel",
    },
  ];
}

export default function UserProfileScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"UserProfile">>();
  const route = useRoute<UserProfileRouteProp>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );

  const userId = String(route.params?.userId ?? "").trim();
  const routePeerName = String(route.params?.peerName ?? "").trim();
  const threadId = String(route.params?.threadId ?? "").trim();
  const sourceContext = route.params?.sourceContext;
  const sourceSessionId = String(sourceContext?.sourceSessionId ?? "").trim();
  const myId = authUser?.id ?? "";

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profileLoadError, setProfileLoadError] = useState("");
  const [sourceDetailText, setSourceDetailText] = useState("");
  const [sharedStoryAvailable, setSharedStoryAvailable] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setProfileLoadError("");

    if (!userId) {
      setLoadingProfile(false);
      return () => {
        alive = false;
      };
    }

    setLoadingProfile(true);
    void getUserProfileById(userId)
      .then((nextProfile) => {
        if (!alive) return;
        setProfile(nextProfile);
      })
      .catch(() => {
        if (!alive) return;
        setProfileLoadError(
          tt(
            "profile.peerLoadError",
            "Не удалось загрузить профиль собеседника прямо сейчас."
          )
        );
      })
      .finally(() => {
        if (!alive) return;
        setLoadingProfile(false);
      });

    return () => {
      alive = false;
    };
  }, [tt, userId]);

  useEffect(() => {
    let alive = true;
    if (!myId) {
      setBlockedUserIds([]);
      return () => {
        alive = false;
      };
    }

    void safetyApi.listBlockedUserIds()
      .then((ids) => {
        if (!alive) return;
        setBlockedUserIds(ids);
      })
      .catch(() => {
        if (!alive) return;
        setBlockedUserIds([]);
      });

    return () => {
      alive = false;
    };
  }, [myId, reloadKey]);

  useEffect(() => {
    let alive = true;
    setSourceDetailText("");
    setSharedStoryAvailable(false);

    if (!sourceContext?.source || !sourceSessionId) {
      return () => {
        alive = false;
      };
    }

    async function loadSourceDetail() {
      try {
        if (sourceContext.source === "play") {
          if (alive) {
            setSharedStoryAvailable(true);
          }

          if (sourceContext.artworkSummary?.strokeCount != null) {
            return tt("dm.sourceDrawingStrokeContext", "Общий рисунок: {count} штрихов", {
              count: String(sourceContext.artworkSummary.strokeCount),
            });
          }

          return "";
        }

        if (sourceContext.source === "announcement") {
          const announcement = await announcementsApi.getAnnouncement(sourceSessionId);
          return announcement.title?.trim() ?? "";
        }

        if (sourceContext.source === "nearby") {
          return "";
        }
      } catch {
        return "";
      }

      return "";
    }

    void loadSourceDetail().then((value) => {
      if (!alive) return;
      setSourceDetailText(value);
    });

    return () => {
      alive = false;
    };
  }, [sourceContext?.artworkSummary?.strokeCount, sourceContext?.source, sourceSessionId, tt]);

  const displayName =
    profile?.displayName?.trim() ||
    routePeerName ||
    tt("profile.amoriaUser", "Пользователь Amoria");
  const amoriaId = profile?.amoriaId?.trim() ?? "";
  const avatarUrl = profile?.avatarUrl ?? "";
  const photos = profile?.photos ?? [];
  const about = profile?.about?.trim() || tt("profile.publicNoDescription", "Описание пока не добавлено.");
  const isBlocked = Boolean(userId && blockedUserIds.includes(userId));
  const hasThread = Boolean(threadId && userId);

  const sourceTitle = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt("profile.sourceAnnouncement", "Вы начали разговор после объявления");
    }
    if (sourceContext?.source === "nearby") {
      return tt("profile.sourceNearby", "Вы начали разговор из Рядом");
    }
    if (sourceContext?.source !== "play") return "";
    if (sourceContext.artworkSummary?.activity === "color_mood") {
      return tt("profile.sourceColorMood", "Вы познакомились через палитру настроения");
    }
    return tt("profile.sourceSharedDrawing", "Вы познакомились через общий рисунок");
  }, [sourceContext?.artworkSummary?.activity, sourceContext?.source, tt]);

  const sourceBody = useMemo(() => {
    if (sourceDetailText) {
      return tt("profile.sourceDetail", "Контекст: {context}", {
        context: sourceDetailText,
      });
    }
    if (sourceContext?.source === "play" && sourceSessionId) {
      return tt(
        "profile.sourceSharedStoryBody",
        "Общая история связана с этим чатом и доступна, когда сохранённая сессия загружена."
      );
    }
    return tt(
      "profile.sourceFallbackBody",
      "Контекст знакомства сохранён в этом чате."
    );
  }, [sourceContext?.source, sourceDetailText, sourceSessionId, tt]);

  const openChat = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (!threadId || !userId) return;
    navigation.replace("DMChat", {
      threadId,
      peerId: userId,
      peerName: displayName,
      ...(sourceContext ? { sourceContext } : {}),
    });
  }, [displayName, navigation, sourceContext, threadId, userId]);

  const openSharedStory = useCallback(() => {
    if (!sourceSessionId || !sharedStoryAvailable) return;
    navigation.navigate("PlaySessionDetail", { sessionId: sourceSessionId });
  }, [navigation, sharedStoryAvailable, sourceSessionId]);

  const reportUser = useCallback(
    async (reason: SafetyReportReason) => {
      if (!userId || safetyBusy) return;

      setSafetyBusy(true);
      try {
        await safetyApi.report({
          targetType: "user",
          targetId: userId,
          targetOwnerUid: userId,
          reason,
        });
        Alert.alert(
          tt("safety.reportSentTitle", "Жалоба отправлена"),
          tt("safety.reportSentBody", "Спасибо. Жалоба сохранена и будет доступна для проверки.")
        );
      } catch {
        Alert.alert(
          tt("safety.reportErrorTitle", "Жалоба не отправилась"),
          tt(
            "safety.reportErrorBody",
            "Не удалось сохранить жалобу. Попробуй ещё раз позже."
          )
        );
      } finally {
        setSafetyBusy(false);
      }
    },
    [safetyBusy, tt, userId]
  );

  const handleReportUser = useCallback(() => {
    Alert.alert(
      tt("safety.reportTitle", "Пожаловаться"),
      tt("safety.reportBody", "Выбери причину жалобы."),
      buildReportReasonButtons(tt, (reason) => void reportUser(reason))
    );
  }, [reportUser, tt]);

  const handleBlockUser = useCallback(() => {
    if (!userId || userId === myId) return;
    Alert.alert(
      tt("safety.blockTitle", "Заблокировать пользователя?"),
      tt(
        "safety.blockBody",
        "Вы больше не будете видеть его объявления в обычном списке, а личные чаты будут скрыты из вкладки «Чаты»."
      ),
      [
        {
          text: tt("common.cancel", "Отмена"),
          style: "cancel",
        },
        {
          text: tt("safety.blockConfirm", "Заблокировать"),
          style: "destructive",
          onPress: () => {
            setSafetyBusy(true);
            void safetyApi.blockUser(userId)
              .then(() => {
                setBlockedUserIds((current) =>
                  current.includes(userId) ? current : [...current, userId]
                );
                setReloadKey((prev) => prev + 1);
                Alert.alert(
                  tt("safety.userBlockedTitle", "Пользователь заблокирован"),
                  tt(
                    "safety.userBlockedBody",
                    "Этот пользователь скрыт из релизных списков на вашем аккаунте."
                  )
                );
              })
              .catch(() => {
                Alert.alert(
                  tt("safety.blockErrorTitle", "Не удалось заблокировать"),
                  tt(
                    "safety.blockErrorBody",
                    "Блокировка не сохранилась. Попробуй ещё раз позже."
                  )
                );
              })
              .finally(() => setSafetyBusy(false));
          },
        },
      ]
    );
  }, [myId, tt, userId]);

  if (!userId) {
    return (
      <ScreenShell
        title={tt("profile.peerTitle", "Профиль собеседника")}
        background="profile"
        showBack
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("profile.peerUnavailableTitle", "Профиль недоступен")}
            body={tt(
              "profile.peerUnavailableBody",
              "Не удалось открыть профиль без идентификатора пользователя."
            )}
            primaryAction={{ label: tt("common.back", "Назад"), onPress: () => navigation.goBack() }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={tt("profile.peerTitle", "Профиль собеседника")}
      background="profile"
      overlayOpacity={0.16}
      showBack
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.avatarRow}>
            <UserAvatar avatarUrl={avatarUrl} label={displayName} size={112} />
            <View style={styles.avatarCopy}>
              <Text style={styles.kicker}>
                {tt("profile.peerTitle", "Профиль собеседника")}
              </Text>
              <Text style={styles.displayName}>{displayName}</Text>
              {amoriaId ? (
                <Text style={styles.amoriaIdText}>
                  {tt("profile.amoriaId", "Amoria ID")}: {amoriaId}
                </Text>
              ) : null}
              <Text style={styles.avatarHint}>
                {avatarUrl
                  ? tt("profile.avatarAvailable", "Фото профиля загружено")
                  : tt("photos.avatarPlaceholder", "Пока без фото профиля")}
              </Text>
            </View>
          </View>

          {loadingProfile ? (
            <Text style={styles.mutedText}>
              {tt("profile.peerLoading", "Загружаем профиль…")}
            </Text>
          ) : profileLoadError ? (
            <Text style={styles.errorText}>{profileLoadError}</Text>
          ) : null}

          <Text style={styles.about}>{about}</Text>
        </View>

        {sourceTitle ? (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>{tt("profile.sourceKicker", "Контекст знакомства")}</Text>
            <Text style={styles.cardTitle}>{sourceTitle}</Text>
            <Text style={styles.cardText}>{sourceBody}</Text>
          </View>
        ) : null}

        {sharedStoryAvailable && sourceSessionId ? (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>{tt("profile.sharedStoryKicker", "Общая история")}</Text>
            <Text style={styles.cardTitle}>
              {tt("profile.sharedStoryTitle", "Общая история сохранена")}
            </Text>
            <Text style={styles.cardText}>
              {tt(
                "profile.sharedStoryBody",
                "Можно открыть сохранённый общий рисунок или палитру, если хочется вернуться к контексту знакомства."
              )}
            </Text>
            <TouchableOpacity
              onPress={openSharedStory}
              style={styles.secondaryButton}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>
                {tt("play.result.openSharedStory", "Открыть общую историю")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {photos.length ? (
          <View style={styles.galleryCard}>
            <Text style={styles.cardTitle}>{tt("profile.publicPhotos", "Фото")}</Text>
            <View style={styles.galleryGrid}>
              {photos.map((photo, index) => (
                <Image
                  key={`${photo.mediaId ?? photo.url}-${index}`}
                  source={{ uri: photo.url }}
                  style={styles.galleryPhoto}
                />
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          {hasThread ? (
            <Pressable onPress={openChat} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {navigation.canGoBack()
                  ? tt("profile.backToChat", "Вернуться в чат")
                  : tt("common.openChat", "Открыть чат")}
              </Text>
            </Pressable>
          ) : null}

          <View style={styles.safetyActions}>
            <TouchableOpacity
              onPress={handleReportUser}
              disabled={safetyBusy}
              style={[styles.safetyButton, safetyBusy ? styles.disabledButton : null]}
              activeOpacity={0.85}
            >
              <Text style={styles.safetyButtonText}>
                {tt("safety.report", "Пожаловаться")}
              </Text>
            </TouchableOpacity>
            {!isBlocked && userId !== myId ? (
              <TouchableOpacity
                onPress={handleBlockUser}
                disabled={safetyBusy}
                style={[styles.safetyButton, safetyBusy ? styles.disabledButton : null]}
                activeOpacity={0.85}
              >
                <Text style={styles.safetyButtonText}>
                  {tt("safety.blockUser", "Заблокировать пользователя")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingBottom: 28,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  heroCard: {
    backgroundColor: "rgba(8, 12, 24, 0.78)",
    borderRadius: theme.shapes.card,
    padding: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 14,
  },
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  avatarCopy: {
    flex: 1,
    gap: 6,
  },
  kicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  displayName: {
    color: theme.colors.text,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: "900",
  },
  avatarHint: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  amoriaIdText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  mutedText: {
    color: theme.colors.muted,
    fontSize: 13,
  },
  errorText: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  about: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  card: {
    backgroundColor: "rgba(10, 14, 26, 0.88)",
    borderRadius: theme.shapes.card,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },
  cardKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  cardText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  galleryCard: {
    backgroundColor: "rgba(10, 14, 26, 0.82)",
    borderRadius: theme.shapes.card,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 12,
  },
  galleryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  galleryPhoto: {
    width: "48.2%",
    aspectRatio: 1,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  safetyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  safetyButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  disabledButton: {
    opacity: 0.55,
  },
  safetyButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
