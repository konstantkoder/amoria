// FILE: src/screens/RoomsScreen.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import MapView, { Circle, Marker } from "react-native-maps";

import { theme } from "@/theme";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import ScreenBackground from "@/components/ScreenBackground";
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

function formatAgo(ts: number) {
  const diff = Date.now() - ts;
  if (diff < 15_000) return "сейчас";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}с`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}м`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}ч`;
  const d = Math.floor(h / 24);
  return `${d}д`;
}

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

  const uid = auth?.currentUser?.uid ?? null;
  const nickname = useMemo(
    () => (uid ? makeNickname(uid) : "Аноним"),
    [uid]
  );

  const [stage, setStage] = useState<Stage>("choose");
  const [pos, setPos] = useState<Pos | null>(null);
  const [posError, setPosError] = useState<string | null>(null);
  const [posLoading, setPosLoading] = useState(false);

  const [room, setRoom] = useState<RoomDoc | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [text, setText] = useState("");

  const listRef = useRef<FlatList<RoomMessage>>(null);

  const activeMembers = useMemo(() => {
    const cutoff = Date.now() - 2 * 60 * 1000; // 2 минуты
    const uniq = new Map<string, RoomMember>();
    for (const m of members) {
      if (m.lastSeen >= cutoff) uniq.set(m.uid, m);
    }
    return Array.from(uniq.values());
  }, [members]);

  const ensurePosition = useCallback(async () => {
    setPosError(null);
    setPosLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Нужен доступ к геолокации (в настройках телефона).");
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setPos({
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        accuracy: current.coords.accuracy,
      });
    } catch (e: any) {
      setPos(null);
      setPosError(e?.message ?? "Не удалось получить геолокацию.");
    } finally {
      setPosLoading(false);
    }
  }, []);

  useEffect(() => {
    ensurePosition();
  }, [ensurePosition]);

  const enterRoom = useCallback(
    async (kind: RoomKind) => {
      if (!uid) {
        Alert.alert(
          "Нужен вход",
          "Сначала войди/зарегистрируйся, чтобы писать в комнатах."
        );
        return;
      }
      if (!isFirebaseConfigured() || !db) {
        Alert.alert(
          "Firebase не подключён",
          "Комнаты работают через Firebase (Firestore). Проверь .env и перезапусти Expo."
        );
        return;
      }
      if (!pos) {
        await ensurePosition();
      }
      const p = pos ?? null;
      if (!p) return;

      try {
        const next = await openOrCreateGeoRoom(db, kind, p.lat, p.lng);
        setRoom(next);
        setStage("chat");
      } catch (e: any) {
        Alert.alert("Ошибка", e?.message ?? "Не удалось открыть комнату.");
      }
    },
    [uid, pos, ensurePosition]
  );

  useEffect(() => {
    if (!room || !db) return;

    const unsubMsgs = subscribeRoomMessages(db, room.id, (msgs) =>
      setMessages(msgs)
    );
    const unsubMembers = subscribeRoomMembers(db, room.id, (list) =>
      setMembers(list)
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
        await touchRoomMember(db, room.id, uid, nickname);
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
  }, [room, uid, nickname, db]);

  const onSend = useCallback(async () => {
    if (!room || !db || !uid) return;
    const value = text.trim();
    if (!value) return;

    try {
      setText("");
      await sendRoomMessage(db, room.id, uid, nickname, value);
      requestAnimationFrame(() =>
        listRef.current?.scrollToOffset({ offset: 0, animated: true })
      );
    } catch (e: any) {
      Alert.alert("Ошибка", e?.message ?? "Не удалось отправить сообщение.");
    }
  }, [room, db, text, uid, nickname]);

  const leaveRoom = useCallback(() => {
    setRoom(null);
    setMessages([]);
    setMembers([]);
    setText("");
    setStage("choose");
  }, []);

  const renderChoose = () => (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
        <SectionTitle>Комнаты рядом</SectionTitle>

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
            Здесь чат <Text style={{ fontWeight: "800" }}>без фото</Text>,
            привязанный к месту.{"\n"}Ты можешь быть на работе или в баре — и
            общаться только с теми, кто рядом.
          </Text>

          <View style={{ height: 10 }} />

          {posLoading ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <ActivityIndicator color={theme.colors.primary} />
              <Text style={{ color: "#A3A3A3" }}>Получаем геолокацию…</Text>
            </View>
          ) : pos ? (
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Ionicons name="location-outline" size={18} color="#E5E7EB" />
              <Text style={{ color: "#E5E7EB", fontSize: 13 }}>
                Локация готова (точность ~
                {Math.round(pos.accuracy ?? 0)}м)
              </Text>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={ensurePosition} style={{ padding: 6 }}>
                <Ionicons
                  name="refresh"
                  size={18}
                  color={theme.colors.accent}
                />
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={{ color: "#FCA5A5", fontSize: 13 }}>
                {posError ?? "Нет доступа к геолокации."}
              </Text>
              <View style={{ height: 8 }} />
              <TouchableOpacity
                onPress={ensurePosition}
                style={{
                  alignSelf: "flex-start",
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 12,
                  backgroundColor: theme.colors.primary,
                }}
              >
                <Text style={{ color: "white", fontWeight: "800" }}>
                  Включить геолокацию
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <View style={{ flex: 1, paddingHorizontal: 16 }}>
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
            <MapView
              style={{ height: 260, width: "100%" }}
              initialRegion={{
                latitude: pos.lat,
                longitude: pos.lng,
                latitudeDelta: 0.004,
                longitudeDelta: 0.004,
              }}
              mapType="standard"
              showsUserLocation
              showsMyLocationButton={false}
            >
              <Circle
                center={{
                  latitude: pos.lat,
                  longitude: pos.lng,
                }}
                radius={140}
                strokeColor="rgba(249,115,22,0.9)"
                fillColor="rgba(249,115,22,0.18)"
              />

              {ROOM_KIND_ORDER.map((kind) => {
                const meta = getRoomMeta(kind);
                const coord = getRoomMarkerCoord(pos, kind);
                return (
                  <Marker
                    key={kind}
                    coordinate={coord}
                    onPress={() => enterRoom(kind)}
                    anchor={{ x: 0.5, y: 1 }}
                  >
                    <View
                      style={{
                        backgroundColor: "rgba(15,23,42,0.96)",
                        borderRadius: 18,
                        paddingHorizontal: 8,
                        paddingVertical: 6,
                        borderWidth: 1,
                        borderColor: "rgba(251,146,60,0.9)",
                        shadowColor: "#000000",
                        shadowOpacity: 0.35,
                        shadowRadius: 4,
                        shadowOffset: { width: 0, height: 2 },
                        elevation: 4,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 18,
                          color: "#F9FAFB",
                        }}
                      >
                        {meta.emoji}
                      </Text>
                    </View>
                  </Marker>
                );
              })}
            </MapView>
          ) : (
            <View
              style={{
                height: 260,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {posLoading ? (
                <ActivityIndicator color={theme.colors.primary} />
              ) : (
                <>
                  <Text
                    style={{
                      color: "#E5E7EB",
                      fontSize: 14,
                      textAlign: "center",
                      marginBottom: 8,
                    }}
                  >
                    Включи геолокацию, чтобы показать карту комнат рядом.
                  </Text>
                  <TouchableOpacity
                    onPress={ensurePosition}
                    style={{
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      borderRadius: 14,
                      backgroundColor: theme.colors.primary,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "800" }}>
                      Обновить локацию
                    </Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </View>

        <View style={{ paddingTop: 16 }}>
          <SectionTitle>Выбери место</SectionTitle>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 10,
            }}
          >
            {ROOM_KIND_ORDER.map((kind) => {
              const meta = getRoomMeta(kind);
              return (
                <TouchableOpacity
                  key={kind}
                  activeOpacity={0.85}
                  onPress={() => enterRoom(kind)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: "rgba(255,255,255,0.05)",
                    borderWidth: 1,
                    borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 6 }}>
                    {meta.emoji}
                  </Text>
                  <Text
                    style={{
                      color: "#E5E7EB",
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {meta.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ height: 14 }} />
          <Text
            style={{
              color: "#71717A",
              fontSize: 12,
              lineHeight: 16,
              marginBottom: 16,
            }}
          >
            Комната создаётся автоматически по геохэшу места. Чтобы попасть в
            одну и ту же комнату, людям нужно находиться рядом.
          </Text>
        </View>
      </View>
    </View>
  );

  const renderChatHeader = () => {
    if (!room) return null;
    return (
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(255,255,255,0.08)",
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <TouchableOpacity onPress={leaveRoom} style={{ padding: 6 }}>
          <Ionicons name="arrow-back" size={20} color="#E5E7EB" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 16,
              fontWeight: "900",
            }}
          >
            {room.title}
          </Text>
          <Text
            style={{
              color: "#A3A3A3",
              fontSize: 12,
              marginTop: 2,
            }}
          >
            Участников рядом: {activeMembers.length} • ты: {nickname}
          </Text>
        </View>

        <TouchableOpacity
          onPress={ensurePosition}
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

  const renderMessage = ({ item }: { item: RoomMessage }) => {
    const isMe = item.uid === uid;
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
          {isMe ? "ты" : item.nickname} • {formatAgo(item.createdAt)}
        </Text>

        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderRadius: 16,
            backgroundColor: isMe
              ? "rgba(109,40,217,0.35)"
              : "rgba(255,255,255,0.07)",
            borderWidth: 1,
            borderColor: isMe
              ? "rgba(167,139,250,0.35)"
              : "rgba(255,255,255,0.08)",
          }}
        >
          <Text
            style={{ color: "#E5E7EB", fontSize: 14, lineHeight: 20 }}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  };

  const renderChat = () => (
    <View style={{ flex: 1 }}>
      {renderChatHeader()}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(x) => x.id}
        renderItem={renderMessage}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        inverted
        ListEmptyComponent={
          <View style={{ paddingTop: 20 }}>
            <Text style={{ color: "#A3A3A3" }}>
              Пока пусто. Напиши первым — тебя увидят только рядом находящиеся
              люди.
            </Text>
          </View>
        }
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            paddingBottom: insets.bottom + 10,
            paddingTop: 10,
            paddingHorizontal: 12,
            backgroundColor: "rgba(5,8,22,0.92)",
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
              borderRadius: 16,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.10)",
              backgroundColor: "rgba(255,255,255,0.06)",
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Сообщение…"
              placeholderTextColor="#6B7280"
              multiline
              style={{
                color: "#E5E7EB",
                fontSize: 14,
                minHeight: 20,
                maxHeight: 110,
              }}
            />
          </View>

          <TouchableOpacity
            onPress={onSend}
            activeOpacity={0.85}
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: theme.colors.primary,
            }}
          >
            <Ionicons name="send" size={18} color="white" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );

  return (
    <ScreenBackground>
      <SafeAreaView
        style={{ flex: 1, backgroundColor: "transparent" }}
      >
        {stage === "choose" ? renderChoose() : renderChat()}
      </SafeAreaView>
    </ScreenBackground>
  );
}
