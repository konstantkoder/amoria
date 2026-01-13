// NOTE: Modified copy of the original NowScreen. The key change is the
// background used for the 'Сейчас' screen: we switch from the hearts
// wallpaper to the neon city backdrop, and expose custom overlay/blur
// settings to let more of the image show through while preserving text
// legibility. All other functionality remains identical to the upstream
// version.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/theme";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  NowMood,
  NowPost,
  createNowPost,
  makeRegion,
  subscribeNowPosts,
} from "@/services/now";
import { makeNickname } from "@/services/rooms";
import ScreenShell from "@/components/ScreenShell";
import NeonBorder from "@/components/NeonBorder";
import { useLocale } from "@/contexts/LocaleContext";

type Pos = { lat: number; lng: number; accuracy?: number | null };
type RadiusOption = number | null; // null = без ограничения

const RADIUS_OPTIONS: RadiusOption[] = [5, 10, 25, 50, 100, null];

const MOOD_META: { key: NowMood; label: string; emoji: string }[] = [
  { key: "chill", label: "Просто посидеть", emoji: "😌" },
  { key: "talk", label: "Поговорить", emoji: "💬" },
  { key: "drink", label: "Выпить кофе/дринк", emoji: "🥤" },
  { key: "walk", label: "Прогуляться", emoji: "🚶" },
  { key: "fun", label: "Развлечься", emoji: "🎉" },
  { key: "other", label: "Другое", emoji: "✨" },
];

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

