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
  type RootStackNavigationProp,
  type RoomsRouteProp,
} from "@/navigation/appRoutes";
import { openNearbySection } from "@/navigation/nearbyNavigation";
import { translateMaybeKey } from "@/utils/i18n";
import { formatNickname } from "@/utils/nickname";
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
  RoomDoc,
  RoomKind,
  RoomMember,
  RoomMessage,
  ROOM_KIND_ORDER,
  getRoomMeta,
  makeNickname,
  openOrCreateGeoRoom,
  sendRoomMessage,
  subscribeRoomMembers,
  subscribeRoomMessages,
  touchRoomMember,
} from "@/services/rooms";

type Stage = "choose" | "chat";

type LatLng = {
  latitude: number;
  longitude: number;
};

const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
  return (await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ])) as T;
};

const SEND_TIMEOUT_MS = 20000;

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

export default function RoomsScreen() {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const navigation = useNavigation<RootStackNavigationProp<"Rooms">>();
  const route = useRoute<RoomsRouteProp>();
  const origin = route.params?.origin === "together" ? "together" : "nearby";
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

  const [stage, setStage] = useState<Stage>("choose");
  const [selectedKind, setSelectedKind] = useState<RoomKind | null>(null);
  const [joiningKind, setJoiningKind] = useState<RoomKind | null>(null);
  const [rangeIndex, setRangeIndex] = useState<number>(1);
  const range = RANGE_PRESETS[rangeIndex];
  const [pos, setPos] = useState<RoomPosition | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const locInFlight = useRef<Promise<RoomPosition | null> | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [prefs, setPrefs] = useState<LocationPrefs>({
    consent: "unknown",
    nearbyEnabled: false,
    showPeopleOnMap: false,
    shareMeOnMap: false,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [consentVisible, setConsentVisible] = useState(false);

  const goToTogetherTab = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);
  const goToNearbyRooms = useCallback(() => {
    openNearbySection(navigation, "rooms");
  }, [navigation]);
  const [consentAction, setConsentAction] = useState<
    | { type: "enableNearby" }
    | { type: "enterRoom"; kind: RoomKind }
    | null
  >(null);
  const [pendingRoomKind, setPendingRoomKind] = useState<RoomKind | null>(null);
  const [nearbyPeople, setNearbyPeople] = useState<PresenceDoc[]>([]);
  const [mapExpanded, setMapExpanded] = useState(false);

  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [failedById, setFailedById] = useState<Record<string, true>>({});
  const [members, setMembers] = useState<RoomMember[]>([]);
  const inputRef = useRef<TextInput>(null);
  const draftRef = useRef<string>("");
  const canSendRef = useRef<boolean>(false);
  const sendGuardRef = useRef(false);
  // Ignore late IME events that sometimes land after clear()/blur().
  const ignoreDraftEventsRef = useRef(false);
  const [canSend, setCanSend] = useState(false);

  const handleDraftChange = useCallback((v: string) => {
    if (ignoreDraftEventsRef.current) return;
    draftRef.current = v;
    const next = v.trim().length > 0;
    if (next !== canSendRef.current) {
      canSendRef.current = next;
      setCanSend(next);
    }
  }, []);

  const clearDraft = useCallback(() => {
    ignoreDraftEventsRef.current = true;
    draftRef.current = "";
    canSendRef.current = false;
    setCanSend(false);
    inputRef.current?.clear();
    setTimeout(() => {
      ignoreDraftEventsRef.current = false;
    }, 180);
  }, []);
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<RoomUiMessage>>(null);

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

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoadingPrefs(true);
      (async () => {
        const next = await loadLocationPrefs();
        if (!alive) return;
        setPrefs(next);
        setLoadingPrefs(false);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const ensurePosition = useCallback(async (): Promise<RoomPosition | null> => {
    if (locInFlight.current) return locInFlight.current;

    const task = (async (): Promise<RoomPosition | null> => {
      setPosLoading(true);
      setPosError(null);

      try {
        const currentPerm = await Location.getForegroundPermissionsAsync();
        let granted = currentPerm.status === "granted";
        let canAskAgain = currentPerm.canAskAgain;

        if (!granted) {
          const req = await Location.requestForegroundPermissionsAsync();
          granted = req.status === "granted";
          canAskAgain = req.canAskAgain;

          if (!granted) {
            const blocked = canAskAgain === false;
            setPermissionBlocked(blocked);
            setPos(null);
            setPosError(t("geo.permissionRequired"));

            if (blocked) {
              Alert.alert(
                t("geo.permissionRequired"),
                t("geo.permissionRequired"),
                [
                  {
                    text: t("geo.enableLocation"),
                    onPress: () => Linking.openSettings(),
                  },
                ]
              );
            }
            return null;
          }
        }

        setPermissionBlocked(false);

        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const coords = last.coords;
          const quick: RoomPosition = {
            lat: coords.latitude,
            lng: coords.longitude,
            accuracy: coords.accuracy,
          };
          setPos(quick);
          setPosLoading(false);

          void (async () => {
            try {
              const current = await withTimeout(
                Location.getCurrentPositionAsync({
                  accuracy: Location.Accuracy.Balanced,
                }),
                8000
              );
              const next: RoomPosition = {
                lat: current.coords.latitude,
                lng: current.coords.longitude,
                accuracy: current.coords.accuracy,
              };
              setPos(next);
            } catch {
              // keep lastKnown
            }
          })();

          return quick;
        }

        const current = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          8000
        );

        const next: RoomPosition = {
          lat: current.coords.latitude,
          lng: current.coords.longitude,
          accuracy: current.coords.accuracy,
        };
        setPos(next);
        return next;
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        if (msg.includes("timeout")) {
          setPosError(
            t("geo.timeout") ??
              "Не удалось быстро получить геолокацию. Попробуйте ещё раз."
          );
        } else {
          setPosError(e?.message ?? t("geo.noLocationAccess"));
        }
        return null;
      } finally {
        setPosLoading(false);
        locInFlight.current = null;
      }
    })();

    locInFlight.current = task;
    return task;
  }, [t]);

  const handleConsentAccept = useCallback(async () => {
    const action = consentAction;
    setConsentVisible(false);
    setConsentAction(null);
    await setLocationConsent("accepted");
    updatePrefs({ consent: "accepted" });

    if (action?.type === "enableNearby") {
      await setNearbyEnabled(true);
      updatePrefs({ nearbyEnabled: true });
      return;
    }

    if (action?.type === "enterRoom") {
      if (!prefs.nearbyEnabled) {
        await setNearbyEnabled(true);
        updatePrefs({ nearbyEnabled: true });
      }
      setPendingRoomKind(action.kind);
    }
  }, [consentAction, prefs.nearbyEnabled, updatePrefs]);

  const handleConsentDecline = useCallback(async () => {
    setConsentVisible(false);
    setConsentAction(null);
    await Promise.all([
      setLocationConsent("declined"),
      setNearbyEnabled(false),
      setShowPeopleOnMap(false),
      setShareMeOnMap(false),
    ]);
    updatePrefs({
      consent: "declined",
      nearbyEnabled: false,
      showPeopleOnMap: false,
      shareMeOnMap: false,
    });
  }, [updatePrefs]);

  const handleEnableNearby = useCallback(async () => {
    if (prefs.consent !== "accepted") {
      setConsentAction({ type: "enableNearby" });
      setConsentVisible(true);
      return;
    }
    await setNearbyEnabled(true);
    updatePrefs({ nearbyEnabled: true });
    ensurePosition();
  }, [prefs.consent, ensurePosition, updatePrefs]);

  const handleRefreshPosition = useCallback(async () => {
    if (!prefs.nearbyEnabled) {
      await handleEnableNearby();
      return;
    }
    if (prefs.consent !== "accepted") {
      setConsentAction({ type: "enableNearby" });
      setConsentVisible(true);
      return;
    }
    await ensurePosition();
  }, [prefs.consent, prefs.nearbyEnabled, handleEnableNearby, ensurePosition]);

  useEffect(() => {
    if (loadingPrefs) return;
    if (!prefs.nearbyEnabled || prefs.consent !== "accepted") {
      if (pos) setPos(null);
      return;
    }
    if (!pos && !posLoading) ensurePosition();
  }, [
    ensurePosition,
    loadingPrefs,
    prefs.consent,
    prefs.nearbyEnabled,
    pos,
    posLoading,
  ]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") {
        if (
          prefs.nearbyEnabled &&
          prefs.consent === "accepted" &&
          !pos &&
          !posLoading
        ) {
          ensurePosition();
        }
      }
      if (s === "background") {
        if (prefs.shareMeOnMap && db && uid) {
          clearPresence(db, uid).catch(() => {});
        }
      }
    });
    return () => sub.remove();
  }, [
    pos,
    posLoading,
    ensurePosition,
    prefs.nearbyEnabled,
    prefs.consent,
    prefs.shareMeOnMap,
    db,
    uid,
  ]);

  const presencePrecision = useMemo(() => {
    const meta = getRoomMeta(selectedKind ?? "work");
    return clamp(meta.precision + range.delta, 5, 9);
  }, [selectedKind, range.delta, clamp]);

  const presencePrefix = useMemo(() => {
    if (!pos) return null;
    return geohashForLocation([pos.lat, pos.lng]).slice(0, presencePrecision);
  }, [pos, presencePrecision]);

  const locationEnabled = prefs.nearbyEnabled && prefs.consent === "accepted";
  const canShowPeople = locationEnabled && prefs.showPeopleOnMap;

  useEffect(() => {
    if (
      !db ||
      !pos ||
      !presencePrefix ||
      !prefs.nearbyEnabled ||
      !prefs.showPeopleOnMap ||
      prefs.consent !== "accepted"
    ) {
      setNearbyPeople([]);
      return;
    }
    const unsub = subscribePresenceByPrefix(
      db,
      presencePrefix,
      setNearbyPeople
    );
    return () => {
      unsub?.();
    };
  }, [
    db,
    pos,
    presencePrefix,
    prefs.nearbyEnabled,
    prefs.showPeopleOnMap,
    prefs.consent,
  ]);

  useEffect(() => {
    if (!db || !uid) return;
    if (!prefs.nearbyEnabled || !prefs.shareMeOnMap || prefs.consent !== "accepted") {
      clearPresence(db, uid).catch(() => {});
    }
  }, [prefs.nearbyEnabled, prefs.shareMeOnMap, prefs.consent, db, uid]);

  useEffect(() => {
    if (
      !db ||
      !uid ||
      !pos ||
      !presencePrefix ||
      !prefs.nearbyEnabled ||
      !prefs.shareMeOnMap ||
      prefs.consent !== "accepted"
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
    prefs.nearbyEnabled,
    prefs.shareMeOnMap,
    prefs.consent,
  ]);

  useEffect(() => {
    return () => {
      if (prefs.shareMeOnMap && db && uid) {
        clearPresence(db, uid).catch(() => {});
      }
    };
  }, [prefs.shareMeOnMap, db, uid]);

  const joinSelected = useCallback(
    async (kind: RoomKind) => {
      if (joiningKind) return;
      setJoiningKind(kind);

      if (!uid) {
        Alert.alert(t("rooms.signInTitle"), t("rooms.signInBody"));
        setJoiningKind(null);
        return;
      }
      if (!isFirebaseConfigured() || !db) {
        Alert.alert(t("rooms.firebaseTitle"), t("rooms.firebaseBody"));
        setJoiningKind(null);
        return;
      }
      if (!prefs.nearbyEnabled) {
        Alert.alert(
          t("settings.nearbyEnabled"),
          t("rooms.enableForMap"),
          [
            {
              text: t("menu.settings"),
              onPress: () => navigation.navigate("Settings"),
            },
            { text: t("common.cancel"), style: "cancel" },
          ]
        );
        setJoiningKind(null);
        return;
      }
      if (prefs.consent !== "accepted") {
        setConsentAction({ type: "enterRoom", kind });
        setConsentVisible(true);
        setJoiningKind(null);
        return;
      }

      let p = pos ?? null;
      if (!p) p = await ensurePosition();
      if (!p) {
        setJoiningKind(null);
        return;
      }

      try {
        const meta = getRoomMeta(kind);
        const precision = clamp(meta.precision + range.delta, 5, 9);
        const radiusM = Math.max(50, Math.round(meta.radiusM * range.scale));
        const next = await withTimeout(
          openOrCreateGeoRoom(db, kind, p.lat, p.lng, {
            precision,
            radiusM,
          }),
          20_000
        );
        setRoom(next);
        setStage("chat");
        setSelectedKind(null);
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        const lower = msg.toLowerCase();
        const isTimeout = lower === "timeout";
        const isOffline = lower.includes("offline") || lower.includes("unavailable") || lower.includes("network");

        const body =
          isTimeout
            ? (t("rooms.openFailed") === "rooms.openFailed"
                ? "Сервер отвечает слишком долго. Проверь интернет и попробуй ещё раз."
                : t("rooms.openFailed"))
            : isOffline
              ? t("rooms.mapLoadingBody")
              : (msg || t("rooms.openFailed"));

        Alert.alert(
          t("common.error"),
          body,
          [
            {
              text: t("common.refresh"),
              onPress: () => joinSelected(kind),
            },
            { text: t("common.ok") },
          ]
        );
      } finally {
        setJoiningKind(null);
      }
    },
    [
      joiningKind,
      uid,
      pos,
      ensurePosition,
      t,
      range,
      clamp,
      prefs.nearbyEnabled,
      prefs.consent,
      db,
      navigation,
      isFirebaseConfigured,
    ]
  );

  useEffect(() => {
    if (!pendingRoomKind) return;
    if (prefs.consent !== "accepted" || !prefs.nearbyEnabled) return;
    const kind = pendingRoomKind;
    setPendingRoomKind(null);
    joinSelected(kind);
  }, [pendingRoomKind, prefs.consent, prefs.nearbyEnabled, joinSelected]);

  useEffect(() => {
    if (!room || !db) return;

    const unsubMsgs = subscribeRoomMessages(
      db,
      room.id,
      setMessages
    );
    const unsubMembers = subscribeRoomMembers(
      db,
      room.id,
      setMembers
    );

    return () => {
      unsubMsgs?.();
      unsubMembers?.();
    };
  }, [room, db]);

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

  const onSend = useCallback(() => {
    const value = (draftRef.current || "").trim();
    if (!value) return;
    if (!room || !db || !uid) return;
    if (sendGuardRef.current) return;
    sendGuardRef.current = true;

    setSending(true);

    // Clean input immediately before any async work starts.
    ignoreDraftEventsRef.current = true;
    draftRef.current = "";
    canSendRef.current = false;
    setCanSend(false);
    inputRef.current?.setNativeProps?.({ text: "" });
    inputRef.current?.clear?.();
    inputRef.current?.blur?.();
    Keyboard.dismiss();
    setTimeout(() => {
      ignoreDraftEventsRef.current = false;
    }, 200);

    const now = Date.now();
    const clientId = `m_${uid}_${now}_${Math.random().toString(16).slice(2)}`;
    setFailedById((prev) => {
      if (!prev[clientId]) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });

    void withTimeout(
      sendRoomMessage(db, room.id, uid, nicknameCode, value, clientId),
      SEND_TIMEOUT_MS
    )
      .then(() => {
        setFailedById((prev) => {
          if (!prev[clientId]) return prev;
          const next = { ...prev };
          delete next[clientId];
          return next;
        });
        requestAnimationFrame(() =>
          listRef.current?.scrollToOffset({ offset: 0, animated: true })
        );
      })
      .catch(() => {
        setFailedById((prev) => ({ ...prev, [clientId]: true }));
        requestAnimationFrame(() =>
          listRef.current?.scrollToOffset({ offset: 0, animated: true })
        );
      })
      .finally(() => {
        setSending(false);
        setTimeout(() => {
          sendGuardRef.current = false;
        }, 250);
      });
  }, [room, db, uid, nicknameCode]);

  const retrySend = useCallback(
    async (clientId: string) => {
      if (!room) return;
      if (!uid) {
        Alert.alert(t("rooms.signInTitle"), t("rooms.signInBody"));
        return;
      }
      if (!isFirebaseConfigured() || !db) {
        Alert.alert(t("rooms.firebaseTitle"), t("rooms.firebaseBody"));
        return;
      }

      const target = messages.find((m) => String(m.id) === clientId);
      if (!target) return;

      setFailedById((prev) => {
        if (!prev[clientId]) return prev;
        const next = { ...prev };
        delete next[clientId];
        return next;
      });

      try {
        await withTimeout(
          sendRoomMessage(db, room.id, uid, nicknameCode, target.text, clientId),
          SEND_TIMEOUT_MS
        );
      } catch {
        setFailedById((prev) => ({ ...prev, [clientId]: true }));
      }
    },
    [room, db, uid, nicknameCode, messages, t]
  );

  const leaveRoom = useCallback(() => {
    setRoom(null);
    setMessages([]);
    setFailedById({});
    setMembers([]);
    clearDraft();
    setStage("choose");
  }, [clearDraft]);

  const handleChooseBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (origin === "together") {
      goToTogetherTab();
      return;
    }
    goToNearbyRooms();
  }, [goToNearbyRooms, goToTogetherTab, navigation, origin]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (room) {
        leaveRoom();
        return true;
      }
      handleChooseBack();
      return true;
    });
    return () => sub.remove();
  }, [handleChooseBack, leaveRoom, room]);

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

  const handleOpenSettings = useCallback(() => {
    Linking.openSettings();
  }, []);

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

  const roomTitle = room
    ? `${getRoomMeta(room.kind).emoji} ${t(getRoomMeta(room.kind).labelKey)}`
    : t("tabs.rooms");
  const headerTitle = stage === "chat" ? roomTitle : t("tabs.rooms");

  return (
    <ScreenShell
      title={headerTitle}
      background="rooms"
      overlayOpacity={0.20}
      blurRadius={0}
      showBack
      onBack={stage === "chat" ? leaveRoom : handleChooseBack}
    >
      {stage === "choose" ? (
        <RoomsChooseStage
          t={t}
          loadingPrefs={loadingPrefs}
          locationEnabled={locationEnabled}
          posLoading={posLoading}
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
