import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type AlertButton,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import CoreStateCard from "@/components/CoreStateCard";
import {
  GOAL_LABEL_FALLBACKS,
  GOAL_LABEL_KEYS,
  MOOD_LABEL_FALLBACKS,
  MOOD_LABEL_KEYS,
} from "@/config/profileFields";
import ScreenShell from "@/components/ScreenShell";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type RootStackNavigationProp,
  type UserProfileRouteProp,
} from "@/navigation/appRoutes";
import * as announcementsApi from "@/services/api/announcementsApi";
import { ApiError } from "@/services/api/apiClient";
import * as chatApi from "@/services/api/chatApi";
import { reportClientError } from "@/services/api/clientErrorsApi";
import { unlockUserLockedGallery } from "@/services/api/publicUsersApi";
import * as safetyApi from "@/services/api/safetyApi";
import type { SafetyReportReason } from "@/services/api/safetyApi";
import { getUserProfile, getUserProfileById } from "@/services/user";
import {
  buildProfileCompatibilityHints,
  type CompatibilityReason,
} from "@/services/profileCompatibility";
import {
  getPublicMediaUrlInfo,
  normalizeAuthenticatedLockedMediaUrl,
  probePublicMediaUrlInfo,
  type PublicMediaUrlInfo,
} from "@/services/media/mediaUrl";
import type { Goal, Mood, UserProfile, UserProfilePhoto } from "@/models/User";
import { theme } from "@/theme";
import { makeAndroidSafeReportReasonButtons } from "@/utils/safetyReportReasonAlert";

function buildReportReasonButtons(
  tt: (key: string, fallback: string, params?: Record<string, string>) => string,
  onSelect: (reason: SafetyReportReason) => void
): AlertButton[] {
  return makeAndroidSafeReportReasonButtons([
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
  ],
  tt("safety.reportTitle", "Пожаловаться"),
  tt("safety.reportBody", "Выбери причину жалобы."),
  tt("safety.moreReasons", "Другие причины…"));
}

function isTogetherSource(source: unknown): boolean {
  return source === "together" || source === "play";
}

function translatedProfileOptionLabel(
  t: (key: string) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

type ProfileLoadState = "loading" | "ready" | "blocked" | "not_found" | "network";

function getLockedMediaUrlInfo(value: unknown, mediaId?: string): PublicMediaUrlInfo {
  const url = normalizeAuthenticatedLockedMediaUrl(value, "peer locked photo URL");
  if (!url) {
    return {
      urlKind: "invalid",
      ...(mediaId ? { mediaId } : {}),
    };
  }

  return {
    url,
    urlKind: "relative",
    ...(mediaId ? { mediaId } : {}),
  };
}

function PeerPublicPhoto({
  photo,
  index,
  failed,
  failedLabel,
  onLoadFailed,
  requestHeaders,
}: {
  photo: UserProfilePhoto;
  index: number;
  failed: boolean;
  failedLabel: string;
  onLoadFailed: (photo: UserProfilePhoto) => void;
  requestHeaders?: Record<string, string>;
}) {
  const urlInfo = useMemo(() => {
    if (photo.visibility === "locked") {
      return getLockedMediaUrlInfo(photo.url, photo.mediaId);
    }

    return getPublicMediaUrlInfo(photo.url, "peer public photo URL");
  }, [photo.mediaId, photo.url, photo.visibility]);
  const [state, setState] = useState<"idle" | "loading" | "loaded" | "error">(
    urlInfo.url ? "idle" : "error"
  );

  useEffect(() => {
    setState(urlInfo.url ? "idle" : "error");
  }, [urlInfo.url]);

  useEffect(() => {
    if (!urlInfo.url) {
      onLoadFailed(photo);
    }
  }, [onLoadFailed, photo, urlInfo.url]);

  const imageFailed = failed || state === "error";
  const imageLoading = !imageFailed && urlInfo.url && (state === "idle" || state === "loading");

  return (
    <View style={styles.galleryPhoto}>
      {urlInfo.url && !imageFailed ? (
        <Image
          source={
            requestHeaders
              ? { uri: urlInfo.url, headers: requestHeaders }
              : { uri: urlInfo.url }
          }
          style={styles.galleryPhotoImage}
          resizeMode="cover"
          onLoadStart={() => setState("loading")}
          onLoad={() => setState("loaded")}
          onError={() => {
            setState("error");
            onLoadFailed(photo);
          }}
          accessibilityLabel={`peer-profile-photo-${index + 1}`}
        />
      ) : null}
      {imageLoading ? (
        <View style={styles.galleryPhotoLoading}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}
      {imageFailed ? (
        <View style={styles.galleryPhotoFailedOverlay}>
          <Text style={styles.galleryPhotoFailedText}>{failedLabel}</Text>
        </View>
      ) : null}
    </View>
  );
}

function isProfileUnavailableError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 403 &&
    (error.code === "profile_unavailable" || error.code === "user_blocked")
  );
}

