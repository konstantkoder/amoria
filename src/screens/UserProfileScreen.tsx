import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
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
import * as FileSystem from "expo-file-system/legacy";

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
import { getUserProfileById } from "@/services/user";
import { getBackendAccessToken } from "@/services/api/sessionStorage";
import {
  AUTH_SESSION_CHANGED_EVENT,
  type AuthSessionChangedEvent,
} from "@/services/session/authEvents";
import {
  getPublicMediaUrlInfo,
  normalizeAuthenticatedLockedMediaUrl,
  probePublicMediaUrlInfo,
  type PublicMediaUrlInfo,
} from "@/services/media/mediaUrl";
import type { Goal, Mood, UserProfile, UserProfilePhoto } from "@/models/User";
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
type UnlockedGalleryPhoto = UserProfilePhoto & {
  unlockToken: string;
  unlockExpiresAt: string;
  accessToken: string;
};
type LockedPhotoRenderStatus = "loading" | "fetching" | "ready" | "failed";
type LockedPhotoRenderState = {
  status: LockedPhotoRenderStatus;
  localUri?: string;
  httpStatus?: number;
  contentType?: string;
  probeErrorCode?: string;
};

type LockedPhotoFetchResult = {
  uri: string;
  httpStatus: number;
  contentType: string;
};

function PeerPublicPhoto({
  photo,
  index,
  failed,
  failedLabel,
  onLoadFailed,
}: {
  photo: UserProfilePhoto;
  index: number;
  failed: boolean;
  failedLabel: string;
  onLoadFailed: (photo: UserProfilePhoto) => void;
}) {
  const urlInfo = useMemo(
    () => getPublicMediaUrlInfo(photo.url, "peer public photo URL"),
    [photo.url]
  );
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
          source={{ uri: urlInfo.url }}
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

class LockedPhotoFetchError extends Error {
  httpStatus?: number;
  contentType?: string;
  probeErrorCode?: string;

  constructor(
    message: string,
    input: {
      httpStatus?: number;
      contentType?: string;
      probeErrorCode?: string;
    } = {}
  ) {
    super(message);
    this.name = "LockedPhotoFetchError";
    this.httpStatus = input.httpStatus;
    this.contentType = input.contentType;
    this.probeErrorCode = input.probeErrorCode;
  }
}

const LOCKED_GALLERY_CACHE_DIR_NAME = "amoria-locked-gallery";
const LOCKED_GALLERY_TOKEN_EXPIRY_SOON_MS = 30_000;

function lockedGalleryCacheDir(): string | undefined {
  return FileSystem.cacheDirectory
    ? `${FileSystem.cacheDirectory}${LOCKED_GALLERY_CACHE_DIR_NAME}/`
    : undefined;
}

function safeLockedPhotoFileName(mediaId: string): string {
  return mediaId.replace(/[^a-zA-Z0-9_-]/g, "_") || "locked-photo";
}

function contentTypeFromHeaders(
  headers: Record<string, string> | undefined,
  fallback: string | null | undefined
): string | undefined {
  const normalizedFallback = String(fallback ?? "").trim();
  if (normalizedFallback) return normalizedFallback;
  if (!headers) return undefined;

  const entry = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === "content-type"
  );
  return entry?.[1]?.trim() || undefined;
}

function imageFileExtensionForContentType(contentType: string): string {
  const normalized = contentType.toLowerCase();
  if (normalized.includes("jpeg") || normalized.includes("jpg")) return "jpg";
  if (normalized.includes("png")) return "png";
  if (normalized.includes("webp")) return "webp";
  if (normalized.includes("gif")) return "gif";
  return "img";
}

async function readJsonErrorCodeFromDownloadedFile(
  fileUri: string,
  contentType: string | undefined
): Promise<string | undefined> {
  if (!contentType?.toLowerCase().includes("application/json")) return undefined;

  const body = await FileSystem.readAsStringAsync(fileUri).catch(() => "");
  if (!body.trim()) return undefined;

  try {
    const data = JSON.parse(body) as { error?: { code?: unknown } };
    const code = data.error?.code;
    return typeof code === "string" && code.trim() ? code : undefined;
  } catch {
    return undefined;
  }
}

