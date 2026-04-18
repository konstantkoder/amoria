// FILE: src/screens/RoomsScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Alert,
  BackHandler,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import * as Location from "expo-location";
import { geohashForLocation } from "geofire-common";

import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import RoomsChatStage from "@/components/rooms/RoomsChatStage";
import RoomsChooseStage from "@/components/rooms/RoomsChooseStage";
import type {
  RoomMapPin,
  RoomPosition,
  RoomsRangePreset,
  RoomUiMessage,
} from "@/components/rooms/types";
import ScreenShell from "@/components/ScreenShell";
import { OpenStreetMapWebView } from "@/components/OpenStreetMapWebView";
import LocationConsentModal from "@/components/LocationConsentModal";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type RoomsOrigin,
  type RootStackNavigationProp,
  type RoomsRouteProp,
} from "@/navigation/appRoutes";
import { openNearbySection } from "@/navigation/nearbyNavigation";
import { translateMaybeKey } from "@/utils/i18n";
import { formatNickname } from "@/utils/nickname";
import { withTimeout } from "@/utils/withTimeout";
import {
  loadLocationPrefs,
  setLocationConsent,
  setNearbyEnabled,
  setShareMeOnMap,
  setShowPeopleOnMap,
  type LocationPrefs,
} from "@/services/locationPrivacy";
import {
  clearPresence,
  subscribePresenceByPrefix,
  upsertPresence,
  type PresenceDoc,
} from "@/services/presence";
import {
  type RoomDoc,
  type RoomKind,
  type RoomMember,
  type RoomMessage,
  ROOM_KIND_ORDER,
  getRoomMeta,
  makeNickname,
  openOrCreateGeoRoom,
  sendRoomMessage,
  subscribeRoomMembers,
  subscribeRoomMessages,
  touchRoomMember,
} from "@/services/rooms";

type LatLng = {
  latitude: number;
  longitude: number;
};

type ConsentAction =
  | { type: "enableNearby" }
  | { type: "enterRoom"; kind: RoomKind };

type TranslateFn = (key: string) => string;

const SEND_TIMEOUT_MS = 20000;
const POSITION_TIMEOUT_MS = 8000;
const ROOM_OPEN_TIMEOUT_MS = 20000;
const DRAFT_RESUME_DELAY_MS = 180;
const SEND_DRAFT_RESUME_DELAY_MS = 200;
const SEND_GUARD_RELEASE_MS = 250;

const RANGE_PRESETS: readonly RoomsRangePreset[] = [
  { id: "wide", labelKey: "rooms.range.wide", delta: -1, scale: 2.1 },
  { id: "normal", labelKey: "rooms.range.normal", delta: 0, scale: 1.0 },
  { id: "tight", labelKey: "rooms.range.tight", delta: 1, scale: 0.55 },
];

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

function offsetPosition(base: RoomPosition, eastM: number, northM: number): LatLng {
  const latOffset = northM / 111_320; // метры в градусы широты
  const lngOffset =
    eastM / (111_320 * Math.cos((base.lat * Math.PI) / 180));
  return {
    latitude: base.lat + latOffset,
    longitude: base.lng + lngOffset,
  };
}

function getRoomMarkerCoord(base: RoomPosition, kind: RoomKind): LatLng {
  switch (kind) {
    case "work":
      return offsetPosition(base, 0, 200);
    case "bar":
      return offsetPosition(base, 180, 80);
    case "cafe":
      return offsetPosition(base, -180, 80);
    case "gym":
      return offsetPosition(base, 150, -80);
    case "park":
      return offsetPosition(base, -200, -40);
    case "home":
      return offsetPosition(base, 0, -200);
    default:
      return offsetPosition(base, 0, 150);
  }
}

function toRoomPosition(coords: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}): RoomPosition {
  return {
    lat: coords.latitude,
    lng: coords.longitude,
    accuracy: coords.accuracy,
  };
}

function clearTimeoutRef(
  ref: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
) {
  if (!ref.current) return;
  clearTimeout(ref.current);
  ref.current = null;
}

