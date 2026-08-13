import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type AlertButton,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import UserAvatar from "@/components/UserAvatar";
import { type NearbyTabNavigationProp } from "@/navigation/appRoutes";
import { theme } from "@/theme";
import { useAuth } from "@/contexts/AuthContext";
import * as chatApi from "@/services/api/chatApi";
import * as nearbyApi from "@/services/api/nearbyApi";
import * as safetyApi from "@/services/api/safetyApi";
import type { SafetyReportReason } from "@/services/api/safetyApi";
import {
  NEARBY_STATUS_TTL_MS,
  type NowMood,
  type NowPost,
  mapNearbyStatusDtoToNowPost,
  mapNearbyStatusDtosToNowPosts,
} from "@/services/nearbyModel";
import {
  loadLocationPrefs,
  setLocationConsent,
  setNearbyEnabled,
  type LocationPrefs,
} from "@/services/locationPrivacy";
import { useLocale } from "@/contexts/LocaleContext";
import { formatAgoLong } from "@/utils/timeAgo";
import { makeAndroidSafeReportReasonButtons } from "@/utils/safetyReportReasonAlert";

type Pos = { lat: number; lng: number; accuracy?: number | null };
type RadiusOption = number | null;
type TranslateFn = (key: string, params?: Record<string, string>) => string;

type Props = {
  showHero?: boolean;
  bottomInset?: number;
};

const RADIUS_OPTIONS: RadiusOption[] = [5, 10, 25, 50, 100, null];