function tokenExpiresSoon(expiresAt: string): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  return !Number.isFinite(expiresAtMs)
    ? true
    : expiresAtMs - Date.now() <= LOCKED_GALLERY_TOKEN_EXPIRY_SOON_MS;
}

async function fetchLockedPhotoToTemporaryUri(
  photo: UnlockedGalleryPhoto
): Promise<LockedPhotoFetchResult> {
  const cacheDir = lockedGalleryCacheDir();
  if (!cacheDir) {
    throw new LockedPhotoFetchError("Locked gallery cache directory is unavailable", {
      probeErrorCode: "cache_unavailable",
    });
  }

  await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
  const fileBaseName = `${safeLockedPhotoFileName(photo.mediaId)}-${Date.now()}`;
  const downloadUri = `${cacheDir}${fileBaseName}.download`;

  const response = await FileSystem.downloadAsync(photo.url, downloadUri, {
    cache: false,
    sessionType: FileSystem.FileSystemSessionType.FOREGROUND,
    headers: {
      Authorization: `Bearer ${photo.accessToken}`,
      "x-amoria-locked-gallery-token": photo.unlockToken,
    },
  });
  const contentType = contentTypeFromHeaders(response.headers, response.mimeType);
  const probeErrorCode =
    await readJsonErrorCodeFromDownloadedFile(response.uri, contentType);

  if (response.status < 200 || response.status >= 300) {
    await FileSystem.deleteAsync(response.uri, { idempotent: true }).catch(() => undefined);
    throw new LockedPhotoFetchError("Locked media fetch failed", {
      httpStatus: response.status,
      ...(contentType ? { contentType } : {}),
      probeErrorCode: probeErrorCode ?? "http_status_failed",
    });
  }

  if (!contentType?.toLowerCase().startsWith("image/")) {
    await FileSystem.deleteAsync(response.uri, { idempotent: true }).catch(() => undefined);
    throw new LockedPhotoFetchError("Locked media response was not an image", {
      httpStatus: response.status,
      ...(contentType ? { contentType } : {}),
      probeErrorCode: "non_image_content_type",
    });
  }

  const finalUri = `${cacheDir}${fileBaseName}.${imageFileExtensionForContentType(contentType)}`;
  await FileSystem.moveAsync({ from: response.uri, to: finalUri });
  return {
    uri: finalUri,
    httpStatus: response.status,
    contentType,
  };
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
  const { user: authUser, accessToken: authAccessToken } = useAuth();
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
  const [profileLoadState, setProfileLoadState] = useState<ProfileLoadState>("loading");
  const [sourceDetailText, setSourceDetailText] = useState("");
  const [sharedStoryAvailable, setSharedStoryAvailable] = useState(false);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [unlockModalVisible, setUnlockModalVisible] = useState(false);
  const [lockedPassword, setLockedPassword] = useState("");
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const [unlockedPhotos, setUnlockedPhotos] = useState<UnlockedGalleryPhoto[]>([]);
  const [lockedGalleryMessage, setLockedGalleryMessage] = useState("");
  const [lockedPhotoStates, setLockedPhotoStates] = useState<Record<string, LockedPhotoRenderState>>({});
  const [avatarLoadFailed, setAvatarLoadFailed] = useState(false);
  const [failedPublicPhotoIds, setFailedPublicPhotoIds] = useState<string[]>([]);
  const [nearbyChatOpening, setNearbyChatOpening] = useState(false);
  const reportedMediaFailuresRef = React.useRef<Set<string>>(new Set());
  const reportedLockedMediaFailuresRef = React.useRef<Set<string>>(new Set());
  const lockedPhotoFallbackInFlightRef = React.useRef<Set<string>>(new Set());
  const lockedPhotoTempUrisRef = React.useRef<Set<string>>(new Set());
  const unlockedPhotoIdsRef = React.useRef<Set<string>>(new Set());

  const clearLockedPhotoTempFiles = useCallback(async () => {
    lockedPhotoFallbackInFlightRef.current.clear();
    lockedPhotoTempUrisRef.current.clear();
    const cacheDir = lockedGalleryCacheDir();
    if (!cacheDir) return;
    await FileSystem.deleteAsync(cacheDir, { idempotent: true }).catch(() => undefined);
  }, []);

  const clearUnlockedLockedGallery = useCallback(
    (message = "") => {
      unlockedPhotoIdsRef.current.clear();
      setUnlockedPhotos([]);
      setLockedPhotoStates({});
      setLockedGalleryMessage(message);
      reportedLockedMediaFailuresRef.current.clear();
      void clearLockedPhotoTempFiles();
    },
    [clearLockedPhotoTempFiles]
  );

  useEffect(() => {
    let alive = true;
    setProfile(null);
    setUnlockModalVisible(false);
    setLockedPassword("");
    setUnlockError("");
    clearUnlockedLockedGallery();
    setAvatarLoadFailed(false);
    setFailedPublicPhotoIds([]);
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
  }, [clearUnlockedLockedGallery, reloadKey, userId]);

  useEffect(() => {
    if (!authAccessToken) {
      if (unlockedPhotos.length) {
        clearUnlockedLockedGallery(
          tt("profile.lockedGalleryUnlockExpired", "Сессия истекла. Введите пароль ещё раз.")
        );
      }
      return;
    }

    setUnlockedPhotos((current) =>
      current.map((photo) => ({
        ...photo,
        accessToken: authAccessToken,
      }))
    );
  }, [authAccessToken, clearUnlockedLockedGallery, tt, unlockedPhotos.length]);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      AUTH_SESSION_CHANGED_EVENT,
      (event?: AuthSessionChangedEvent) => {
        if (event?.signedIn === false) {
          clearUnlockedLockedGallery(
            tt("profile.lockedGalleryUnlockExpired", "Сессия истекла. Введите пароль ещё раз.")
          );
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [clearUnlockedLockedGallery, tt]);

  useEffect(() => {
    const unlockExpiresAt = unlockedPhotos[0]?.unlockExpiresAt;
    if (!unlockExpiresAt) return;

    const expiresInMs = Date.parse(unlockExpiresAt) - Date.now();
    if (!Number.isFinite(expiresInMs) || expiresInMs <= 0) {
      clearUnlockedLockedGallery(
        tt("profile.lockedGalleryUnlockExpired", "Сессия истекла. Введите пароль ещё раз.")
      );
      return;
    }

    const timeout = setTimeout(() => {
      clearUnlockedLockedGallery(
        tt("profile.lockedGalleryUnlockExpired", "Сессия истекла. Введите пароль ещё раз.")
      );
    }, expiresInMs);

    return () => {
      clearTimeout(timeout);
    };
  }, [clearUnlockedLockedGallery, tt, unlockedPhotos]);

  useEffect(() => {
    unlockedPhotoIdsRef.current = new Set(unlockedPhotos.map((photo) => photo.mediaId));
  }, [unlockedPhotos]);

  useEffect(() => {
    return () => {
      void clearLockedPhotoTempFiles();
    };
  }, [clearLockedPhotoTempFiles]);

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
  const amoriaId = profile?.amoriaId?.trim() ?? "";
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
  const publicAgeLabel = profile?.ageGroup
    ? tt("profile.publicAgeGroup", "Возраст: {group}", { group: profile.ageGroup })
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

  const reportPeerMediaLoadFailed = useCallback(
    (
      step: "avatarLoadFailed" | "publicPhotoLoadFailed",
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
          action: step === "avatarLoadFailed" ? "loadAvatar" : "loadPublicPhoto",
          step: "imageLoadFailed",
          message: "User profile media failed to load",
          metadata: {
            hasAvatarUrl: Boolean(avatarUrl),
            photoCount: photos.length,
            ...(mediaId ? { mediaId } : {}),
            urlKind: probe.urlKind ?? input.urlInfo?.urlKind ?? "unknown",
            httpStatus: probe.httpStatus ?? null,
            contentType: probe.contentType ?? null,
            visibility: input.visibility ?? (step === "avatarLoadFailed" ? "avatar" : "public"),
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

  const reportLockedGalleryMediaIssue = useCallback(
    (
      step:
        | "unlockResponseEmpty"
        | "lockedPhotoLoadFailed"
        | "lockedPhotoFetchFailed"
        | "lockedPhotoInvalidUrl",
      input: {
        mediaId?: string;
        lockedPhotoCount?: number;
        mappedPhotoCount?: number;
        invalidLockedUrlCount?: number;
        httpStatus?: number;
        contentType?: string;
        probeErrorCode?: string;
        tokenExpiresSoon?: boolean;
      } = {}
    ) => {
      const reportKey = [
        step,
        input.mediaId ?? "album",
        input.httpStatus ?? "",
        input.probeErrorCode ?? "",
      ].join(":");
      if (reportedLockedMediaFailuresRef.current.has(reportKey)) return;
      reportedLockedMediaFailuresRef.current.add(reportKey);

      reportClientError({
        screen: "UserProfileScreen",
        action: "loadLockedGalleryMedia",
        step,
        message: "Locked gallery media could not be rendered",
        metadata: {
          targetUserId: userId,
          ...(input.mediaId ? { mediaId: input.mediaId } : {}),
          lockedPhotoCount: input.lockedPhotoCount ?? lockedGallery?.count ?? 0,
          mappedPhotoCount: input.mappedPhotoCount ?? unlockedPhotos.length,
          invalidLockedUrlCount: input.invalidLockedUrlCount ?? 0,
          httpStatus: input.httpStatus ?? null,
          contentType: input.contentType ?? null,
          probeErrorCode: input.probeErrorCode ?? null,
          tokenExpiresSoon: Boolean(input.tokenExpiresSoon),
        },
      });
    },
    [lockedGallery?.count, unlockedPhotos.length, userId]
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

  const openSharedStory = useCallback(() => {
    if (!sourceSessionId || !sharedStoryAvailable) return;
    navigation.navigate("PlaySessionDetail", { sessionId: sourceSessionId });
  }, [navigation, sharedStoryAvailable, sourceSessionId]);

  const unlockLockedGallery = useCallback(async () => {
    const password = lockedPassword;
    if (!userId || !password.trim() || unlockBusy) return;

    setUnlockBusy(true);
    setUnlockError("");
    setLockedGalleryMessage("");
    try {
      const response = await unlockUserLockedGallery(userId, password);
      const accessToken = await getBackendAccessToken();
      if (!accessToken) {
        setUnlockError(tt("profile.lockedGalleryUnlockExpired", "Сессия истекла. Введите пароль ещё раз."));
        return;
      }
      const lockedPhotoCount = lockedGallery?.count ?? response.photos.length;
      const tokenExpiresSoonValue = tokenExpiresSoon(response.unlockExpiresAt);
      const invalidLockedMediaIds: string[] = [];
      const mappedPhotos = response.photos
        .map((photo): UnlockedGalleryPhoto | null => {
          const url = normalizeAuthenticatedLockedMediaUrl(photo.url, "locked gallery media URL");
          if (!url) {
            invalidLockedMediaIds.push(photo.mediaId);
            return null;
          }
          return {
            mediaId: photo.mediaId,
            url,
            position: photo.position,
            visibility: "locked",
            unlockToken: response.unlockToken,
            unlockExpiresAt: response.unlockExpiresAt,
            accessToken,
          };
        })
        .filter((photo): photo is UnlockedGalleryPhoto => Boolean(photo));
      const invalidLockedUrlCount = invalidLockedMediaIds.length;

      if (response.photos.length === 0 && lockedPhotoCount > 0) {
        clearUnlockedLockedGallery(
          tt(
            "profile.lockedGalleryEmptyAfterUnlock",
            "Пароль принят, но сервер не вернул закрытые фото. Мы сохранили безопасную ошибку для проверки."
          )
        );
        reportLockedGalleryMediaIssue("unlockResponseEmpty", {
          lockedPhotoCount,
          mappedPhotoCount: 0,
          invalidLockedUrlCount: 0,
          tokenExpiresSoon: tokenExpiresSoonValue,
        });
        setUnlockModalVisible(false);
        setLockedPassword("");
        return;
      }

      invalidLockedMediaIds.forEach((mediaId) => {
        reportLockedGalleryMediaIssue("lockedPhotoInvalidUrl", {
          mediaId,
          lockedPhotoCount,
          mappedPhotoCount: mappedPhotos.length,
          invalidLockedUrlCount,
          tokenExpiresSoon: tokenExpiresSoonValue,
        });
      });

      if (response.photos.length > 0 && mappedPhotos.length === 0) {
        clearUnlockedLockedGallery(
          tt(
            "profile.lockedGalleryMediaUnavailable",
            "Пароль принят, но закрытые фото сейчас не удалось подготовить."
          )
        );
        setUnlockModalVisible(false);
        setLockedPassword("");
        return;
      }

      await clearLockedPhotoTempFiles();
      unlockedPhotoIdsRef.current = new Set(mappedPhotos.map((photo) => photo.mediaId));
      setUnlockedPhotos(mappedPhotos);
      setLockedPhotoStates(
        Object.fromEntries(
          mappedPhotos.map((photo) => [photo.mediaId, { status: "loading" as const }])
        )
      );
      setLockedGalleryMessage("");
      setUnlockModalVisible(false);
      setLockedPassword("");
    } catch (error) {
      if (error instanceof ApiError && error.code === "locked_gallery_rate_limited") {
        setUnlockError(tt("profile.lockedGalleryTooManyAttempts", "Слишком много попыток. Попробуйте позже."));
        return;
      }
      if (error instanceof ApiError && error.code === "locked_gallery_unlock_expired") {
        setUnlockError(tt("profile.lockedGalleryUnlockExpired", "Сессия истекла. Введите пароль ещё раз."));
        return;
      }
      if (error instanceof ApiError && error.status === 403) {
        setUnlockError(tt("profile.lockedGalleryWrongPassword", "Неверный пароль."));
        return;
      }
      setUnlockError(
        tt(
          "profile.lockedGalleryUnlockFailed",
          "Не удалось открыть закрытую папку. Попробуйте позже."
        )
      );
    } finally {
      setUnlockBusy(false);
    }
  }, [
    clearLockedPhotoTempFiles,
    clearUnlockedLockedGallery,
    lockedGallery?.count,
    lockedPassword,
    reportLockedGalleryMediaIssue,
    tt,
    unlockBusy,
    userId,
  ]);

  const handleLockedPhotoLoadStarted = useCallback((photo: UnlockedGalleryPhoto) => {
    setLockedPhotoStates((current) => {
      const existing = current[photo.mediaId];
      if (existing?.status === "fetching" || existing?.status === "ready") return current;
      return {
        ...current,
        [photo.mediaId]: {
          ...existing,
          status: "loading",
        },
      };
    });
  }, []);

  const handleLockedPhotoLoaded = useCallback((photo: UnlockedGalleryPhoto) => {
    setLockedPhotoStates((current) => {
      const existing = current[photo.mediaId];
      return {
        ...current,
        [photo.mediaId]: {
          ...existing,
          status: "ready",
        },
      };
    });
  }, []);

  const handleLockedPhotoLoadFailed = useCallback(
    (photo: UnlockedGalleryPhoto, renderState?: LockedPhotoRenderState) => {
      reportLockedGalleryMediaIssue("lockedPhotoLoadFailed", {
        mediaId: photo.mediaId,
        mappedPhotoCount: unlockedPhotos.length,
        httpStatus: renderState?.httpStatus,
        contentType: renderState?.contentType,
        probeErrorCode: renderState?.probeErrorCode,
        tokenExpiresSoon: tokenExpiresSoon(photo.unlockExpiresAt),
      });

      if (renderState?.localUri) {
        setLockedPhotoStates((current) => ({
          ...current,
          [photo.mediaId]: {
            ...current[photo.mediaId],
            status: "failed",
          },
        }));
        return;
      }

      if (lockedPhotoFallbackInFlightRef.current.has(photo.mediaId)) return;
      lockedPhotoFallbackInFlightRef.current.add(photo.mediaId);
      setLockedPhotoStates((current) => ({
        ...current,
        [photo.mediaId]: {
          ...current[photo.mediaId],
          status: "fetching",
        },
      }));

      void fetchLockedPhotoToTemporaryUri(photo)
        .then((result) => {
          lockedPhotoFallbackInFlightRef.current.delete(photo.mediaId);
          if (!unlockedPhotoIdsRef.current.has(photo.mediaId)) {
            void FileSystem.deleteAsync(result.uri, { idempotent: true }).catch(() => undefined);
            return;
          }

          lockedPhotoTempUrisRef.current.add(result.uri);
          setLockedPhotoStates((current) => {
            const previousUri = current[photo.mediaId]?.localUri;
            if (previousUri && previousUri !== result.uri) {
              lockedPhotoTempUrisRef.current.delete(previousUri);
              void FileSystem.deleteAsync(previousUri, { idempotent: true }).catch(
                () => undefined
              );
            }
            return {
              ...current,
              [photo.mediaId]: {
                status: "loading",
                localUri: result.uri,
                httpStatus: result.httpStatus,
                contentType: result.contentType,
              },
            };
          });
        })
        .catch((error) => {
          lockedPhotoFallbackInFlightRef.current.delete(photo.mediaId);
          if (!unlockedPhotoIdsRef.current.has(photo.mediaId)) return;

          const fetchError =
            error instanceof LockedPhotoFetchError ? error : undefined;
          const httpStatus = fetchError?.httpStatus;
          const contentType = fetchError?.contentType;
          const probeErrorCode =
            fetchError?.probeErrorCode ??
            (error && typeof error === "object" && "name" in error
              ? String((error as { name?: unknown }).name ?? "fetch_failed")
              : "fetch_failed");

          reportLockedGalleryMediaIssue("lockedPhotoFetchFailed", {
            mediaId: photo.mediaId,
            mappedPhotoCount: unlockedPhotos.length,
            httpStatus,
            contentType,
            probeErrorCode,
            tokenExpiresSoon: tokenExpiresSoon(photo.unlockExpiresAt),
          });

          if (
            httpStatus === 401 ||
            probeErrorCode === "locked_gallery_unlock_expired"
          ) {
            clearUnlockedLockedGallery(
              tt(
                "profile.lockedGalleryUnlockExpired",
                "Сессия истекла. Введите пароль ещё раз."
              )
            );
            return;
          }

          setLockedPhotoStates((current) => ({
            ...current,
            [photo.mediaId]: {
              ...current[photo.mediaId],
              status: "failed",
              ...(httpStatus ? { httpStatus } : {}),
              ...(contentType ? { contentType } : {}),
              probeErrorCode,
            },
          }));
        });
    },
    [
      clearUnlockedLockedGallery,
      reportLockedGalleryMediaIssue,
      tt,
      unlockedPhotos.length,
    ]
  );

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

  if (profileUnavailable) {
    return (
      <ScreenShell
        title={tt("profile.peerTitle", "Профиль собеседника")}
        background="profile"
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
        background="profile"
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
        background="profile"
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
        background="profile"
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
              {amoriaId ? (
                <Text style={styles.amoriaIdText}>
                  {tt("profile.amoriaId", "Amoria ID")}: {amoriaId}
                </Text>
              ) : null}
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

        {lockedGalleryAvailable ? (
          <View style={styles.galleryCard}>
            <Text style={styles.cardKicker}>
              {tt("profile.lockedGalleryKicker", "Закрытый альбом")}
            </Text>
            <Text style={styles.cardTitle}>
              {tt("profile.lockedGalleryTitle", "Закрытый альбом")}
            </Text>
            <Text style={styles.cardText}>
              {tt("profile.lockedGalleryBody", "Фотографии доступны по паролю")}
            </Text>
            <Text style={styles.cardText}>
              {tt("profile.lockedGalleryCount", "Фото: {count}", {
                count: String(lockedGallery?.count ?? 0),
              })}
            </Text>
            {lockedGalleryMessage ? (
              <Text style={styles.inlineInfo}>{lockedGalleryMessage}</Text>
            ) : null}
            <TouchableOpacity
              onPress={() => {
                setUnlockError("");
                setLockedGalleryMessage("");
                setUnlockModalVisible(true);
              }}
              style={styles.secondaryButton}
              activeOpacity={0.85}
            >
              <Text style={styles.secondaryButtonText}>
                {tt("profile.lockedGalleryOpen", "Открыть по паролю")}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {unlockedPhotos.length ? (
          <View style={styles.galleryCard}>
            <Text style={styles.cardTitle}>
              {tt("profile.lockedGalleryUnlockedTitle", "Закрытые фото")}
            </Text>
            <View style={styles.galleryGrid}>
              {unlockedPhotos.map((photo, index) => {
                const renderState = lockedPhotoStates[photo.mediaId] ?? { status: "loading" };
                const loading =
                  renderState.status === "loading" || renderState.status === "fetching";

                if (renderState.status === "failed") {
                  return (
                    <View
                      key={`${photo.mediaId ?? photo.url}-${index}`}
                      style={[styles.lockedPhotoFrame, styles.galleryPhotoFailed]}
                    >
                      <Text style={styles.galleryPhotoFailedText}>
                        {tt(
                          "profile.lockedPhotoLoadFailed",
                          "Это закрытое фото не загрузилось."
                        )}
                      </Text>
                    </View>
                  );
                }

                return (
                  <View
                    key={`${photo.mediaId ?? photo.url}-${index}`}
                    style={styles.lockedPhotoFrame}
                  >
                    <Image
                      source={
                        renderState.localUri
                          ? { uri: renderState.localUri }
                          : {
                              uri: photo.url,
                              headers: {
                                Authorization: `Bearer ${photo.accessToken}`,
                                "x-amoria-locked-gallery-token": photo.unlockToken,
                              },
                            }
                      }
                      style={styles.lockedPhotoImage}
                      onLoadStart={() => handleLockedPhotoLoadStarted(photo)}
                      onLoad={() => handleLockedPhotoLoaded(photo)}
                      onError={() => handleLockedPhotoLoadFailed(photo, renderState)}
                    />
                    {loading ? (
                      <View style={styles.lockedPhotoOverlay}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.lockedPhotoLoadingText}>
                          {renderState.status === "fetching"
                            ? tt(
                                "profile.lockedPhotoFallbackLoading",
                                "Готовим фото…"
                              )
                            : tt("profile.lockedPhotoLoading", "Загружаем…")}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
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
        visible={unlockModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setUnlockModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.cardTitle}>
              {tt("profile.lockedGalleryTitle", "Закрытый альбом")}
            </Text>
            <Text style={styles.cardText}>
              {tt("profile.lockedGalleryPasswordBody", "Введите пароль")}
            </Text>
            <TextInput
              value={lockedPassword}
              onChangeText={(value) => {
                setLockedPassword(value);
                setUnlockError("");
              }}
              secureTextEntry
              placeholder={tt("profile.lockedGalleryPasswordPlaceholder", "Пароль")}
              placeholderTextColor="rgba(255,255,255,0.45)"
              style={styles.passwordInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {unlockError ? <Text style={styles.inlineError}>{unlockError}</Text> : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setUnlockModalVisible(false)}
                disabled={unlockBusy}
                style={styles.modalSecondaryButton}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryButtonText}>{tt("common.cancel", "Отмена")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void unlockLockedGallery()}
                disabled={unlockBusy || !lockedPassword.trim()}
                style={[
                  styles.modalPrimaryButton,
                  unlockBusy || !lockedPassword.trim() ? styles.disabledButton : null,
                ]}
                activeOpacity={0.85}
              >
                {unlockBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {tt("profile.lockedGalleryOpen", "Открыть по паролю")}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    backgroundColor: "rgba(255, 78, 138, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.24)",
  },
  interestText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
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
  inlineInfo: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
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
  lockedPhotoFrame: {
    width: "48.2%",
    aspectRatio: 1,
    borderRadius: theme.shapes.cardInner,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  lockedPhotoImage: {
    width: "100%",
    height: "100%",
  },
  lockedPhotoOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "rgba(8, 12, 24, 0.42)",
  },
  lockedPhotoLoadingText: {
    color: theme.colors.text,
    fontSize: 12,
    lineHeight: 16,
    textAlign: "center",
    fontWeight: "800",
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
  galleryPhotoFailed: {
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
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
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(10, 14, 26, 0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 12,
  },
  passwordInput: {
    borderRadius: theme.shapes.cardInner,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  inlineError: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
  },
  modalSecondaryButton: {
    flex: 1,
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  modalPrimaryButton: {
    flex: 1,
    minHeight: 45,
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
});
