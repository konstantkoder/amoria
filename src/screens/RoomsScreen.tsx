// FILE: src/screens/RoomsScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Alert,
  BackHandler,
  FlatList,
  Keyboard,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { geohashForLocation } from "geofire-common";

import { theme } from "@/theme";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import ScreenShell from "@/components/ScreenShell";
import { OpenStreetMapWebView } from "@/components/OpenStreetMapWebView";
import LocationConsentModal from "@/components/LocationConsentModal";
import { useLocale } from "@/contexts/LocaleContext";
import { formatAgoShort } from "@/utils/timeAgo";
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

type Pos = {
  lat: number;
  lng: number;
  accuracy?: number | null;
};

type LatLng = {
  latitude: number;
  longitude: number;
};

type UiMessage = RoomMessage & {
  failed?: boolean;
};

// AMORIA_FIX_ROOMS_CHAT_LAYOUT_V3
type MessageRowProps = {
  item: UiMessage;
  uid: string | null;
  t: (key: string, params?: Record<string, any>) => string;
  onRetry: (id: string) => void;
};

// AMORIA_FIX_ROOMS_CHAT_LAYOUT_V3
const MessageRow = React.memo(function MessageRow({
  item,
  uid,
  t,
  onRetry,
}: MessageRowProps) {
  const isMe = item.uid === uid;
  const failed = item.failed === true;
  const pending = !failed && item.pending === true;
  const formatted = formatNickname(item.nicknameCode, t);
  const displayName =
    formatted === item.nicknameCode
      ? translateMaybeKey(item.nicknameCode, t, ["common."])
      : formatted;
  return (
    <View
      style={{
        alignSelf: isMe ? "flex-end" : "flex-start",
        maxWidth: "82%",
        marginBottom: 10,
      }}
    >
      <Text
        style={{
          color: "#A3A3A3",
          fontSize: 11,
          marginBottom: 4,
          textAlign: isMe ? "right" : "left",
        }}
      >
        {isMe ? t("common.you") : displayName} •{" "}
        {formatAgoShort(item.createdAt, t)}
      </Text>

      {(() => {
        const bubble = (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderRadius: 16,
              opacity: pending ? 0.55 : 1,
              backgroundColor: isMe
                ? "rgba(109,40,217,0.35)"
                : "rgba(255,255,255,0.07)",
              borderWidth: 1,
              borderColor: isMe
                ? "rgba(167,139,250,0.35)"
                : "rgba(255,255,255,0.08)",
            }}
          >
            <Text style={{ color: "#E5E7EB", fontSize: 14, lineHeight: 20 }}>
              {item.text}
            </Text>
          </View>
        );

        return item.failed ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => onRetry(item.id)}>
            {bubble}
          </TouchableOpacity>
        ) : (
          bubble
        );
      })()}

      {failed ? (
        <Text style={{ color: "#FCA5A5", fontSize: 11, marginTop: 4 }}>
          {t("common.failed")}
        </Text>
      ) : pending ? (
        <Text style={{ color: "#A1A1AA", fontSize: 11, marginTop: 4 }}>
          {t("common.sending")}
        </Text>
      ) : null}
    </View>
  );
});

const withTimeout = async <T,>(p: Promise<T>, ms: number): Promise<T> => {
  return (await Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)),
  ])) as T;
};

const SEND_TIMEOUT_MS = 20000; // AMORIA_FIX_SEND_TIMEOUT_V6

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Text
      style={{
        color: "#E5E7EB",
        fontSize: 18,
        fontWeight: "800",
        marginBottom: 10,
      }}
    >
      {children}
    </Text>
  );
}

function offsetPosition(base: Pos, eastM: number, northM: number): LatLng {
  const latOffset = northM / 111_320; // метры в градусы широты
  const lngOffset =
    eastM / (111_320 * Math.cos((base.lat * Math.PI) / 180));
  return {
    latitude: base.lat + latOffset,
    longitude: base.lng + lngOffset,
  };
}