function distanceKm(
  pos: Pos | null,
  item: { lat?: number; lng?: number; distanceMeters?: number }
): number | null {
  if (Number.isFinite(item.distanceMeters)) {
    return Math.round(Number(item.distanceMeters) / 100) / 10;
  }
  if (!pos || item.lat == null || item.lng == null) return null;
  const earthRadiusKm = 6371;
  const dLat = ((item.lat - pos.lat) * Math.PI) / 180;
  const dLng = ((item.lng - pos.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pos.lat * Math.PI) / 180) *
      Math.cos((item.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadiusKm * c * 10) / 10;
}

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

function getNearbyNowLocationError(
  t: TranslateFn,
  error: unknown
): string {
  const message = String((error as { message?: string } | null)?.message ?? "").toLowerCase();
  if (message.includes("timeout")) {
    return t("geo.timeout");
  }
  if (message.includes("permission") || message.includes("denied")) {
    return t("geo.permissionRequired");
  }
  return t("geo.noLocationAccess");
}

function buildReportReasonButtons(
  t: TranslateFn,
  onSelect: (reason: SafetyReportReason) => void
): AlertButton[] {
  return makeAndroidSafeReportReasonButtons([
    {
      text: t("safety.reason.spam"),
      onPress: () => onSelect("spam"),
    },
    {
      text: t("safety.reason.harassment"),
      onPress: () => onSelect("harassment"),
    },
    {
      text: t("safety.reason.sexualServices"),
      onPress: () => onSelect("sexual_services"),
    },
    {
      text: t("safety.reason.scam"),
      onPress: () => onSelect("scam"),
    },
    {
      text: t("safety.reason.other"),
      onPress: () => onSelect("other"),
    },
    {
      text: t("common.cancel"),
      style: "cancel",
    },
  ], t("safety.reportTitle"), t("safety.reportBody"), t("safety.moreReasons"));
}

export default function NearbyNowSection({
  showHero = false,
  bottomInset,
}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NearbyTabNavigationProp>();
  const { user: authUser } = useAuth();
  const currentUserId = authUser?.id ?? "";
  const { t } = useLocale();
  const mountedRef = useRef(true);
  const sendResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendGuardRef = useRef(false);
  const reportInFlightRef = useRef(false);

  const [prefs, setPrefs] = useState<LocationPrefs>({
    consent: "unknown",
    nearbyEnabled: false,
  });
  const [prefsLoading, setPrefsLoading] = useState(true);
  const [pos, setPos] = useState<Pos | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [posts, setPosts] = useState<NowPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [mood, setMood] = useState<NowMood>("chill");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [radiusKm, setRadiusKm] = useState<RadiusOption>(25);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [chatOpeningPostId, setChatOpeningPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [reportingPostId, setReportingPostId] = useState<string | null>(null);
  const [lastPublishedAt, setLastPublishedAt] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (sendResetTimeoutRef.current) {
        clearTimeout(sendResetTimeoutRef.current);
      }
    };
  }, []);

  const moodMeta: { key: NowMood; label: string; emoji: string }[] = useMemo(
    () => [
      { key: "chill", label: t("now.mood.chill"), emoji: "😌" },
      { key: "talk", label: t("now.mood.talk"), emoji: "💬" },
      { key: "drink", label: t("now.mood.drink"), emoji: "🥤" },
      { key: "walk", label: t("now.mood.walk"), emoji: "🚶" },
      { key: "fun", label: t("now.mood.fun"), emoji: "🎉" },
      { key: "other", label: t("now.mood.other"), emoji: "✨" },
    ],
    [t]
  );

  const updatePrefs = useCallback((patch: Partial<LocationPrefs>) => {
    setPrefs((prev) => ({ ...prev, ...patch }));
  }, []);

  const ensurePosition = useCallback(async (options?: { allowPermissionPrompt?: boolean }) => {
    if (!mountedRef.current) return;
    setPosLoading(true);
    setLocationError(null);
    try {
      const currentPermission = await Location.getForegroundPermissionsAsync();
      let granted = currentPermission.status === "granted";
      let canAskAgain = currentPermission.canAskAgain;

      if (!granted && options?.allowPermissionPrompt !== false) {
        const nextPermission = await Location.requestForegroundPermissionsAsync();
        granted = nextPermission.status === "granted";
        canAskAgain = nextPermission.canAskAgain;

        if (granted) {
          await Promise.all([
            setLocationConsent("accepted"),
            setNearbyEnabled(true),
          ]).catch(() => {});
          if (!mountedRef.current) return;
          updatePrefs({
            consent: "accepted",
            nearbyEnabled: true,
          });
        } else {
          await Promise.all([
            setLocationConsent("declined"),
            setNearbyEnabled(false),
          ]).catch(() => {});
          if (!mountedRef.current) return;
          updatePrefs({
            consent: "declined",
            nearbyEnabled: false,
          });
        }
      }

      if (!granted) {
        setPermissionBlocked(canAskAgain === false);
        setPos(null);
        setLocationError(
          canAskAgain === false ? t("geo.permissionBlockedHelp") : t("geo.permissionRequired")
        );
        return;
      }

      setPermissionBlocked(false);

      const lastKnown = await Location.getLastKnownPositionAsync();
      const source =
        lastKnown ??
        (await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }));
      const nextPos: Pos = {
        lat: source.coords.latitude,
        lng: source.coords.longitude,
        accuracy: source.coords.accuracy,
      };
      if (!mountedRef.current) return;
      setPos(nextPos);
      setLocationError(null);
    } catch (error: any) {
      if (!mountedRef.current) return;
      setPos(null);
      setLocationError(getNearbyNowLocationError(t, error));
    } finally {
      if (mountedRef.current) {
        setPosLoading(false);
      }
    }
  }, [t, updatePrefs]);

  const syncLocationState = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const [nextPrefs, permission] = await Promise.all([
        loadLocationPrefs(),
        Location.getForegroundPermissionsAsync(),
      ]);
      if (!mountedRef.current) return;

      setPrefs(nextPrefs);
      const granted = permission.status === "granted";
      const blocked = !granted && permission.canAskAgain === false;
      setPermissionBlocked(blocked);

      if (!granted) {
        setPos(null);
        setLocationError(
          blocked
            ? t("geo.permissionBlockedHelp")
            : nextPrefs.consent === "accepted" && nextPrefs.nearbyEnabled
              ? t("geo.permissionRequired")
              : null
        );
        return;
      }

      if (nextPrefs.consent !== "accepted" || !nextPrefs.nearbyEnabled) {
        setPos(null);
        setLocationError(null);
        return;
      }

      setLocationError(null);

      if (!pos && !posLoading) {
        void ensurePosition({ allowPermissionPrompt: false });
      }
    } finally {
      if (mountedRef.current) {
        setPrefsLoading(false);
      }
    }
  }, [ensurePosition, pos, posLoading, t]);

  useFocusEffect(
    useCallback(() => {
      void syncLocationState();
    }, [syncLocationState])
  );

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!currentUserId) {
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
    }, [currentUserId, reloadKey])
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void syncLocationState();
      }
    });
    return () => subscription.remove();
  }, [syncLocationState]);

  const loadFeed = useCallback(async () => {
    if (!pos) {
      setPosts([]);
      setLoading(false);
      setFeedError(null);
      return;
    }

    setLoading(true);
    setFeedError(null);
    try {
      const radiusMeters = radiusKm == null ? 100000 : radiusKm * 1000;
      const response = await nearbyApi.listFeed(pos.lat, pos.lng, radiusMeters, 30);
      if (!mountedRef.current) return;
      setPosts(mapNearbyStatusDtosToNowPosts(response.items ?? []));
    } catch {
      if (!mountedRef.current) return;
      setPosts([]);
      setFeedError(t("common.tryAgainLater"));
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [pos, radiusKm, t]);

  useEffect(() => {
    void loadFeed();
  }, [loadFeed, reloadKey]);

  const onSend = useCallback(async () => {
    if (sendGuardRef.current) return;
    if (!currentUserId) {
      Alert.alert(t("now.signInTitle"), t("now.signInBody"));
      return;
    }

    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert(t("now.emptyTitle"), t("now.emptyBody"));
      return;
    }
    if (!pos) {
      Alert.alert(t("now.noLocationTitle"), locationError ?? t("now.noLocationBody"));
      return;
    }

    sendGuardRef.current = true;
    const previousMessage = message;
    setMessage("");

    try {
      if (mountedRef.current) {
        setSending(true);
      }
      const created = await nearbyApi.createStatus({
        text: trimmed,
        lat: pos.lat,
        lng: pos.lng,
      });
      if (mountedRef.current) {
        const createdPost = mapNearbyStatusDtoToNowPost(created);
        if (createdPost) {
          setPosts((current) => [createdPost, ...current]);
        }
        setLastPublishedAt(Date.now());
        setReloadKey((prev) => prev + 1);
      }
    } catch (error: any) {
      if (mountedRef.current) {
        setMessage(previousMessage);
      }
      Alert.alert(t("now.sendFailedTitle"), t("now.sendFailedBody"));
    } finally {
      if (mountedRef.current) {
        setSending(false);
      }
      sendResetTimeoutRef.current = setTimeout(() => {
        sendGuardRef.current = false;
      }, 250);
    }
  }, [currentUserId, locationError, message, pos, t]);

  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const locationEnabled = prefs.consent === "accepted" && prefs.nearbyEnabled;
  const locationDeclined = prefs.consent === "declined" && !locationEnabled;

  const handleEnableLocation = useCallback(async () => {
    await ensurePosition({ allowPermissionPrompt: true });
  }, [ensurePosition]);

  const handleLocationSettings = useCallback(() => {
    Linking.openSettings().catch(() => {});
  }, []);

  const visiblePosts = useMemo(() => {
    const now = Date.now();
    const deduped = new Map<string, NowPost>();
    for (const post of posts) {
      const authorUid = String(post.authorUid ?? "").trim();
      if (!authorUid) continue;
      if (post.status !== "active" || post.expiresAt <= now) continue;
      if (blockedUserIds.includes(authorUid)) continue;
      const distance = distanceKm(pos, post);
      if (radiusKm != null && distance != null && distance > radiusKm) continue;
      deduped.set(String(post.id), post);
    }
    return Array.from(deduped.values());
  }, [blockedUserIds, pos, posts, radiusKm]);
  const showStandaloneHeading = showHero;

  const resolveAuthorLabel = useCallback(
    (item: NowPost) => {
      return String(item.authorName || "").trim() || t("profile.amoriaUser");
    },
    [t]
  );

  const openNearbyChat = useCallback(
    async (item: NowPost) => {
      if (!currentUserId) {
        Alert.alert(t("now.signInTitle"), t("now.signInBody"));
        return;
      }
      const peerUid = String(item.authorUid ?? "").trim();
      if (!peerUid || peerUid === currentUserId) return;

      setChatOpeningPostId(item.id);
      try {
        const peerName = resolveAuthorLabel(item);
        const thread = await chatApi.openDirectThread(peerUid, {
          type: "nearby",
          sourceId: item.id,
        });

        navigation.navigate("DMChat", {
          threadId: thread.id,
          peerId: thread.peer?.id || peerUid,
          peerName: thread.peer?.displayName?.trim() || peerName,
          sourceContext: {
            source: "nearby",
            sourceSessionId: item.id,
          },
        });
      } catch {
        Alert.alert(t("now.chatFailedTitle"), t("now.chatFailedBody"));
      } finally {
        if (mountedRef.current) {
          setChatOpeningPostId(null);
        }
      }
    },
    [currentUserId, navigation, resolveAuthorLabel, t]
  );

  const removeOwnStatus = useCallback(
    async (item: NowPost) => {
      if (!currentUserId || item.authorUid !== currentUserId) return;

      setDeletingPostId(item.id);
      try {
        await nearbyApi.deleteStatus(item.id);
        setPosts((current) => current.filter((post) => post.id !== item.id));
        setReloadKey((prev) => prev + 1);
      } catch {
        Alert.alert(t("now.deleteFailedTitle"), t("now.deleteFailedBody"));
      } finally {
        if (mountedRef.current) {
          setDeletingPostId(null);
        }
      }
    },
    [currentUserId, t]
  );

  const reportNearbyPost = useCallback(
    async (item: NowPost, reason: SafetyReportReason) => {
      const authorUid = String(item.authorUid ?? "").trim();
      if (!item.id || !authorUid || reportingPostId || reportInFlightRef.current) return;

      reportInFlightRef.current = true;
      setReportingPostId(item.id);
      try {
        await safetyApi.report({
          targetType: "message",
          targetId: item.id,
          targetOwnerUserId: authorUid,
          reason,
        });
        Alert.alert(t("safety.reportSentTitle"), t("safety.reportSentBody"));
      } catch {
        Alert.alert(t("safety.reportErrorTitle"), t("safety.reportErrorBody"));
      } finally {
        reportInFlightRef.current = false;
        if (mountedRef.current) {
          setReportingPostId(null);
        }
      }
    },
    [reportingPostId, t]
  );

  const handleReportNearbyPost = useCallback(
    (item: NowPost) => {
      Alert.alert(
        t("safety.reportTitle"),
        t("safety.reportBody"),
        buildReportReasonButtons(t, (reason) => void reportNearbyPost(item, reason))
      );
    },
    [reportNearbyPost, t]
  );

  const locationGateTitle = useMemo(() => {
    if (prefsLoading || posLoading) {
      return copyOrFallback(
        t,
        "nearby.now.locationLoadingTitle",
        "Подготавливаем раздел «Рядом»"
      );
    }
    if (permissionBlocked) {
      return copyOrFallback(
        t,
        "nearby.now.locationBlockedTitle",
        "Без геолокации «Рядом» не откроется честно"
      );
    }
    if (locationDeclined) {
      return copyOrFallback(
        t,
        "nearby.now.locationDeclinedTitle",
        "Чтобы открыть «Рядом», включи геолокацию"
      );
    }
    if (locationEnabled) {
      return copyOrFallback(
        t,
        "nearby.now.locationRetryTitle",
        "Нужно обновить геолокацию"
      );
    }
    return copyOrFallback(
      t,
      "nearby.now.locationPromptTitle",
      "Включи геолокацию для людей рядом"
    );
  }, [locationDeclined, locationEnabled, permissionBlocked, posLoading, prefsLoading, t]);

  const locationGateBody = useMemo(() => {
    if (prefsLoading || posLoading) {
      return copyOrFallback(
        t,
        "nearby.now.locationLoadingBody",
        "Проверяем геолокацию. Без неё раздел не сможет честно показать людей рядом и не откроет отправку моментного статуса."
      );
    }
    if (permissionBlocked) {
      return copyOrFallback(
        t,
        "nearby.now.locationBlockedBody",
        "«Рядом» зависит от того, кто рядом в этот момент. Пока доступ к геолокации выключен, не будет ни ленты рядом, ни публикации твоего сигнала."
      );
    }
    if (locationDeclined) {
      return copyOrFallback(
        t,
        "nearby.now.locationDeclinedBody",
        "Без геолокации раздел не показывает людей рядом и не публикует моментный статус. После включения сразу откроются лента и отправка."
      );
    }
    if (locationEnabled) {
      return (
        locationError ??
        copyOrFallback(
          t,
          "nearby.now.locationRetryBody",
          "Доступ уже включён, но координаты ещё не обновились. Пока лента рядом и отправка статуса остаются недоступны."
        )
      );
    }
    return copyOrFallback(
      t,
      "nearby.now.locationPromptBody",
      "Это моментный сигнал вокруг твоего места. Без геолокации раздел не может честно показать людей рядом или принять твой статус."
    );
  }, [locationDeclined, locationEnabled, locationError, permissionBlocked, posLoading, prefsLoading, t]);

  const locationGateActionLabel = useMemo(() => {
    if (prefsLoading || posLoading) return "";
    if (permissionBlocked) return t("geo.openSettings");
    if (locationDeclined) return t("geo.enableLocation");
    if (locationEnabled) return t("geo.refreshLocation");
    return t("geo.enableLocation");
  }, [locationDeclined, locationEnabled, permissionBlocked, posLoading, prefsLoading, t]);

  const handleLocationGateAction = useCallback(() => {
    if (permissionBlocked) {
      handleLocationSettings();
      return;
    }
    void handleEnableLocation();
  }, [handleEnableLocation, handleLocationSettings, permissionBlocked]);

  const renderLocationGate = !pos ? (
    <View style={styles.locationGateCard}>
      <View style={styles.locationGateIconWrap}>
        <Ionicons
          name={permissionBlocked ? "location" : "location-outline"}
          size={18}
          color={permissionBlocked ? "#FCA5A5" : theme.colors.accent}
        />
      </View>
      <View style={styles.locationGateCopy}>
        <Text style={styles.locationGateTitle}>{locationGateTitle}</Text>
        <Text style={styles.locationGateBody}>{locationGateBody}</Text>
      </View>
      {!prefsLoading && !posLoading ? (
        <View style={styles.locationGateFacts}>
          <View style={styles.locationGateFactPill}>
            <Text style={styles.locationGateFactText}>
              {copyOrFallback(
                t,
                "nearby.now.feedLocked",
                "Сигналы рядом недоступны"
              )}
            </Text>
          </View>
          <View style={styles.locationGateFactPill}>
            <Text style={styles.locationGateFactText}>
              {copyOrFallback(
                t,
                "nearby.now.postLocked",
                "Отправка сигнала недоступна"
              )}
            </Text>
          </View>
        </View>
      ) : null}
      {!prefsLoading && !posLoading ? (
        <View style={styles.locationGateActions}>
          <Pressable onPress={handleLocationGateAction} style={styles.locationGatePrimaryButton}>
            <Text style={styles.locationGatePrimaryButtonText}>{locationGateActionLabel}</Text>
          </Pressable>
          {permissionBlocked ? (
            <Pressable onPress={() => void syncLocationState()} style={styles.locationGateSecondaryButton}>
              <Text style={styles.locationGateSecondaryButtonText}>{t("common.retry")}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  ) : null;

  const renderHero = showHero ? (
    <View style={styles.heroCard}>
      <Text style={styles.heroKicker}>{t("now.heroKicker")}</Text>
      <Text style={styles.heroTitle}>{t("now.heroTitle")}</Text>
      <Text style={styles.heroBody}>{t("now.heroBody")}</Text>
      <View style={styles.heroActions}>
        <Pressable onPress={goToTogether} style={styles.heroPrimaryButton}>
          <Text style={styles.heroPrimaryButtonText}>{t("now.goToTogether")}</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const renderComposer = pos ? (
    <View style={styles.composerCard}>
      <View style={styles.composerTop}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{t("now.myStatusTitle")}</Text>
          <Text style={styles.sectionBody}>{t("now.myStatusBody")}</Text>
        </View>
      </View>

      <View style={styles.moodRow}>
        {moodMeta.map((item) => {
          const active = item.key === mood;
          return (
            <TouchableOpacity
              key={item.key}
              onPress={() => setMood(item.key)}
              style={[
                styles.moodChip,
                active ? styles.moodChipActive : null,
              ]}
            >
              <Text style={styles.moodEmoji}>{item.emoji}</Text>
              <Text style={[styles.moodText, active ? styles.moodTextActive : null]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={t("now.placeholder")}
        placeholderTextColor="rgba(226,232,255,0.46)"
        multiline
        style={styles.input}
      />

      <View style={styles.composerFooter}>
        <View style={{ flex: 1 }}>
          {posLoading ? (
            <View style={styles.locationRow}>
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.locationText}>{t("geo.locationUpdating")}</Text>
            </View>
          ) : (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color="#A7F3D0" />
              <Text style={styles.locationText} numberOfLines={1}>
                {t("geo.locationReady")} (~{Math.round(pos.accuracy ?? 0)} {t("units.m")})
              </Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={() => void onSend()}
          disabled={sending}
          style={[styles.sendButton, sending ? styles.sendButtonDisabled : null]}
        >
          <Text style={styles.sendButtonText}>{t("now.send")}</Text>
        </TouchableOpacity>
      </View>
      {lastPublishedAt ? (
        <Text style={styles.publishSuccessText}>
          {t("now.publishSuccess", {
            hours: String(Math.round(NEARBY_STATUS_TTL_MS / 3600000)),
          })}
        </Text>
      ) : null}
    </View>
  ) : null;

  const header = (
    <View style={styles.headerContent}>
      {renderHero}
      {renderLocationGate}
      {showStandaloneHeading ? (
        <Text style={styles.sectionHeading}>{t("now.myVibeTitle")}</Text>
      ) : null}
      {renderComposer}
      {pos ? (
        <>
          <View style={styles.listHeaderRow}>
            <Text style={styles.listTitle}>{t("now.peopleNearby")}</Text>
            <Text style={styles.listMeta}>
              {t("common.radius")}:{" "}
              {radiusKm == null
                ? t("now.radiusAll")
                : t("now.radiusUpTo", { km: String(radiusKm) })}
            </Text>
          </View>

          <View style={styles.radiusRow}>
            {RADIUS_OPTIONS.map((option, index) => {
              const active = radiusKm === option;
              const label = option == null ? t("common.all") : `${option} ${t("units.km")}`;
              return (
                <TouchableOpacity
                  key={`${String(option)}_${index}`}
                  onPress={() => setRadiusKm(option)}
                  style={[styles.radiusChip, active ? styles.radiusChipActive : null]}
                >
                  <Text style={[styles.radiusText, active ? styles.radiusTextActive : null]}>
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      ) : null}
    </View>
  );

  const renderPostItem = ({ item }: { item: NowPost }) => {
    const moodInfo = moodMeta.find((meta) => meta.key === item.mood) ?? moodMeta[0];
    const distance = distanceKm(pos, item);
    const authorUid = String(item.authorUid ?? "").trim();
    const isOwnPost = Boolean(currentUserId && authorUid === currentUserId);
    const authorLabel = resolveAuthorLabel(item);
    const opening = chatOpeningPostId === item.id;
    const deleting = deletingPostId === item.id;
    const reporting = reportingPostId === item.id;

    return (
      <View style={styles.postCard}>
        <View style={styles.postTopRow}>
          <View style={styles.postMoodPill}>
            <Text style={styles.postMoodEmoji}>{moodInfo.emoji}</Text>
            <Text style={styles.postMoodText}>{moodInfo.label}</Text>
          </View>
          <View style={styles.postMetaPill}>
            <Text style={styles.postMetaText}>
              {formatAgoLong(item.createdAt, t)}
              {distance != null ? ` • ~${distance} ${t("units.km")}` : ""}
            </Text>
          </View>
        </View>
        <Text style={styles.postText}>{item.text}</Text>
        <View style={styles.postFooter}>
          <UserAvatar avatarUrl={item.authorAvatarUrl} label={authorLabel} size={24} />
          <Text style={styles.postAuthor}>{authorLabel}</Text>
          {isOwnPost ? (
            <View style={styles.ownPostPill}>
              <Text style={styles.ownPostPillText}>{t("now.ownStatus")}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.postActions}>
          {isOwnPost ? (
            <TouchableOpacity
              onPress={() => void removeOwnStatus(item)}
              disabled={deleting}
              style={[styles.postSecondaryButton, deleting ? styles.postButtonDisabled : null]}
              activeOpacity={0.85}
            >
              <Text style={styles.postSecondaryButtonText}>
                {deleting ? t("now.deletingStatus") : t("now.deleteStatus")}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                onPress={() => void openNearbyChat(item)}
                disabled={opening}
                style={[styles.postPrimaryButton, opening ? styles.postButtonDisabled : null]}
                activeOpacity={0.85}
              >
                <Text style={styles.postPrimaryButtonText}>
                  {opening ? t("now.openingChat") : t("now.writeFromNearby")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => handleReportNearbyPost(item)}
                disabled={reporting}
                style={[styles.postSecondaryButton, reporting ? styles.postButtonDisabled : null]}
                activeOpacity={0.85}
              >
                <Text style={styles.postSecondaryButtonText}>{t("safety.report")}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.root}>
        <FlatList
          data={[]}
          keyExtractor={(_, index) => String(index)}
          renderItem={() => null}
          ListHeaderComponent={
            <View>
              {header}
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={theme.colors.primary} />
              </View>
            </View>
          }
          contentContainerStyle={{
            paddingTop: 6,
            paddingBottom: bottomInset ?? insets.bottom + 16,
          }}
          showsVerticalScrollIndicator={false}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={visiblePosts}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderPostItem}
        ListHeaderComponent={header}
        ListEmptyComponent={pos ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {feedError
                  ? copyOrFallback(t, "now.feedErrorTitle", "Лента временно недоступна")
                  : copyOrFallback(t, "nearby.now.emptyTitle", "Пока рядом тихо")}
              </Text>
              <Text style={styles.emptyText}>
                {feedError ?? t("now.noneNearby")}
              </Text>
            </View>
          </View>
        ) : null}
        contentContainerStyle={{
          paddingTop: 6,
          paddingBottom: bottomInset ?? insets.bottom + 16,
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerContent: {
    gap: 8,
    paddingHorizontal: 2,
    paddingBottom: 6,
  },
  heroCard: {
    padding: 14,
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  heroKicker: {
    color: "#A9FFF0",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    marginBottom: 4,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
    marginBottom: 6,
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  heroPrimaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 8,
    backgroundColor: theme.colors.success,
  },
  heroPrimaryButtonText: {
    color: "#042A26",
    fontSize: 12,
    fontWeight: "800",
  },
  sectionHeading: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 1,
    paddingHorizontal: 2,
  },
  locationGateCard: {
    padding: 12,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 10,
  },
  locationGateIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(70,224,200,0.08)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.14)",
  },
  locationGateCopy: {
    gap: 5,
  },
  locationGateTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  locationGateBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  locationGateFacts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  locationGateFactPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.12)",
  },
  locationGateFactText: {
    color: "#D7FDF5",
    fontSize: 11,
    fontWeight: "700",
  },
  locationGateActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  locationGatePrimaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: theme.colors.success,
  },
  locationGatePrimaryButtonText: {
    color: "#042A26",
    fontSize: 12,
    fontWeight: "800",
  },
  locationGateSecondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 13,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  locationGateSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  composerCard: {
    borderRadius: 18,
    padding: 12,
    backgroundColor: "rgba(5,8,22,0.42)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.12)",
    gap: 8,
  },
  composerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  sectionTitle: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "800",
  },
  sectionBody: {
    color: "#9CA3AF",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 2,
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 32,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  moodChipActive: {
    backgroundColor: "rgba(70,224,200,0.14)",
    borderColor: "rgba(70,224,200,0.24)",
  },
  moodEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  moodText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "600",
  },
  moodTextActive: {
    fontWeight: "800",
  },
  input: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    minHeight: 68,
    textAlignVertical: "top",
  },
  composerFooter: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(70,224,200,0.08)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.14)",
    flexShrink: 1,
  },
  locationText: {
    color: "#9CA3AF",
    fontSize: 11,
    flexShrink: 1,
  },
  sendButton: {
    minWidth: 92,
    minHeight: 38,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.success,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-end",
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(70,224,200,0.28)",
  },
  sendButtonText: {
    color: "#042A26",
    fontSize: 12,
    fontWeight: "800",
  },
  publishSuccessText: {
    color: "#A7F3D0",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 6,
  },
  listTitle: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "800",
  },
  listMeta: {
    color: "#9CA3AF",
    fontSize: 11,
  },
  radiusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  radiusChip: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  radiusChipActive: {
    backgroundColor: "rgba(70,224,200,0.16)",
    borderColor: "rgba(70,224,200,0.24)",
  },
  radiusText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "600",
  },
  radiusTextActive: {
    fontWeight: "800",
  },
  postCard: {
    padding: 12,
    marginBottom: 6,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(230,185,118,0.14)",
    gap: 8,
  },
  postTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  postMetaPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  postMetaText: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "700",
  },
  postMoodPill: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(110, 231, 183, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(110, 231, 183, 0.18)",
  },
  postMoodEmoji: {
    fontSize: 13,
  },
  postMoodText: {
    color: "#CFFAE9",
    fontSize: 11,
    fontWeight: "800",
  },
  postText: {
    color: "#E5E7EB",
    fontSize: 14,
    lineHeight: 20,
  },
  postFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  postAuthor: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
    flex: 1,
  },
  ownPostPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: "rgba(70,224,200,0.10)",
    borderWidth: 1,
    borderColor: "rgba(70,224,200,0.18)",
  },
  ownPostPillText: {
    color: "#A7F3D0",
    fontSize: 10,
    fontWeight: "800",
  },
  postActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  postPrimaryButton: {
    minHeight: 34,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.success,
    alignItems: "center",
    justifyContent: "center",
  },
  postPrimaryButtonText: {
    color: "#042A26",
    fontSize: 12,
    fontWeight: "800",
  },
  postSecondaryButton: {
    minHeight: 34,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  postSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  postButtonDisabled: {
    opacity: 0.58,
  },
  loadingWrap: {
    paddingTop: 24,
    paddingBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    paddingTop: 6,
  },
  emptyCard: {
    padding: 12,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 4,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 12,
    lineHeight: 17,
  },
});