function buildRoomClientId(uid: string) {
  return `m_${uid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getRoomsLocationErrorBody(message: string, t: TranslateFn) {
  const lower = message.toLowerCase();
  if (lower.includes("timeout")) {
    return t("geo.timeout");
  }
  if (lower.includes("blocked")) {
    return t("geo.permissionBlockedHelp");
  }
  if (lower.includes("permission") || lower.includes("denied")) {
    return t("geo.permissionRequired");
  }
  return t("geo.noLocationAccess");
}

function getRoomOpenErrorBody(_: string, t: TranslateFn) {
  return t("rooms.openFailed");
}

function getRoomsOrigin(origin: RoomsOrigin | undefined): RoomsOrigin {
  return origin === "together" ? "together" : "nearby";
}

export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const navigation = useNavigation<RootStackNavigationProp<"Rooms">>();
  const route = useRoute<RoomsRouteProp>();
  const origin = getRoomsOrigin(route.params?.origin);
  const uid = auth?.currentUser?.uid ?? null;
  const nicknameCode = useMemo(
    () => (uid ? makeNickname(uid) : "common.anonymous"),
    [uid],
  );
  const nicknameLabel = useMemo(() => {
    const formatted = formatNickname(nicknameCode, t);
    return formatted === nicknameCode
      ? translateMaybeKey(nicknameCode, t, ["common."])
      : formatted;
  }, [nicknameCode, t]);

  const [selectedKind, setSelectedKind] = useState<RoomKind | null>(null);
  const [joiningKind, setJoiningKind] = useState<RoomKind | null>(null);
  const [rangeIndex, setRangeIndex] = useState<number>(1);
  const range = RANGE_PRESETS[rangeIndex];
  const [pos, setPos] = useState<RoomPosition | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [posRefreshing, setPosRefreshing] = useState(false);
  const locInFlight = useRef<Promise<RoomPosition | null> | null>(null);
  const locationRequestIdRef = useRef(0);
  const locationInFlightRequestIdRef = useRef<number | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [prefs, setPrefs] = useState<LocationPrefs>({
    consent: "unknown",
    nearbyEnabled: false,
    showPeopleOnMap: false,
    shareMeOnMap: false,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const hasLoadedPrefsRef = useRef(false);
  const [consentVisible, setConsentVisible] = useState(false);
  const [consentAction, setConsentAction] = useState<ConsentAction | null>(null);
  const [pendingRoomKind, setPendingRoomKind] = useState<RoomKind | null>(null);
  const [nearbyPeople, setNearbyPeople] = useState<PresenceDoc[]>([]);
  const [mapExpanded, setMapExpanded] = useState(false);

  const goToTogetherTab = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);
  const goToNearbyRooms = useCallback(() => {
    openNearbySection(navigation, "rooms");
  }, [navigation]);

  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [failedById, setFailedById] = useState<Record<string, true>>({});
  const [members, setMembers] = useState<RoomMember[]>([]);
  const inputRef = useRef<TextInput>(null);
  const draftRef = useRef<string>("");
  const draftResumeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const joinRequestIdRef = useRef(0);
  const activeRoomIdRef = useRef<string | null>(null);
  const retryingMessageIdsRef = useRef<Set<string>>(new Set());
  const canSendRef = useRef<boolean>(false);
  const sendGuardRef = useRef(false);
  const sendGuardReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  // Ignore late IME events that sometimes land after clear()/blur().
  const ignoreDraftEventsRef = useRef(false);
  const [canSend, setCanSend] = useState(false);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<RoomUiMessage>>(null);
  const isChatStage = room !== null;

  const invalidateLocationRequests = useCallback(() => {
    locationRequestIdRef.current += 1;
    locationInFlightRequestIdRef.current = null;
    locInFlight.current = null;
  }, []);

  const invalidateJoinRequests = useCallback(() => {
    joinRequestIdRef.current += 1;
  }, []);

  const isLocationRequestActive = useCallback((requestId: number) => {
    return mountedRef.current && locationRequestIdRef.current === requestId;
  }, []);

  const isRoomStillActive = useCallback((roomId: string) => {
    return mountedRef.current && activeRoomIdRef.current === roomId;
  }, []);

  const handleDraftChange = useCallback((v: string) => {
    if (ignoreDraftEventsRef.current) return;
    draftRef.current = v;
    const next = v.trim().length > 0;
    if (next !== canSendRef.current) {
      canSendRef.current = next;
      setCanSend(next);
    }
  }, []);

  const resumeDraftEventsLater = useCallback((delayMs: number) => {
    clearTimeoutRef(draftResumeTimeoutRef);
    draftResumeTimeoutRef.current = setTimeout(() => {
      ignoreDraftEventsRef.current = false;
      draftResumeTimeoutRef.current = null;
    }, delayMs);
  }, []);

  const clearDraft = useCallback((options?: { blurInput?: boolean }) => {
    ignoreDraftEventsRef.current = true;
    draftRef.current = "";
    canSendRef.current = false;
    setCanSend(false);
    inputRef.current?.setNativeProps?.({ text: "" });
    inputRef.current?.clear?.();
    if (options?.blurInput) {
      inputRef.current?.blur?.();
      Keyboard.dismiss();
    }
    resumeDraftEventsLater(
      options?.blurInput ? SEND_DRAFT_RESUME_DELAY_MS : DRAFT_RESUME_DELAY_MS
    );
  }, [resumeDraftEventsLater]);

  const scrollToLatestMessage = useCallback((animated: boolean) => {
    requestAnimationFrame(() =>
      listRef.current?.scrollToOffset({ offset: 0, animated })
    );
  }, []);

  const clearFailedMessage = useCallback((clientId: string) => {
    setFailedById((prev) => {
      if (!prev[clientId]) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });
  }, []);

  const markFailedMessage = useCallback((clientId: string) => {
    setFailedById((prev) =>
      prev[clientId] ? prev : { ...prev, [clientId]: true }
    );
  }, []);

  const releaseSendGuardLater = useCallback(() => {
    clearTimeoutRef(sendGuardReleaseTimeoutRef);
    sendGuardReleaseTimeoutRef.current = setTimeout(() => {
      sendGuardRef.current = false;
      sendGuardReleaseTimeoutRef.current = null;
    }, SEND_GUARD_RELEASE_MS);
  }, []);

  const activeMembers = useMemo(() => {
    const cutoff = Date.now() - 2 * 60 * 1000; // 2 минуты
    const uniq = new Map<string, RoomMember>();
    for (const m of members) {
      if (m.lastSeen >= cutoff) uniq.set(m.uid, m);
    }
    return Array.from(uniq.values());
  }, [members]);

  const updatePrefs = useCallback(
    (patch: Partial<LocationPrefs>) => {
      setPrefs((prev) => ({ ...prev, ...patch }));
    },
    []
  );
  const locationEnabled = prefs.nearbyEnabled && prefs.consent === "accepted";
  const canShowPeople = locationEnabled && prefs.showPeopleOnMap;
  const canSharePresence = locationEnabled && prefs.shareMeOnMap;

  const handleOpenSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  const openConsentFlow = useCallback((action: ConsentAction) => {
    if (!mountedRef.current) return;
    setConsentAction(action);
    setConsentVisible(true);
  }, []);

  const enableNearbyPreference = useCallback(async () => {
    if (prefs.nearbyEnabled) return;
    await setNearbyEnabled(true);
    if (!mountedRef.current) return;
    updatePrefs({ nearbyEnabled: true });
  }, [prefs.nearbyEnabled, updatePrefs]);

  const clearSharedPresence = useCallback(() => {
    if (!db || !uid) return;
    clearPresence(db, uid).catch(() => {});
  }, [db, uid]);

  const ensureRealtimeReady = useCallback(() => {
    if (!uid) {
      Alert.alert(t("rooms.signInTitle"), t("rooms.signInBody"));
      return false;
    }
    if (!isFirebaseConfigured() || !db) {
      Alert.alert(t("rooms.firebaseTitle"), t("rooms.firebaseBody"));
      return false;
    }
    return true;
  }, [t, uid]);

  const showNearbyDisabledAlert = useCallback(() => {
    Alert.alert(t("settings.nearbyEnabled"), t("rooms.enableForMap"), [
      {
        text: t("menu.settings"),
        onPress: () => navigation.navigate("Settings"),
      },
      { text: t("common.cancel"), style: "cancel" },
    ]);
  }, [navigation, t]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      retryingMessageIdsRef.current.clear();
      invalidateJoinRequests();
      invalidateLocationRequests();
      clearTimeoutRef(draftResumeTimeoutRef);
      clearTimeoutRef(sendGuardReleaseTimeoutRef);
    };
  }, [invalidateJoinRequests, invalidateLocationRequests]);

  useEffect(() => {
    activeRoomIdRef.current = room?.id ?? null;
  }, [room]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      if (!hasLoadedPrefsRef.current) {
        setLoadingPrefs(true);
      }
      (async () => {
        const next = await loadLocationPrefs();
        if (!alive) return;
        setPrefs(next);
        hasLoadedPrefsRef.current = true;
        setLoadingPrefs(false);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const ensurePosition = useCallback(
    async (options?: { allowPermissionPrompt?: boolean }): Promise<RoomPosition | null> => {
      if (
        locInFlight.current &&
        locationInFlightRequestIdRef.current === locationRequestIdRef.current
      ) {
        return locInFlight.current;
      }

      const requestId = locationRequestIdRef.current + 1;
      const allowPermissionPrompt = options?.allowPermissionPrompt !== false;
      const hadStablePosition = Boolean(pos);
      locationRequestIdRef.current = requestId;
      locationInFlightRequestIdRef.current = requestId;

      let task: Promise<RoomPosition | null>;
      task = (async (): Promise<RoomPosition | null> => {
        let backgroundRefreshStarted = false;
        let appliedPosition: RoomPosition | null = null;

        if (isLocationRequestActive(requestId)) {
          setPosError(null);
          if (hadStablePosition) {
            setPosRefreshing(true);
          } else {
            setPosLoading(true);
          }
        }

        const applyPosition = (next: RoomPosition) => {
          appliedPosition = next;
          if (!isLocationRequestActive(requestId)) return;
          setPos(next);
          setPosError(null);
          setPermissionBlocked(false);
        };

        try {
          const currentPerm = await Location.getForegroundPermissionsAsync();
          let granted = currentPerm.status === "granted";
          let canAskAgain = currentPerm.canAskAgain;

          if (!granted && allowPermissionPrompt) {
            const req = await Location.requestForegroundPermissionsAsync();
            if (!mountedRef.current) return null;
            granted = req.status === "granted";
            canAskAgain = req.canAskAgain;
          }

          if (!granted) {
            const blocked = canAskAgain === false;
            if (isLocationRequestActive(requestId)) {
              setPermissionBlocked(blocked);
              setPosRefreshing(false);
              setPosLoading(false);
              setPos(null);
              setPosError(
                blocked ? t("geo.permissionBlockedHelp") : t("geo.permissionRequired")
              );
            }

            if (blocked && allowPermissionPrompt && mountedRef.current) {
              Alert.alert(
                t("geo.permissionBlocked"),
                t("geo.permissionBlockedHelp"),
                [
                  {
                    text: t("geo.openSettings"),
                    onPress: handleOpenSettings,
                  },
                ]
              );
            }
            return null;
          }

          if (isLocationRequestActive(requestId)) {
            setPermissionBlocked(false);
          }

          const last = await Location.getLastKnownPositionAsync();
          if (last) {
            const quick = toRoomPosition(last.coords);
            applyPosition(quick);

            if (isLocationRequestActive(requestId)) {
              setPosLoading(false);
              setPosRefreshing(true);
            }

            backgroundRefreshStarted = true;
            void (async () => {
              try {
                const current = await withTimeout(
                  Location.getCurrentPositionAsync({
                    accuracy: Location.Accuracy.Balanced,
                  }),
                  POSITION_TIMEOUT_MS,
                  "rooms.position"
                );
                applyPosition(toRoomPosition(current.coords));
              } catch (e: any) {
                if (!isLocationRequestActive(requestId) || appliedPosition) return;
                const msg = String(e?.message ?? "");
                setPosError(getRoomsLocationErrorBody(msg, t));
              } finally {
                if (isLocationRequestActive(requestId)) {
                  setPosRefreshing(false);
                }
              }
            })();

            return quick;
          }

          const current = await withTimeout(
            Location.getCurrentPositionAsync({
              accuracy: Location.Accuracy.Balanced,
            }),
            POSITION_TIMEOUT_MS,
            "rooms.position"
          );

          const next = toRoomPosition(current.coords);
          applyPosition(next);
          return next;
        } catch (e: any) {
          if (isLocationRequestActive(requestId) && !appliedPosition) {
            const msg = String(e?.message ?? "");
            setPosError(getRoomsLocationErrorBody(msg, t));
          }
          return appliedPosition;
        } finally {
          if (locationInFlightRequestIdRef.current === requestId) {
            locationInFlightRequestIdRef.current = null;
          }
          if (locInFlight.current === task) {
            locInFlight.current = null;
          }
          if (isLocationRequestActive(requestId)) {
            setPosLoading(false);
            if (!backgroundRefreshStarted) {
              setPosRefreshing(false);
            }
          }
        }
      })();

      locInFlight.current = task;
      return task;
    },
    [handleOpenSettings, isLocationRequestActive, pos, t]
  );

  const handleConsentAccept = useCallback(async () => {
    const action = consentAction;
    if (mountedRef.current) {
      setConsentVisible(false);
      setConsentAction(null);
    }
    await setLocationConsent("accepted");
    if (!mountedRef.current) return;
    updatePrefs({ consent: "accepted" });

    if (action) {
      await enableNearbyPreference();
      if (!mountedRef.current) return;
      if (action.type === "enterRoom") {
        setPendingRoomKind(action.kind);
      } else {
        void ensurePosition({ allowPermissionPrompt: true });
      }
    }
  }, [consentAction, enableNearbyPreference, ensurePosition, updatePrefs]);

  const handleConsentDecline = useCallback(async () => {
    if (mountedRef.current) {
      setConsentVisible(false);
      setConsentAction(null);
      setPendingRoomKind(null);
    }
    await Promise.all([
      setLocationConsent("declined"),
      setNearbyEnabled(false),
      setShowPeopleOnMap(false),
      setShareMeOnMap(false),
    ]);
    if (!mountedRef.current) return;
    updatePrefs({
      consent: "declined",
      nearbyEnabled: false,
      showPeopleOnMap: false,
      shareMeOnMap: false,
    });
  }, [updatePrefs]);

  const handleEnableNearby = useCallback(async () => {
    if (prefs.consent !== "accepted") {
      openConsentFlow({ type: "enableNearby" });
      return;
    }
    await enableNearbyPreference();
    void ensurePosition({ allowPermissionPrompt: true });
  }, [prefs.consent, enableNearbyPreference, ensurePosition, openConsentFlow]);

  const handleRefreshPosition = useCallback(async () => {
    if (!prefs.nearbyEnabled) {
      await handleEnableNearby();
      return;
    }
    if (prefs.consent !== "accepted") {
      openConsentFlow({ type: "enableNearby" });
      return;
    }
    await ensurePosition({ allowPermissionPrompt: true });
  }, [
    prefs.consent,
    prefs.nearbyEnabled,
    handleEnableNearby,
    ensurePosition,
    openConsentFlow,
  ]);

  useEffect(() => {
    if (loadingPrefs) return;
    if (!locationEnabled) {
      invalidateLocationRequests();
      if (pos) setPos(null);
      if (posError) setPosError(null);
      if (posLoading) setPosLoading(false);
      if (posRefreshing) setPosRefreshing(false);
      if (permissionBlocked) setPermissionBlocked(false);
      return;
    }
    if (!pos && !posLoading) {
      void ensurePosition({ allowPermissionPrompt: false });
    }
  }, [
    ensurePosition,
    invalidateLocationRequests,
    loadingPrefs,
    locationEnabled,
    permissionBlocked,
    pos,
    posError,
    posLoading,
    posRefreshing,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        if (loadingPrefs) return;
        if (locationEnabled && !pos && !posLoading && !posRefreshing) {
          void ensurePosition({ allowPermissionPrompt: false });
        }
      }
      if (s === "background" && canSharePresence) {
        clearSharedPresence();
      }
    });
    return () => sub.remove();
  }, [
    canSharePresence,
    clearSharedPresence,
    ensurePosition,
    loadingPrefs,
    locationEnabled,
    pos,
    posLoading,
    posRefreshing,
  ]);

  const presencePrecision = useMemo(() => {
    const meta = getRoomMeta(selectedKind ?? "work");
    return clamp(meta.precision + range.delta, 5, 9);
  }, [selectedKind, range.delta]);

  const presencePrefix = useMemo(() => {
    if (!pos) return null;
    return geohashForLocation([pos.lat, pos.lng]).slice(0, presencePrecision);
  }, [pos, presencePrecision]);

  useEffect(() => {
    if (
      !db ||
      !pos ||
      !presencePrefix ||
      !canShowPeople
    ) {
      setNearbyPeople([]);
      return;
    }
    const unsub = subscribePresenceByPrefix(db, presencePrefix, setNearbyPeople);
    return () => {
      unsub?.();
    };
  }, [canShowPeople, db, pos, presencePrefix]);

  useEffect(() => {
    if (canSharePresence) return;
    clearSharedPresence();
  }, [canSharePresence, clearSharedPresence]);

  useEffect(() => {
    if (
      !db ||
      !uid ||
      !pos ||
      !presencePrefix ||
      !canSharePresence
    ) {
      return;
    }

    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        await upsertPresence(db, uid, {
          lat: pos.lat,
          lng: pos.lng,
          prefix: presencePrefix,
          precision: presencePrecision,
        });
      } catch {
        // ignore
      }
    };

    tick();
    const interval = setInterval(tick, 28_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [
    db,
    uid,
    pos,
    presencePrefix,
    presencePrecision,
    canSharePresence,
  ]);

  useEffect(() => {
    return () => {
      if (canSharePresence) {
        clearSharedPresence();
      }
    };
  }, [canSharePresence, clearSharedPresence]);

  const ensureJoinPosition = useCallback(
    async (kind: RoomKind) => {
      if (!ensureRealtimeReady()) return null;
      if (!prefs.nearbyEnabled) {
        showNearbyDisabledAlert();
        return null;
      }
      if (prefs.consent !== "accepted") {
        openConsentFlow({ type: "enterRoom", kind });
        return null;
      }
      return pos ?? (await ensurePosition({ allowPermissionPrompt: true }));
    },
    [
      ensurePosition,
      ensureRealtimeReady,
      openConsentFlow,
      pos,
      prefs.consent,
      prefs.nearbyEnabled,
      showNearbyDisabledAlert,
    ]
  );

  const openRoomWithKind = useCallback(
    async (kind: RoomKind, position: RoomPosition) => {
      if (!db) throw new Error("rooms.dbUnavailable");
      const meta = getRoomMeta(kind);
      const precision = clamp(meta.precision + range.delta, 5, 9);
      const radiusM = Math.max(50, Math.round(meta.radiusM * range.scale));
      return withTimeout(
        openOrCreateGeoRoom(db, kind, position.lat, position.lng, {
          precision,
          radiusM,
        }),
        ROOM_OPEN_TIMEOUT_MS,
        "rooms.open"
      );
    },
    [db, range.delta, range.scale]
  );

  const joinSelected = useCallback(
    async (kind: RoomKind) => {
      if (!mountedRef.current) return;
      if (joiningKind) return;
      const requestId = joinRequestIdRef.current + 1;
      joinRequestIdRef.current = requestId;

      if (mountedRef.current) {
        setJoiningKind(kind);
      }

      const position = await ensureJoinPosition(kind);
      if (!mountedRef.current || joinRequestIdRef.current !== requestId) {
        return;
      }
      if (!position) {
        setJoiningKind(null);
        return;
      }

      try {
        const next = await openRoomWithKind(kind, position);
        if (!mountedRef.current || joinRequestIdRef.current !== requestId) {
          return;
        }
        setRoom(next);
        setSelectedKind(null);
      } catch (e: any) {
        if (!mountedRef.current || joinRequestIdRef.current !== requestId) {
          return;
        }
        const message = String(e?.message ?? "");
        Alert.alert(t("common.error"), getRoomOpenErrorBody(message, t), [
          {
            text: t("common.refresh"),
            onPress: () => void joinSelected(kind),
          },
          { text: t("common.ok") },
        ]);
      } finally {
        if (mountedRef.current && joinRequestIdRef.current === requestId) {
          setJoiningKind(null);
        }
      }
    },
    [
      ensureJoinPosition,
      joiningKind,
      openRoomWithKind,
      t,
    ]
  );

  useEffect(() => {
    if (!pendingRoomKind) return;
    if (prefs.consent !== "accepted" || !prefs.nearbyEnabled) return;
    const kind = pendingRoomKind;
    setPendingRoomKind(null);
    void joinSelected(kind);
  }, [pendingRoomKind, prefs.consent, prefs.nearbyEnabled, joinSelected]);

  useEffect(() => {
    if (!room || !db) return;
    const roomId = room.id;

    const unsubMsgs = subscribeRoomMessages(
      db,
      roomId,
      (next) => {
        if (!isRoomStillActive(roomId)) return;
        setMessages(next);
      }
    );
    const unsubMembers = subscribeRoomMembers(
      db,
      roomId,
      (next) => {
        if (!isRoomStillActive(roomId)) return;
        setMembers(next);
      }
    );

    return () => {
      unsubMsgs?.();
      unsubMembers?.();
    };
  }, [db, isRoomStillActive, room]);

  useEffect(() => {
    if (!room || !db || !uid) return;

    let cancelled = false;

    async function tick() {
      try {
        if (cancelled) return;
        await touchRoomMember(db, room.id, uid, nicknameCode);
      } catch {
        // ignore
      }
    }

    tick();
    const t = setInterval(tick, 20_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [room, uid, nicknameCode, db]);

  useEffect(() => {
    if (!messages.length) return;
    setFailedById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of messages) {
        if (next[m.id] && !m.pending) {
          delete next[m.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [messages]);

  const sendCurrentRoomMessage = useCallback(
    async (roomId: string, text: string, clientId: string) => {
      if (!db || !uid) {
        throw new Error("rooms.sendUnavailable");
      }
      await withTimeout(
        sendRoomMessage(db, roomId, uid, nicknameCode, text, clientId),
        SEND_TIMEOUT_MS,
        "rooms.send"
      );
    },
    [db, nicknameCode, uid]
  );

  const onSend = useCallback(() => {
    const value = (draftRef.current || "").trim();
    if (!value) return;
    if (!room) return;
    if (!ensureRealtimeReady()) return;
    if (sendGuardRef.current) return;

    const targetRoomId = room.id;
    const senderId = uid;
    if (!senderId) return;
    sendGuardRef.current = true;
    if (isRoomStillActive(targetRoomId)) {
      setSending(true);
    }
    clearDraft({ blurInput: true });

    const clientId = buildRoomClientId(senderId);
    clearFailedMessage(clientId);

    void sendCurrentRoomMessage(targetRoomId, value, clientId)
      .then(() => {
        if (!isRoomStillActive(targetRoomId)) return;
        clearFailedMessage(clientId);
        scrollToLatestMessage(true);
      })
      .catch(() => {
        if (!isRoomStillActive(targetRoomId)) return;
        markFailedMessage(clientId);
        scrollToLatestMessage(true);
      })
      .finally(() => {
        if (isRoomStillActive(targetRoomId)) {
          setSending(false);
        }
        releaseSendGuardLater();
      });
  }, [
    clearDraft,
    clearFailedMessage,
    ensureRealtimeReady,
    isRoomStillActive,
    markFailedMessage,
    releaseSendGuardLater,
    room,
    scrollToLatestMessage,
    sendCurrentRoomMessage,
    uid,
  ]);

  const retrySend = useCallback(
    async (clientId: string) => {
      if (!room) return;
      if (!ensureRealtimeReady()) {
        return;
      }
      if (retryingMessageIdsRef.current.has(clientId)) {
        return;
      }

      const target = messages.find((m) => String(m.id) === clientId);
      if (!target) return;
      const targetRoomId = room.id;

      retryingMessageIdsRef.current.add(clientId);
      clearFailedMessage(clientId);

      try {
        await sendCurrentRoomMessage(targetRoomId, target.text, clientId);
      } catch {
        if (isRoomStillActive(targetRoomId)) {
          markFailedMessage(clientId);
        }
      } finally {
        retryingMessageIdsRef.current.delete(clientId);
      }
    },
    [
      clearFailedMessage,
      ensureRealtimeReady,
      isRoomStillActive,
      markFailedMessage,
      messages,
      room,
      sendCurrentRoomMessage,
    ]
  );

  const leaveRoom = useCallback(() => {
    activeRoomIdRef.current = null;
    retryingMessageIdsRef.current.clear();
    sendGuardRef.current = false;
    clearTimeoutRef(sendGuardReleaseTimeoutRef);
    setSending(false);
    setRoom(null);
    setMessages([]);
    setFailedById({});
    setMembers([]);
    clearDraft();
  }, [clearDraft]);

  const goToOriginFallback = useCallback(() => {
    if (origin === "together") {
      goToTogetherTab();
      return;
    }
    goToNearbyRooms();
  }, [goToNearbyRooms, goToTogetherTab, origin]);

  const handleChooseBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    goToOriginFallback();
  }, [goToOriginFallback, navigation]);

  const handleBackPress = useCallback(() => {
    if (room) {
      leaveRoom();
      return;
    }
    handleChooseBack();
  }, [handleChooseBack, leaveRoom, room]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBackPress();
        return true;
      });
      return () => sub.remove();
    }, [handleBackPress])
  );

  const mapPins = useMemo<RoomMapPin[]>(() => {
    const pins: RoomMapPin[] = [];
    if (pos) {
      pins.push({
        id: "me",
        lat: pos.lat,
        lng: pos.lng,
        label: t("common.you"),
      });
      for (const kind of ROOM_KIND_ORDER) {
        const meta = getRoomMeta(kind);
        const coord = getRoomMarkerCoord(pos, kind);
        pins.push({
          id: `room-${kind}`,
          lat: coord.latitude,
          lng: coord.longitude,
          label: `${meta.emoji} ${t(meta.labelKey)}`,
        });
      }
    }
    if (canShowPeople) {
      const cutoff = Date.now() - 5 * 60 * 1000;
      for (const person of nearbyPeople) {
        if (person.updatedAt < cutoff) continue;
        pins.push({
          id: `p-${person.uid}`,
          lat: person.lat,
          lng: person.lng,
          label: t("rooms.someoneNearby"),
        });
      }
    }
    return pins;
  }, [pos, canShowPeople, nearbyPeople, t]);

  const mergedMessages = useMemo<RoomUiMessage[]>(() => {
    const map = new Map<string, RoomUiMessage>();
    for (const m of messages) {
      const id = String(m.id);
      map.set(id, {
        ...m,
        failed: Boolean(failedById[id]),
      });
    }
    const deduped = Array.from(map.values());
    deduped.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return deduped;
  }, [messages, failedById]);

  const handleShowRangeInfo = useCallback(() => {
    Alert.alert(t("rooms.range.title"), t("rooms.range.note"), [{ text: t("common.ok") }]);
  }, [t]);

  const handleJoinSelected = useCallback(() => {
    if (!selectedKind) return;
    void joinSelected(selectedKind);
  }, [joinSelected, selectedKind]);

  const renderMapModal = () => (
    <Modal
      visible={mapExpanded}
      animationType="slide"
      onRequestClose={() => setMapExpanded(false)}
    >
      <View style={{ flex: 1, backgroundColor: "#0B1220" }}>
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 12,
            paddingBottom: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text style={{ color: "#E5E7EB", fontWeight: "800", fontSize: 16 }}>
            {t("rooms.title")}
          </Text>
          <TouchableOpacity
            onPress={() => setMapExpanded(false)}
            style={{
              padding: 8,
              borderRadius: 12,
              backgroundColor: "rgba(255,255,255,0.08)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.12)",
            }}
          >
            <Ionicons name="close-outline" size={20} color="#E5E7EB" />
          </TouchableOpacity>
        </View>

        {pos ? (
          <View style={{ flex: 1, margin: 12, borderRadius: 18, overflow: "hidden" }}>
            <OpenStreetMapWebView
              style={{ flex: 1 }}
              center={{ lat: pos.lat, lng: pos.lng }}
              markers={mapPins}
              zoom={14}
              interactive
            />
          </View>
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 16,
            }}
          >
            <Text style={{ color: "#E5E7EB", fontSize: 14, textAlign: "center" }}>
              {t("rooms.mapLoadingTitle")}
            </Text>
            <Text
              style={{
                color: "#A3A3A3",
                fontSize: 12,
                textAlign: "center",
                marginTop: 6,
              }}
            >
              {t("rooms.mapLoadingBody")}
            </Text>
          </View>
        )}
      </View>
    </Modal>
  );

  const activeRoomMeta = room ? getRoomMeta(room.kind) : null;
  const roomTitle = activeRoomMeta
    ? `${activeRoomMeta.emoji} ${t(activeRoomMeta.labelKey)}`
    : t("tabs.rooms");
  const headerTitle = isChatStage ? roomTitle : t("tabs.rooms");

  return (
    <ScreenShell
      title={headerTitle}
      background="rooms"
      overlayOpacity={0.20}
      blurRadius={0}
      showBack
      onBack={handleBackPress}
    >
      {!isChatStage ? (
        <RoomsChooseStage
          t={t}
          loadingPrefs={loadingPrefs}
          locationEnabled={locationEnabled}
          posLoading={posLoading}
          posRefreshing={posRefreshing}
          pos={pos}
          posError={posError}
          permissionBlocked={permissionBlocked}
          mapPins={mapPins}
          rangePresets={RANGE_PRESETS}
          rangeIndex={rangeIndex}
          selectedKind={selectedKind}
          joiningKind={joiningKind}
          onEnableNearby={() => void handleEnableNearby()}
          onRefreshPosition={() => void handleRefreshPosition()}
          onOpenSettings={handleOpenSettings}
          onShowRangeInfo={handleShowRangeInfo}
          onSelectRange={setRangeIndex}
          onGoToTogether={goToTogetherTab}
          onSelectKind={setSelectedKind}
          onJoinSelected={handleJoinSelected}
          onExpandMap={() => setMapExpanded(true)}
        />
      ) : room ? (
        <RoomsChatStage
          t={t}
          uid={uid}
          room={room}
          activeMembers={activeMembers}
          nicknameLabel={nicknameLabel}
          messages={mergedMessages}
          listRef={listRef}
          inputRef={inputRef}
          canSend={canSend}
          sending={sending}
          safeAreaBottom={insets.bottom}
          onRetrySend={retrySend}
          onSend={onSend}
          onDraftChange={handleDraftChange}
          onRefreshPosition={() => void handleRefreshPosition()}
        />
      ) : null}
      {renderMapModal()}
      <LocationConsentModal
        visible={consentVisible}
        onAccept={handleConsentAccept}
        onDecline={handleConsentDecline}
        onOpenPrivacy={() => navigation.navigate("PrivacyPolicy")}
      />
    </ScreenShell>
  );
}