function formatAgo(ts: number) {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "только что";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч`;
  const d = Math.floor(h / 24);
  return `${d} дн`;
}

function distanceKm(pos: Pos | null, item: { lat?: number; lng?: number }): number | null {
  if (!pos || item.lat == null || item.lng == null) return null;
  const R = 6371; // км
  const dLat = ((item.lat - pos.lat) * Math.PI) / 180;
  const dLng = ((item.lng - pos.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pos.lat * Math.PI) / 180) *
      Math.cos((item.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c;
  return Math.round(d * 10) / 10;
}

export default function NowScreen() {
  const insets = useSafeAreaInsets();
  const user = auth?.currentUser ?? null;
  const { t } = useLocale();

  const [pos, setPos] = useState<Pos | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [posts, setPosts] = useState<NowPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState<NowMood>("chill");
  const [message, setMessage] = useState(""); // текст сообщения
  const [sending, setSending] = useState(false);
  const [radiusKm, setRadiusKm] = useState<RadiusOption>(25);

  const nickname = useMemo(() => {
    if (!user?.uid) return "Аноним";
    return makeNickname(user.uid);
  }, [user?.uid]);

  const ensurePosition = useCallback(async () => {
    setPosLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error("Нужен доступ к геолокации (в настройках телефона).");
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextPos: Pos = {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        accuracy: current.coords.accuracy,
      };
      setPos(nextPos);
      setRegion(makeRegion(nextPos.lat, nextPos.lng));
    } catch (e: any) {
      setPos(null);
      setRegion(null);
    } finally {
      setPosLoading(false);
    }
  }, []);

  useEffect(() => {
    ensurePosition();
  }, [ensurePosition]);

  useEffect(() => {
    if (!region || !db || !isFirebaseConfigured()) return;
    setLoading(true);
    const unsub = subscribeNowPosts(db, region, (list) => {
      setPosts(list);
      setLoading(false);
    });
    return () => unsub?.();
  }, [region]);

  const onSend = async () => {
    if (!user) {
      Alert.alert(
        "Нужен вход",
        "Чтобы писать в разделе “Сейчас”, сначала войди или зарегистрируйся.",
      );
      return;
    }
    if (!db || !isFirebaseConfigured()) {
      Alert.alert(
        "Firebase не подключён",
        "Раздел “Сейчас” работает через Firebase. Проверь .env и перезапусти Expo.",
      );
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert("Пустой текст", "Напиши хотя бы одну фразу.");
      return;
    }
    if (!pos) {
      Alert.alert(
        "Нет локации",
        "Не удалось получить координаты. Попробуй обновить местоположение.",
      );
      return;
    }
    const previousMessage = message;
    setMessage("");
    try {
      setSending(true);
      await createNowPost(db, {
        uid: user.uid,
        nickname,
        text: trimmed,
        mood,
        lat: pos.lat,
        lng: pos.lng,
      });
    } catch (e: any) {
      setMessage(previousMessage);
      Alert.alert(
        "Ошибка",
        e?.message ?? "Не удалось отправить сообщение, попробуй ещё раз.",
      );
    } finally {
      setSending(false);
    }
  };

  const visiblePosts = useMemo(() => {
    return posts.filter((p) => {
      const dist = distanceKm(pos, p);
      if (radiusKm == null || dist == null) return true;
      return dist <= radiusKm;
    });
  }, [posts, pos, radiusKm]);

  const renderMoodChips = () => (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 6,
      }}
    >
      {MOOD_META.map((m) => {
        const active = m.key === mood;
        return (
          <NeonBorder key={m.key} active={active}>
            <TouchableOpacity
              onPress={() => setMood(m.key)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                // Livelier mood chips: primary accent for active, subtle for inactive
                backgroundColor: active
                  ? "rgba(255,78,138,0.25)"
                  : theme.colors.pillBg,
              }}
            >
              <Text style={{ fontSize: 14, marginRight: 4 }}>{m.emoji}</Text>
              <Text
                style={{
                  color: active ? theme.colors.primary : theme.colors.pillText,
                  fontSize: 12,
                  fontWeight: active ? "800" : "600",
                }}
              >
                {m.label}
              </Text>
            </TouchableOpacity>
          </NeonBorder>
        );
      })}
    </View>
  );

  const renderRadiusChips = () => (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 6,
        marginBottom: 8,
      }}
    >
      {RADIUS_OPTIONS.map((option, idx) => {
        const active = radiusKm === option;
        const label = option == null ? "Все" : `${option} км`;
        return (
          <NeonBorder key={idx} active={active}>
            <TouchableOpacity
              onPress={() => setRadiusKm(option)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                // Livelier radius chips: warm accent for active, subtle for inactive
                backgroundColor: active
                  ? "rgba(255,122,60,0.25)"
                  : theme.colors.pillBg,
              }}
            >
              <Text
                style={{
                  color: active ? theme.colors.accent : theme.colors.pillText,
                  fontSize: 12,
                  fontWeight: active ? "800" : "600",
                }}
              >
                {label}
              </Text>
            </TouchableOpacity>
          </NeonBorder>
        );
      })}
    </View>
  );

  const renderComposer = () => (
    <View
      style={{
        borderRadius: 18,
        padding: 14,
        // Use a softer panel background and subtle border for the composer
        backgroundColor: theme.colors.backgroundSoft,
        borderWidth: 1,
        borderColor: theme.colors.borderSubtle,
        marginBottom: 14,
      }}
    >
      <Text
        style={{
          color: "#E5E7EB",
          fontSize: 15,
          fontWeight: "800",
          marginBottom: 4,
        }}
      >
        Что ты хочешь сейчас?
      </Text>
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        Сообщения видят люди в твоём районе. Радиус можно поменять ниже — от 5 км до 100 км.
      </Text>
      {renderMoodChips()}
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder="Напиши, что у тебя на уме прямо сейчас…"
        placeholderTextColor="#6B7280"
        multiline
        style={{
          marginTop: 10,
          borderRadius: 12,
          borderWidth: 1,
          // Use a soft background and subtle border for the message input
          borderColor: theme.colors.borderSubtle,
          backgroundColor: theme.colors.backgroundSoft,
          paddingHorizontal: 10,
          paddingVertical: 8,
          color: theme.colors.pillText,
          fontSize: 14,
          height: 80,
          textAlignVertical: "top",
        }}
      />
      {/* временный дебаг — можно потом убрать */}
      <Text
        style={{
          marginTop: 4,
          color: "#9CA3AF",
          fontSize: 11,
        }}
      >
        debug: message = [{message}]
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginTop: 10,
        }}
      >
        <View style={{ flex: 1 }}>
          {posLoading ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
                Обновляем местоположение…
              </Text>
            </View>
          ) : pos ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ionicons name="location-outline" size={16} color="#A7F3D0" />
              <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
                Локация готова (точность ~{Math.round(pos.accuracy ?? 0)} м)
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              onPress={ensurePosition}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              {/* здесь пока оставил иконку как есть, позже заменим на валидную */}
              <Ionicons name="location-outline" size={16} color="#F97373" />
              <Text
                style={{
                  color: "#FCA5A5",
                  fontSize: 12,
                  textDecorationLine: "underline",
                }}
              >
                Включить геолокацию для “Сейчас”
              </Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          onPress={onSend}
          disabled={sending}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 12,
            backgroundColor: sending
              ? "rgba(55,65,81,0.9)"
              : theme.colors.primary,
          }}
        >
          <Text
            style={{
              color: "white",
              fontSize: 13,
              fontWeight: "800",
            }}
          >
            {t("now.send")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderPostItem = ({ item }: { item: NowPost }) => {
    const moodMeta = MOOD_META.find((m) => m.key === item.mood) ?? MOOD_META[0];
    const dist = distanceKm(pos, item);
    return (
      <View
        style={{
          borderRadius: 16,
          padding: 12,
          marginBottom: 10,
          // Card backgrounds also use the softer theme palette with subtle border
          backgroundColor: theme.colors.backgroundSoft,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: 4,
          }}
        >
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 14,
              fontWeight: "700",
              flex: 1,
            }}
          >
            {moodMeta.emoji} {item.nickname}
          </Text>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            {formatAgo(item.createdAt)}{dist != null ? ` • ~${dist} км` : ""}
          </Text>
        </View>
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          {moodMeta.label}
        </Text>
        <Text
          style={{
            color: "#D1D5DB",
            fontSize: 13,
          }}
        >
          {item.text}
        </Text>
      </View>
    );
  };

  return (
    <ScreenShell
      title={t("screens.now.title")}
      background="now"
      overlayOpacity={0.18}
      blurRadius={0}
      debugTint={false}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        }}
      >
        <SectionTitle>{t("screens.now.title")}</SectionTitle>
        {renderComposer()}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 2,
          }}
        >
          <Text
            style={{
              color: "#E5E7EB",
              fontSize: 15,
              fontWeight: "800",
            }}
          >
            Люди рядом прямо сейчас
          </Text>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            Радиус: {radiusKm == null ? "все расстояния" : `до ~${radiusKm} км`}
          </Text>
        </View>
        {renderRadiusChips()}
        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : (
          <FlatList
            data={visiblePosts}
            keyExtractor={(x) => x.id}
            renderItem={renderPostItem}
            contentContainerStyle={{
              paddingTop: 4,
              paddingBottom: 16,
            }}
            ListEmptyComponent={
              <View style={{ paddingTop: 16 }}>
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: 13,
                  }}
                >
                  Пока никто поблизости не написал, что хочет сделать прямо сейчас. Начни первым.
                </Text>
              </View>
            }
          />
        )}
      </View>
    </ScreenShell>
  );
}