export default function UserProfileScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"UserProfile">>();
  const route = useRoute<UserProfileRouteProp>();
  const { user: authUser, accessToken } = useAuth();
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
  const nearbyCanMessage = route.params?.nearbyCanMessage !== false;
  const sourceSessionId = String(sourceContext?.sourceSessionId ?? "").trim();
  const myId = authUser?.id ?? "";
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [selfProfile, setSelfProfile] = useState<UserProfile | null>(null);
  const [profileLoadState, setProfileLoadState] = useState<ProfileLoadState>("loading");
  const [sourceDetailText, setSourceDetailText] = useState("");
  const [sharedStoryAvailable, setSharedStoryAvailable] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [failedPublicPhotoIds, setFailedPublicPhotoIds] = useState<string[]>([]);
  const [failedLockedPhotoIds, setFailedLockedPhotoIds] = useState<string[]>([]);
  const [nearbyChatOpening, setNearbyChatOpening] = useState(false);
  const [lockedGalleryModalVisible, setLockedGalleryModalVisible] = useState(false);
  const [lockedGalleryPassword, setLockedGalleryPassword] = useState("");
  const [lockedGalleryUnlocking, setLockedGalleryUnlocking] = useState(false);
  const [lockedGalleryError, setLockedGalleryError] = useState("");
  const [lockedGalleryOpened, setLockedGalleryOpened] = useState(false);
  const [lockedGalleryUnlockToken, setLockedGalleryUnlockToken] = useState("");
  const [unlockedLockedPhotos, setUnlockedLockedPhotos] = useState<UserProfilePhoto[]>([]);
  const reportedMediaFailuresRef = React.useRef<Set<string>>(new Set());
  const activeUserIdRef = React.useRef(userId);

  useEffect(() => {
    let alive = true;
    void getUserProfile({ allowCached: false })
      .then((nextProfile) => {
        if (alive) setSelfProfile(nextProfile);
      })
      .catch(() => {
        if (alive) setSelfProfile(null);
      });
    return () => {
      alive = false;
    };
  }, [myId, reloadKey]);

  useEffect(() => {
    activeUserIdRef.current = userId;
  }, [userId]);

  useEffect(() => {
    if (accessToken && myId) return;

    setFailedLockedPhotoIds([]);
    setLockedGalleryModalVisible(false);
    setLockedGalleryPassword("");
    setLockedGalleryError("");
    setLockedGalleryOpened(false);
    setLockedGalleryUnlockToken("");
    setUnlockedLockedPhotos([]);
  }, [accessToken, myId]);

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setAvatarLoadFailed(false);
    setFailedPublicPhotoIds([]);
    setFailedLockedPhotoIds([]);
    setLockedGalleryModalVisible(false);
    setLockedGalleryPassword("");
    setLockedGalleryError("");
    setLockedGalleryOpened(false);
    setLockedGalleryUnlockToken("");
    setUnlockedLockedPhotos([]);
    reportedMediaFailuresRef.current.clear();

    if (!userId) {
      setProfileLoadState("not_found");
      return () => {
        alive = false;
      };
    }

    setProfileLoadState("loading");
    void getUserProfileById(userId)
      .then((nextProfile) => {
        if (!alive) return;
        setProfile(nextProfile);
        setProfileLoadState(nextProfile ? "ready" : "not_found");
      })
      .catch((error) => {
        if (!alive) return;
        if (isProfileUnavailableError(error)) {
          setProfileLoadState("blocked");
          return;
        }
        if (error instanceof ApiError && error.status === 404) {
          setProfileLoadState("not_found");
          return;
        }
        setProfileLoadState("network");
      });

    return () => {
      alive = false;
    };
  }, [reloadKey, userId]);

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
        if (isTogetherSource(sourceContext.source)) {
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
  const avatarUrl = profile?.avatarUrl ?? "";
  const photos = profile?.photos ?? [];
  const lockedGallery = profile?.lockedGallery;
  const lockedGalleryAvailable = Boolean(
    lockedGallery?.enabled && (lockedGallery.count ?? 0) > 0
  );
  const about = profile?.about?.trim() || tt("profile.publicNoDescription", "Описание пока не добавлено.");
  const goalLabel = profile?.goal
    ? translatedProfileOptionLabel(
        t,
        GOAL_LABEL_KEYS[profile.goal as Goal],
        GOAL_LABEL_FALLBACKS[profile.goal as Goal]
      )
    : "";
  const moodLabel = profile?.mood
    ? translatedProfileOptionLabel(
        t,
        MOOD_LABEL_KEYS[profile.mood as Mood],
        MOOD_LABEL_FALLBACKS[profile.mood as Mood]
      )
    : "";
  const compatibility = useMemo(
    () => buildProfileCompatibilityHints(selfProfile, profile),
    [profile, selfProfile]
  );
  const compatibilityReasonText = useCallback(
    (reason: CompatibilityReason) => {
      if (reason.kind === "goal" && reason.value) {
        const value = translatedProfileOptionLabel(
          t,
          GOAL_LABEL_KEYS[reason.value as Goal],
          GOAL_LABEL_FALLBACKS[reason.value as Goal]
        );
        return tt("compatibility.reasonGoal", "Одинаковая цель: {value}", { value });
      }
      if (reason.kind === "mood" && reason.value) {
        const value = translatedProfileOptionLabel(
          t,
          MOOD_LABEL_KEYS[reason.value as Mood],
          MOOD_LABEL_FALLBACKS[reason.value as Mood]
        );
        return tt("compatibility.reasonMood", "Похожее настроение: {value}", { value });
      }
      if (reason.kind === "interest" && reason.value) {
        return tt("compatibility.reasonInterest", "Общий интерес: {value}", {
          value: reason.value,
        });
      }
      return tt(
        "compatibility.reasonAge",
        "Подходит по возрастному фильтру"
      );
    },
    [t, tt]
  );
  const publicAgeLabel = typeof profile?.age === "number" && Number.isInteger(profile.age)
    ? tt("profile.publicAgeGroup", "Возраст: {group}", { group: String(profile.age) })
    : "";
  const profileFacts = [
    publicAgeLabel,
    goalLabel ? tt("profile.publicGoal", "Цель: {goal}", { goal: goalLabel }) : "",
    moodLabel ? tt("profile.publicMood", "Настроение: {mood}", { mood: moodLabel }) : "",
  ].filter(Boolean);
  const isBlocked = Boolean(userId && blockedUserIds.includes(userId));
  const profileUnavailable = isBlocked || profileLoadState === "blocked";
  const hasThread = Boolean(threadId && userId);
  const canStartNearbyChat = Boolean(
    sourceContext?.source === "nearby" &&
      !hasThread &&
      nearbyCanMessage &&
      myId &&
      userId &&
      userId !== myId &&
      !isBlocked
  );
  const lockedGalleryUnlockDisabled =
    lockedGalleryUnlocking || lockedGalleryPassword.trim().length === 0;
  const lockedGalleryImageHeaders = useMemo(() => {
    if (!accessToken || !lockedGalleryUnlockToken) return undefined;

    return {
      Authorization: `Bearer ${accessToken}`,
      "x-amoria-locked-gallery-token": lockedGalleryUnlockToken,
    };
  }, [accessToken, lockedGalleryUnlockToken]);

  const reportPeerMediaLoadFailed = useCallback(
    (
      step: "avatarLoadFailed" | "publicPhotoLoadFailed" | "lockedPhotoLoadFailed",
      input: {
        mediaId?: string;
        urlInfo?: PublicMediaUrlInfo;
        visibility?: string;
        moderationStatus?: string;
      } = {}
    ) => {
      const mediaId = input.mediaId ?? input.urlInfo?.mediaId;
      const reportKey = `${step}:${mediaId ?? input.urlInfo?.urlKind ?? "avatar"}`;
      if (reportedMediaFailuresRef.current.has(reportKey)) return;
      reportedMediaFailuresRef.current.add(reportKey);

      const urlInfo = input.urlInfo ?? {
        urlKind: "invalid" as const,
        ...(mediaId ? { mediaId } : {}),
      };

      void probePublicMediaUrlInfo(urlInfo).then((probe) => {
        reportClientError({
          screen: "UserProfileScreen",
          action:
            step === "avatarLoadFailed"
              ? "loadAvatar"
              : step === "lockedPhotoLoadFailed"
              ? "loadLockedPhoto"
              : "loadPublicPhoto",
          step: "imageLoadFailed",
          message: "User profile media failed to load",
          metadata: {
            hasAvatarUrl: Boolean(avatarUrl),
            photoCount: photos.length,
            ...(mediaId ? { mediaId } : {}),
            urlKind: probe.urlKind ?? input.urlInfo?.urlKind ?? "unknown",
            httpStatus: probe.httpStatus ?? null,
            contentType: probe.contentType ?? null,
            visibility:
              input.visibility ??
              (step === "avatarLoadFailed"
                ? "avatar"
                : step === "lockedPhotoLoadFailed"
                ? "locked"
                : "public"),
          },
        });
      });
    },
    [avatarUrl, photos.length]
  );

  const markPublicPhotoFailed = useCallback(
    (photo: UserProfilePhoto) => {
      setFailedPublicPhotoIds((current) =>
        current.includes(photo.mediaId) ? current : [...current, photo.mediaId]
      );
      reportPeerMediaLoadFailed("publicPhotoLoadFailed", {
        mediaId: photo.mediaId,
        urlInfo: getPublicMediaUrlInfo(photo.url, "peer public photo URL"),
        visibility: photo.visibility ?? "public",
      });
    },
    [reportPeerMediaLoadFailed]
  );

  const markLockedPhotoFailed = useCallback(
    (photo: UserProfilePhoto) => {
      setFailedLockedPhotoIds((current) =>
        current.includes(photo.mediaId) ? current : [...current, photo.mediaId]
      );
      reportPeerMediaLoadFailed("lockedPhotoLoadFailed", {
        mediaId: photo.mediaId,
        urlInfo: getLockedMediaUrlInfo(photo.url, photo.mediaId),
        visibility: "locked",
      });
    },
    [reportPeerMediaLoadFailed]
  );

  const sourceTitle = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt("profile.sourceAnnouncement", "Вы начали разговор после объявления");
    }
    if (sourceContext?.source === "nearby") {
      return tt("profile.sourceNearby", "Вы начали разговор из Рядом");
    }
    if (!isTogetherSource(sourceContext?.source)) return "";
    if (sourceContext.artworkSummary?.activity === "story_sparks") {
      return tt("profile.sourceStorySparks", "Вы познакомились через историю на двоих");
    }
    return tt("profile.sourceSharedDrawing", "Вы познакомились через общий рисунок");
  }, [sourceContext?.artworkSummary?.activity, sourceContext?.source, tt]);

  const sourceBody = useMemo(() => {
    if (sourceDetailText) {
      return tt("profile.sourceDetail", "Контекст: {context}", {
        context: sourceDetailText,
      });
    }
    if (isTogetherSource(sourceContext?.source) && sourceSessionId) {
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

  const openNearbyChat = useCallback(async () => {
    if (!canStartNearbyChat || nearbyChatOpening) return;

    setNearbyChatOpening(true);
    try {
      const thread = await chatApi.openDirectThread(userId, {
        type: "nearby",
        sourceId: userId,
      });
      navigation.navigate("DMChat", {
        threadId: thread.id,
        peerId: userId,
        peerName: displayName,
        sourceContext: { source: "nearby" },
      });
    } catch {
      Alert.alert(
        tt("now.chatFailedTitle", "Не удалось открыть чат"),
        tt(
          "now.chatFailedBody",
          "Не удалось открыть реальный личный чат из этого статуса рядом. Попробуй позже."
        )
      );
    } finally {
      setNearbyChatOpening(false);
    }
  }, [canStartNearbyChat, displayName, navigation, nearbyChatOpening, tt, userId]);

  const openLockedGalleryModal = useCallback(() => {
    setLockedGalleryError("");
    setLockedGalleryPassword("");
    setLockedGalleryModalVisible(true);
  }, []);

  const closeLockedGalleryModal = useCallback(() => {
    setLockedGalleryModalVisible(false);
    setLockedGalleryPassword("");
    setLockedGalleryError("");
  }, []);

  const handleUnlockLockedGallery = useCallback(async () => {
    const password = lockedGalleryPassword.trim();
    const targetUserId = userId;
    if (!targetUserId || !password || lockedGalleryUnlocking) return;

    setLockedGalleryUnlocking(true);
    setLockedGalleryError("");
    try {
      const response = await unlockUserLockedGallery(targetUserId, password);
      if (activeUserIdRef.current !== targetUserId) return;

      const normalizedPhotos: UserProfilePhoto[] = response.photos.map((photo) => ({
        mediaId: photo.mediaId,
        url: photo.url,
        position: photo.position,
        visibility: "locked",
      }));

      setUnlockedLockedPhotos(normalizedPhotos);
      setFailedLockedPhotoIds([]);
      setLockedGalleryUnlockToken(response.unlockToken);
      setLockedGalleryOpened(true);
      setLockedGalleryModalVisible(false);
      setLockedGalleryPassword("");
      setLockedGalleryError("");
    } catch {
      if (activeUserIdRef.current !== targetUserId) return;
      setLockedGalleryError(
        tt(
          "profile.lockedGalleryUnlockError",
          "Пароль не подошёл или доступ недоступен."
        )
      );
    } finally {
      if (activeUserIdRef.current === targetUserId) {
        setLockedGalleryUnlocking(false);
      }
    }
  }, [lockedGalleryPassword, lockedGalleryUnlocking, tt, userId]);

  const openSharedStory = useCallback(() => {
    if (!sourceSessionId || !sharedStoryAvailable) return;
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation, sharedStoryAvailable, sourceSessionId]);

  const reportUser = useCallback(
    async (reason: SafetyReportReason) => {
      if (!userId || safetyBusy) return;

      setSafetyBusy(true);
      try {
        await safetyApi.report({
          targetType: "user",
          targetId: userId,
          targetOwnerUserId: userId,
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
        background="profileArchGardenV6"
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

  if (profileUnavailable) {
    return (
      <ScreenShell
        title={tt("profile.peerTitle", "Профиль собеседника")}
        background="profileArchGardenV6"
        showBack
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="lock-closed-outline"
            title={tt("profile.blockedUnavailableTitle", "Профиль недоступен")}
            body={tt(
              "profile.blockedUnavailableBody",
              "Вы не можете просматривать профиль этого пользователя."
            )}
            primaryAction={{ label: tt("common.back", "Назад"), onPress: () => navigation.goBack() }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (profileLoadState === "loading") {
    return (
      <ScreenShell
        title={tt("profile.peerTitle", "Профиль собеседника")}
        background="profileArchGardenV6"
        showBack
      >
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            title={tt("profile.peerLoadingTitle", "Загружаем профиль")}
            body={tt("profile.peerLoading", "Загружаем профиль…")}
          />
        </View>
      </ScreenShell>
    );
  }

  if (profileLoadState === "network") {
    return (
      <ScreenShell
        title={tt("profile.peerTitle", "Профиль собеседника")}
        background="profileArchGardenV6"
        showBack
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("profile.loadFailedTitle", "Не удалось загрузить профиль")}
            body={tt(
              "profile.loadFailedBody",
              "Проверь соединение и попробуй ещё раз."
            )}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: () => navigation.goBack() }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (profileLoadState === "not_found" || !profile) {
    return (
      <ScreenShell
        title={tt("profile.peerTitle", "Профиль собеседника")}
        background="profileArchGardenV6"
        showBack
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("profile.notFoundTitle", "Профиль не найден")}
            body={tt("profile.notFoundBody", "Этот профиль больше недоступен.")}
            primaryAction={{ label: tt("common.back", "Назад"), onPress: () => navigation.goBack() }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={tt("profile.peerTitle", "Профиль собеседника")}
      background="profileArchGardenV6"
      showBack
    >
      <>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.avatarRow}>
            <UserAvatar
              avatarUrl={avatarUrl}
              label={displayName}
              size={112}
              onLoadError={(urlInfo) => {
                setAvatarLoadFailed(true);
                reportPeerMediaLoadFailed("avatarLoadFailed", { urlInfo, visibility: "avatar" });
              }}
            />
            <View style={styles.avatarCopy}>
              <Text style={styles.kicker}>
                {tt("profile.peerTitle", "Профиль собеседника")}
              </Text>
              <Text style={styles.displayName}>{displayName}</Text>
              {profileFacts.map((item) => (
                <Text key={item} style={styles.amoriaIdText}>{item}</Text>
              ))}
              <Text style={styles.avatarHint}>
                {avatarLoadFailed
                  ? tt("profile.peerMediaLoadFailed", "Фото не загрузилось. Мы уже сохранили ошибку для проверки.")
                  : avatarUrl
                  ? tt("profile.avatarAvailable", "Фото профиля загружено")
                  : tt("photos.avatarPlaceholder", "Пока без фото профиля")}
              </Text>
            </View>
          </View>

          <Text style={styles.about}>{about}</Text>
          {profile.interests.length ? (
            <View style={styles.interestChips}>
              {profile.interests.map((interest) => (
                <View key={interest} style={styles.interestChip}>
                  <Text style={styles.interestText}>{interest}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {compatibility.count > 0 ? (
          <View style={[styles.card, styles.compatibilityCard]}>
            <View style={styles.compatibilityHeader}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.textAccent} />
              <Text style={styles.cardTitle}>
                {tt("compatibility.cardTitle", "Почему вы можете подойти")}
              </Text>
            </View>
            <Text style={styles.cardText}>
              {tt(
                "compatibility.cardBody",
                "Это не рейтинг, а реальные совпадения из открытой анкеты."
              )}
            </Text>
            <View style={styles.compatibilityReasons}>
              {compatibility.reasons.map((reason, index) => (
                <View key={`${reason.kind}-${reason.value ?? ""}-${index}`} style={styles.compatibilityReason}>
                  <Text style={styles.compatibilityReasonText}>
                    {compatibilityReasonText(reason)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {sourceTitle ? (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>{tt("profile.sourceKicker", "Контекст знакомства")}</Text>
            <Text style={styles.cardTitle}>{sourceTitle}</Text>
            <Text style={styles.cardText}>{sourceBody}</Text>
          </View>
        ) : null}

        {false && sharedStoryAvailable && sourceSessionId ? (
          <View style={styles.card}>
            <Text style={styles.cardKicker}>{tt("profile.sharedStoryKicker", "Общая история")}</Text>
            <Text style={styles.cardTitle}>
              {tt("profile.sharedStoryTitle", "Общая история сохранена")}
            </Text>
            <Text style={styles.cardText}>
              {tt(
                "profile.sharedStoryBody",
                "Можно открыть сохранённую общую историю, если хочется вернуться к контексту знакомства."
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

        <View style={styles.galleryCard}>
          <Text style={styles.cardTitle}>{tt("profile.publicPhotos", "Фото")}</Text>
          {photos.length ? (
            <View style={styles.galleryGrid}>
              {photos.map((photo, index) => (
                <PeerPublicPhoto
                  key={`${photo.mediaId ?? photo.url}-${index}`}
                  photo={photo}
                  index={index}
                  failed={failedPublicPhotoIds.includes(photo.mediaId)}
                  failedLabel={tt("profile.peerMediaLoadFailedShort", "Фото не загрузилось")}
                  onLoadFailed={markPublicPhotoFailed}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.cardText}>
              {tt("profile.publicPhotosEmpty", "Публичные фото пока не добавлены")}
            </Text>
          )}
        </View>

        {lockedGalleryAvailable && !lockedGalleryOpened ? (
          <View style={[styles.galleryCard, styles.lockedFolderCard]}>
            <View style={styles.lockedFolderHeader}>
              <View style={styles.lockedFolderIcon}>
                <Ionicons
                  name="lock-closed-outline"
                  size={22}
                  color={theme.colors.textAccent}
                />
              </View>
              <View style={styles.lockedFolderCopy}>
                <Text style={styles.lockedFolderTitle}>
                  {tt("profile.lockedGalleryFolderTitle", "Закрытая папка")}
                </Text>
                <Text style={styles.cardText}>
                  {tt(
                    "profile.lockedGalleryFolderBody",
                    "{count} приватных фото. Открывается только если владелец дал пароль.",
                    { count: String(lockedGallery?.count ?? 0) }
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.lockedFolderActions}>
              <TouchableOpacity
                onPress={openLockedGalleryModal}
                style={styles.lockedFolderButton}
                activeOpacity={0.85}
              >
                <Text style={styles.lockedFolderButtonText}>
                  {tt("profile.lockedGalleryOpenWithPassword", "Открыть по паролю")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {lockedGalleryOpened ? (
          <View style={[styles.galleryCard, styles.lockedGalleryOpenedCard]}>
            <Text style={styles.cardTitle}>
              {tt("profile.lockedGalleryOpenedTitle", "Закрытая папка открыта")}
            </Text>
            <Text style={styles.cardText}>
              {unlockedLockedPhotos.length
                ? tt(
                    "profile.lockedGalleryOpenedBody",
                    "Фото доступны в этом просмотре."
                  )
                : tt(
                    "profile.lockedGalleryOpenedEmpty",
                    "Папка открыта, но фото сейчас недоступны."
                  )}
            </Text>
            {unlockedLockedPhotos.length ? (
              <View style={styles.galleryGrid}>
                {unlockedLockedPhotos.map((photo, index) => (
                  <PeerPublicPhoto
                    key={`locked-${photo.mediaId ?? photo.url}-${index}`}
                    photo={photo}
                    index={index}
                    failed={failedLockedPhotoIds.includes(photo.mediaId)}
                    failedLabel={tt(
                      "profile.lockedPhotoLoadFailed",
                      "Это закрытое фото не загрузилось."
                    )}
                    onLoadFailed={markLockedPhotoFailed}
                    requestHeaders={lockedGalleryImageHeaders}
                  />
                ))}
              </View>
            ) : null}
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

          {canStartNearbyChat ? (
            <Pressable
              onPress={() => void openNearbyChat()}
              disabled={nearbyChatOpening}
              style={[styles.primaryButton, nearbyChatOpening ? styles.disabledButton : null]}
            >
              <Text style={styles.primaryButtonText}>
                {nearbyChatOpening
                  ? tt("nearby.detail.openingChat", "Открываем чат...")
                  : tt("nearby.message", "Написать")}
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
      <Modal
        visible={lockedGalleryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeLockedGalleryModal}
      >
        <View style={styles.lockedGalleryModalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            onPress={closeLockedGalleryModal}
          />
          <View style={styles.lockedGallerySheet}>
            <View style={styles.lockedGallerySheetHandle} />
            <Text style={styles.lockedGallerySheetTitle}>
              {tt("profile.lockedGalleryModalTitle", "Открыть закрытую папку")}
            </Text>
            <Text style={styles.lockedGallerySheetBody}>
              {tt(
                "profile.lockedGalleryModalBody",
                "Введите пароль, который владелец профиля дал вам лично."
              )}
            </Text>
            <TextInput
              value={lockedGalleryPassword}
              onChangeText={(value) => {
                setLockedGalleryPassword(value);
                if (lockedGalleryError) setLockedGalleryError("");
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              editable={!lockedGalleryUnlocking}
              placeholder={tt("profile.lockedGalleryPasswordPlaceholder", "Пароль")}
              placeholderTextColor="rgba(226,232,255,0.46)"
              style={styles.lockedGalleryInput}
              returnKeyType="done"
              onSubmitEditing={() => void handleUnlockLockedGallery()}
            />
            {lockedGalleryError ? (
              <Text style={styles.lockedGalleryError}>{lockedGalleryError}</Text>
            ) : null}
            <View style={styles.lockedGalleryModalActions}>
              <TouchableOpacity
                onPress={closeLockedGalleryModal}
                style={styles.lockedGalleryCancelButton}
                activeOpacity={0.85}
              >
                <Text style={styles.lockedGalleryCancelText}>
                  {tt("profile.lockedGalleryUnlockCancel", "Отмена")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void handleUnlockLockedGallery()}
                disabled={lockedGalleryUnlockDisabled}
                style={[
                  styles.lockedGalleryUnlockButton,
                  lockedGalleryUnlockDisabled ? styles.disabledButton : null,
                ]}
                activeOpacity={0.85}
              >
                <Text style={styles.lockedGalleryUnlockText}>
                  {lockedGalleryUnlocking
                    ? tt("profile.lockedGalleryUnlocking", "Проверяем...")
                    : tt("profile.lockedGalleryUnlockAction", "Открыть")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </>
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
    backgroundColor: "transparent",
    padding: 18,
    borderWidth: 0,
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
    color: theme.colors.textAccent,
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
  about: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  interestChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  interestChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.surfaceWarm,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  interestText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "transparent",
    padding: 16,
    borderWidth: 0,
    gap: 8,
  },
  compatibilityCard: {
    borderColor: "transparent",
  },
  compatibilityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  compatibilityReasons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  compatibilityReason: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.surfaceWarm,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  compatibilityReasonText: {
    color: theme.colors.textAccent,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  cardKicker: {
    color: theme.colors.textAccent,
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
    backgroundColor: "transparent",
    padding: 14,
    borderWidth: 0,
    gap: 12,
  },
  lockedFolderCard: {
    minHeight: 96,
    padding: 14,
    borderRadius: 22,
    backgroundColor: theme.cards.warning.backgroundColor,
    borderColor: theme.cards.warning.borderColor,
    borderWidth: theme.cards.warning.borderWidth,
  },
  lockedFolderHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  lockedFolderIcon: {
    width: 42,
    height: 42,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.warningBg,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  lockedFolderCopy: {
    flex: 1,
    gap: 5,
  },
  lockedFolderTitle: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  lockedFolderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  lockedFolderButton: {
    minHeight: 42,
    borderRadius: theme.buttons.secondary.borderRadius,
    paddingHorizontal: theme.buttons.secondary.paddingHorizontal,
    paddingVertical: 10,
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderWidth: theme.buttons.secondary.borderWidth,
    borderColor: theme.buttons.secondary.borderColor,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedFolderButtonText: {
    color: theme.buttons.secondary.textColor,
    fontSize: theme.buttons.secondary.fontSize,
    lineHeight: theme.buttons.secondary.lineHeight,
    fontWeight: theme.buttons.secondary.fontWeight,
  },
  lockedGalleryOpenedCard: {
    backgroundColor: "transparent",
    borderColor: "transparent",
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
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  galleryPhotoImage: {
    width: "100%",
    height: "100%",
  },
  galleryPhotoLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 12, 24, 0.22)",
  },
  galleryPhotoFailedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8, 12, 24, 0.92)",
  },
  galleryPhotoFailedText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    fontWeight: "700",
  },
  actions: {
    gap: 10,
  },
  primaryButton: {
    minHeight: theme.buttons.primary.height,
    borderRadius: theme.buttons.primary.borderRadius,
    paddingHorizontal: theme.buttons.primary.paddingHorizontal,
    paddingVertical: 13,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
    alignItems: "center",
  },
  primaryButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
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
  lockedGalleryModalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  lockedGallerySheet: {
    width: "100%",
    minHeight: theme.sheets.minHeight,
    paddingHorizontal: theme.sheets.paddingHorizontal,
    paddingTop: 16,
    paddingBottom: 20,
    backgroundColor: theme.sheets.backgroundColor,
    borderTopWidth: 1,
    borderColor: theme.sheets.borderColor,
    borderTopLeftRadius: theme.sheets.borderTopLeftRadius,
    borderTopRightRadius: theme.sheets.borderTopRightRadius,
    gap: 12,
  },
  lockedGallerySheetHandle: {
    alignSelf: "center",
    width: theme.sheets.handleWidth,
    height: theme.sheets.handleHeight,
    borderRadius: theme.sheets.handleRadius,
    backgroundColor: "rgba(255,255,255,0.28)",
    marginBottom: 2,
  },
  lockedGallerySheetTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
  },
  lockedGallerySheetBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  lockedGalleryInput: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  lockedGalleryError: {
    color: theme.colors.dangerText,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  lockedGalleryModalActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  lockedGalleryCancelButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.buttons.secondary.borderRadius,
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderWidth: theme.buttons.secondary.borderWidth,
    borderColor: theme.buttons.secondary.borderColor,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  lockedGalleryCancelText: {
    color: theme.buttons.secondary.textColor,
    fontSize: theme.buttons.secondary.fontSize,
    lineHeight: theme.buttons.secondary.lineHeight,
    fontWeight: theme.buttons.secondary.fontWeight,
  },
  lockedGalleryUnlockButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.buttons.primary.borderRadius,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  lockedGalleryUnlockText: {
    color: theme.buttons.primary.textColor,
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
  },
});