function getRoomMarkerCoord(base: Pos, kind: RoomKind): LatLng {
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
  const navigation = useNavigation<any>();
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
  const RANGE_PRESETS = [
    { id: "wide", labelKey: "rooms.range.wide", delta: -1, scale: 2.1 },
    { id: "normal", labelKey: "rooms.range.normal", delta: 0, scale: 1.0 },
    { id: "tight", labelKey: "rooms.range.tight", delta: 1, scale: 0.55 },
  ] as const;
  const clamp = (n: number, a: number, b: number) =>
    Math.max(a, Math.min(b, n));
  const [rangeIndex, setRangeIndex] = useState<number>(1);
  const range = RANGE_PRESETS[rangeIndex];
  const [pos, setPos] = useState<Pos | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const locInFlight = useRef<Promise<Pos | null> | null>(null);
  const [permissionBlocked, setPermissionBlocked] = useState(false);
  const [prefs, setPrefs] = useState<LocationPrefs>({
    consent: "unknown",
    nearbyEnabled: false,
    showPeopleOnMap: false,
    shareMeOnMap: false,
  });
  const [loadingPrefs, setLoadingPrefs] = useState(true);
  const [consentVisible, setConsentVisible] = useState(false);
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
  // AMORIA_FIX_UNCONTROLLED_INPUT_V5_START
  const inputRef = useRef<TextInput>(null);
  const draftRef = useRef<string>("");
  const canSendRef = useRef<boolean>(false);
  const sendGuardRef = useRef(false);
  const ignoreDraftEventsRef = useRef(false); // AMORIA_FIX_IME_GUARD_V1
  const [canSend, setCanSend] = useState(false);

  const handleDraftChange = useCallback((v: string) => {
    if (ignoreDraftEventsRef.current) return; // AMORIA_FIX_IME_GUARD_V1
    draftRef.current = v;
    const next = v.trim().length > 0;
    if (next !== canSendRef.current) {
      canSendRef.current = next;
      setCanSend(next);
    }
  }, []);

  const clearDraft = useCallback(() => {
    // Глушим “поздние” события IME, которые иногда прилетают после clear()/blur()
    ignoreDraftEventsRef.current = true; // AMORIA_FIX_IME_GUARD_V1
    draftRef.current = "";
    canSendRef.current = false;
    setCanSend(false);
    inputRef.current?.clear();
    setTimeout(() => {
      ignoreDraftEventsRef.current = false; // AMORIA_FIX_IME_GUARD_V1
    }, 180);
  }, []);
  // AMORIA_FIX_UNCONTROLLED_INPUT_V5_END
  const [sending, setSending] = useState(false);

  const listRef = useRef<FlatList<UiMessage>>(null);

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

  const ensurePosition = useCallback(async (): Promise<Pos | null> => {
    if (locInFlight.current) return locInFlight.current;

    const task = (async (): Promise<Pos | null> => {
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
          const quick: Pos = {
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
              const next: Pos = {
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

        const next: Pos = {
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
          20_000  // AMORIA_FIX_TIMEOUT_UI
        );
        setRoom(next);
        setStage("chat");
        setSelectedKind(null);
      } catch (e: any) {
        const msg = String(e?.message ?? "");
        const lower = msg.toLowerCase();
        // AMORIA_FIX_TIMEOUT_UI_START
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
        // AMORIA_FIX_TIMEOUT_UI_END
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

  // AMORIA_ROOMS_RELIABLE_SEND_V1
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
  }, [room, db, uid, nicknameCode, t]);

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
    clearDraft(); // AMORIA_FIX_UNCONTROLLED_INPUT_V5
    setStage("choose");
  }, [clearDraft]);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (room) {
        leaveRoom();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [room, leaveRoom]);

  const mapPins = useMemo(() => {
    const pins: { id: string; lat: number; lng: number; label?: string }[] = [];
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

  // AMORIA_ROOMS_RELIABLE_SEND_V1
  const mergedMessages = useMemo(() => {
    const map = new Map<string, UiMessage>();
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

  const renderChoose = () => {
    const selectedMeta = selectedKind ? getRoomMeta(selectedKind) : null;
    const joinBase = t("rooms.joinRoom");
    const joinLabel = selectedMeta
      ? joinBase === "rooms.joinRoom"
        ? `${selectedMeta.emoji} ${t(selectedMeta.labelKey)}`
        : `${joinBase} ${selectedMeta.emoji} ${t(selectedMeta.labelKey)}`
      : t("rooms.selectFirst");

    return (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
      <View style={{ paddingHorizontal: 16, paddingTop: insets.top + 8 }}>
        <View
          style={{
            borderRadius: theme.shapes.card,
            padding: 18,
            backgroundColor: "rgba(12, 16, 31, 0.92)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              color: theme.colors.accent,
              fontSize: 12,
              fontWeight: "800",
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            {t("rooms.heroKicker")}
          </Text>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: 24,
              lineHeight: 30,
              fontWeight: "800",
              marginBottom: 10,
            }}
          >
            {t("rooms.heroTitle")}
          </Text>
          <Text
            style={{
              color: theme.colors.subtext,
              fontSize: 14,
              lineHeight: 21,
              marginBottom: 14,
            }}
          >
            {t("rooms.heroBody")}
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Together")}
            style={{
              alignSelf: "flex-start",
              borderRadius: theme.shapes.pill,
              paddingHorizontal: 14,
              paddingVertical: 10,
              backgroundColor: theme.colors.accent,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "800" }}>
              {t("rooms.goToTogether")}
            </Text>
          </Pressable>
        </View>

        <SectionTitle>{t("rooms.nearbyRooms")}</SectionTitle>

        <View
          style={{
            borderRadius: 18,
            padding: 14,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
            marginBottom: 14,
          }}
        >
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 14,
              lineHeight: 20,
            }}
          >
            {t("rooms.noPhotoChat")}
          </Text>

          <View style={{ height: 10 }} />

          {loadingPrefs ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: "#A3A3A3" }}>
                {t("rooms.getLocation")}
              </Text>
            </View>
          ) : !locationEnabled ? (
            <View>
              <Text style={{ color: "#FBBF24", fontSize: 13 }}>
                {t("rooms.enableForMap")}
              </Text>
              <View style={{ height: 8 }} />
              <TouchableOpacity
                onPress={handleEnableNearby}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: theme.colors.primary,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  {t("settings.nearbyEnabled")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : posLoading ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: "#A3A3A3" }}>
                {t("rooms.getLocation")}
              </Text>
            </View>
          ) : pos ? (
            <View>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
              >
                <Ionicons name="location-outline" size={18} color="#E5E7EB" />
                <Text style={{ color: "#E5E7EB", fontSize: 13 }}>
                  {t("rooms.locationReady")} (~{Math.round(pos.accuracy ?? 0)} {t("units.m")})
                </Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={handleRefreshPosition} style={{ padding: 6 }}>
                  <Ionicons
                    name="refresh"
                    size={18}
                    color={theme.colors.accent}
                  />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <Text style={{ color: "#FCA5A5", fontSize: 13 }}>
                {posError ?? t("geo.noLocationAccess")}
              </Text>
              <View style={{ height: 8 }} />
              {permissionBlocked ? (
                <TouchableOpacity
                  onPress={() => Linking.openSettings()}
                  style={{
                    alignSelf: "flex-start",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: theme.colors.primary,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {t("geo.openSettings")}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={handleRefreshPosition}
                  style={{
                    alignSelf: "flex-start",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    backgroundColor: theme.colors.primary,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "800" }}>
                    {t("geo.enableLocation")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      </View>

      <View style={{ paddingHorizontal: 16 }}>
        <View
          style={{
            borderRadius: 22,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.12)",
            backgroundColor: "rgba(15,23,42,0.96)",
          }}
        >
          {pos ? (
            <View style={{ height: 260, width: "100%" }}>
              <OpenStreetMapWebView
                style={{ flex: 1 }}
                center={{ lat: pos.lat, lng: pos.lng }}
                markers={mapPins}
                zoom={14}
                interactive={false}
              />
              <TouchableOpacity
                onPress={() => setMapExpanded(true)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: 10,
                  padding: 8,
                  borderRadius: 12,
                  backgroundColor: "rgba(15,23,42,0.85)",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.2)",
                }}
              >
                <Ionicons name="expand-outline" size={16} color="#E5E7EB" />
              </TouchableOpacity>
            </View>
          ) : (
            <View
              style={{
                height: 260,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 16,
              }}
            >
              <Text
                style={{
                  color: "#E5E7EB",
                  fontSize: 14,
                  textAlign: "center",
                  marginBottom: 8,
                }}
              >
                {t("rooms.mapLoadingTitle")}
              </Text>
              <Text
                style={{
                  color: "#A3A3A3",
                  fontSize: 12,
                  textAlign: "center",
                  lineHeight: 18,
                }}
              >
                {t("rooms.mapLoadingBody")}
              </Text>
            </View>
          )}
        </View>

        <View style={{ paddingTop: 16 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 10,
            }}
          >
            <Text
              style={{
                color: "#E5E7EB",
                fontSize: 18,
                fontWeight: "800",
              }}
            >
              {t("rooms.range.title")}
            </Text>
            <Pressable
              onPress={() =>
                Alert.alert(
                  t("rooms.range.title"),
                  t("rooms.range.note"),
                  [{ text: t("common.ok") }]
                )
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{ marginLeft: 8, opacity: 0.9 }}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color="#E5E7EB"
              />
            </Pressable>
          </View>
          <View
            style={{
              borderRadius: 18,
              padding: 12,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "rgba(255,255,255,0.06)",
                borderRadius: 999,
                padding: 4,
                gap: 6,
              }}
            >
              {RANGE_PRESETS.map((preset, index) => {
                const selected = index === rangeIndex;
                const label = t(preset.labelKey);
                return (
                  <TouchableOpacity
                    key={preset.id}
                    activeOpacity={0.85}
                    onPress={() => setRangeIndex(index)}
                    style={{ flex: 1 }}
                  >
                    {selected ? (
                      <LinearGradient
                        colors={[theme.colors.primary, theme.colors.accent]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{
                          borderRadius: 999,
                          paddingVertical: 8,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            color: "white",
                            fontSize: 12,
                            fontWeight: "900",
                          }}
                        >
                          {label}
                        </Text>
                      </LinearGradient>
                    ) : (
                      <View
                        style={{
                          borderRadius: 999,
                          paddingVertical: 8,
                          alignItems: "center",
                          justifyContent: "center",
                          backgroundColor: "rgba(255,255,255,0.03)",
                        }}
                      >
                        <Text
                          style={{
                            color: "#E5E7EB",
                            fontSize: 12,
                            fontWeight: "700",
                            opacity: 0.85,
                          }}
                        >
                          {label}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={{ paddingTop: 16 }}>
          <View
            style={{
              borderRadius: 18,
              padding: 14,
              backgroundColor: "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.08)",
              marginBottom: 16,
            }}
          >
            <Text style={{ color: "#E5E7EB", fontSize: 15, fontWeight: "800", marginBottom: 4 }}>
              {t("rooms.oneToOneTitle")}
            </Text>
            <Text style={{ color: "#A3A3A3", fontSize: 13, lineHeight: 19, marginBottom: 10 }}>
              {t("rooms.oneToOneBody")}
            </Text>
            <TouchableOpacity
              onPress={() => navigation.navigate("Together")}
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 12,
                backgroundColor: theme.colors.primary,
              }}
            >
              <Text style={{ color: "white", fontWeight: "800" }}>
                {t("rooms.goToTogether")}
              </Text>
            </TouchableOpacity>
          </View>

          <SectionTitle>{t("rooms.choosePlace")}</SectionTitle>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {ROOM_KIND_ORDER.map((kind) => {
              const meta = getRoomMeta(kind);
              const selected = kind === selectedKind;
              return (
                <TouchableOpacity
                  key={kind}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (posLoading || joiningKind) return;
                    setSelectedKind(kind);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: selected
                      ? "rgba(109,40,217,0.25)"
                      : "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor: selected
                      ? "rgba(167,139,250,0.45)"
                      : "rgba(255,255,255,0.10)",
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 6 }}>
                    {meta.emoji}
                  </Text>
                  <Text
                    style={{
                      color: selected ? "#F3F4F6" : "#E5E7EB",
                      fontSize: 13,
                      fontWeight: selected ? "800" : "700",
                    }}
                  >
                    {t(meta.labelKey)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 14 }} />
          <TouchableOpacity
            activeOpacity={0.85}
            disabled={!selectedKind || joiningKind !== null}
            onPress={() => {
              if (selectedKind) joinSelected(selectedKind);
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              borderRadius: 14,
              backgroundColor: !selectedKind
                ? "rgba(255,255,255,0.06)"
                : theme.colors.primary,
              borderWidth: 1,
              borderColor: !selectedKind
                ? "rgba(255,255,255,0.10)"
                : "rgba(167,139,250,0.45)",
              opacity: joiningKind ? 0.8 : 1,
            }}
          >
            {joiningKind ? <ActivityIndicator color="#FFFFFF" /> : null}
            <Text
              style={{
                color: !selectedKind ? "#A1A1AA" : "white",
                fontSize: 14,
                fontWeight: "800",
              }}
            >
              {joinLabel}
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              color: "#71717A",
              fontSize: 12,
              lineHeight: 16,
              marginBottom: 16,
              marginTop: 12,
            }}
          >
            {t("rooms.placeInfo")}
          </Text>
        </View>
      </View>
    </ScrollView>
    );
  };

  const renderChatHeader = () => {
    if (!room) return null;
    const meta = getRoomMeta(room.kind);
    const roomTitle = `${meta.emoji} ${t(meta.labelKey)}`;
    const area = room?.radiusM
      ? ` · ~${Math.round(room.radiusM)} ${t("units.m")}`
      : "";
    return (
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: insets.top + 10,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 16,
              fontWeight: "900",
            }}
          >
            {roomTitle}
          </Text>
          <Text
            style={{
              color: "#A3A3A3",
              fontSize: 12,
              marginTop: 2,
            }}
          >
            {t("rooms.membersLine", {
              count: String(activeMembers.length),
              name: nicknameLabel,
            }) + area}
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleRefreshPosition}
          style={{
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Ionicons
            name="navigate-outline"
            size={18}
            color={theme.colors.accent}
          />
        </TouchableOpacity>
      </View>
    );
  };

  // AMORIA_FIX_ROOMS_CHAT_LAYOUT_V3
  const renderItem = useCallback(
    ({ item }: { item: UiMessage }) => (
      <MessageRow item={item} uid={uid} t={t} onRetry={retrySend} />
    ),
    [uid, t, retrySend]
  );

  // AMORIA_FIX_ROOMS_CHAT_LAYOUT_V3
  const renderChat = () => {
    const content = (
      <View style={{ flex: 1 }}>
        {renderChatHeader()}

        <FlatList
          ref={listRef as any}
          data={mergedMessages as any}
          keyExtractor={(item: any) => String(item.id)}
          renderItem={renderItem as any}
          inverted
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingTop: 12,
            paddingBottom: 12,
          }}
          onContentSizeChange={() => {
            listRef.current?.scrollToOffset({ offset: 0, animated: false });
          }}
        />

        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View
            style={{
              paddingHorizontal: 12,
              paddingTop: 10,
              paddingBottom: insets.bottom + 10,
              backgroundColor: "rgba(10,10,10,0.55)",
              borderTopWidth: 1,
              borderTopColor: "rgba(255,255,255,0.08)",
              flexDirection: "row",
              alignItems: "flex-end",
              gap: 10,
            }}
          >
            <View
              style={{
                flex: 1,
                backgroundColor: "rgba(255,255,255,0.10)",
                borderRadius: 18,
                paddingHorizontal: 12,
                paddingVertical: 10,
              }}
            >
              <TextInput
                ref={inputRef}
                onChangeText={handleDraftChange}
                placeholder={t("rooms.messagePlaceholder")}
                placeholderTextColor="rgba(255,255,255,0.55)"
                onFocus={() =>
                  requestAnimationFrame(() =>
                    listRef.current?.scrollToOffset({ offset: 0, animated: true })
                  )
                }
                style={{
                  color: "#fff",
                  fontSize: 16,
                  lineHeight: 20,
                  padding: 0,
                  textAlignVertical: "top",
                  maxHeight: 120,
                }}
                multiline
                blurOnSubmit={false}
              />
            </View>

            <TouchableOpacity
              onPress={onSend}
              disabled={!canSend || sending} // AMORIA_FIX_SEND_LOCK_V1
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: "center",
                justifyContent: "center",
                opacity: !canSend || sending ? 0.6 : 1, // AMORIA_FIX_SEND_LOCK_V1
                backgroundColor:
                  canSend && !sending
                    ? "rgba(168, 85, 247, 0.95)"
                    : "rgba(255,255,255,0.12)",
              }}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Ionicons name="send" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardStickyView>
      </View>
    );

    return content;
  };

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
      showBack={stage === "chat"}
      onBack={stage === "chat" ? leaveRoom : undefined}
    >
      {stage === "choose" ? renderChoose() : renderChat()}
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
