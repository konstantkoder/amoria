import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
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
import { formatAgoLong } from "@/utils/timeAgo";
import { translateMaybeKey } from "@/utils/i18n";
import { formatNickname } from "@/utils/nickname";

type Pos = { lat: number; lng: number; accuracy?: number | null };
type RadiusOption = number | null; // null = без ограничения

const RADIUS_OPTIONS: RadiusOption[] = [5, 10, 25, 50, 100, null];

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
  const navigation = useNavigation<any>();
  const user = auth?.currentUser ?? null;
  const { t } = useLocale();
  const mountedRef = useRef(true);
  const sendResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [pos, setPos] = useState<Pos | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [posts, setPosts] = useState<NowPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState<NowMood>("chill");
  const [message, setMessage] = useState(""); // текст сообщения
  const [sending, setSending] = useState(false);
  const [radiusKm, setRadiusKm] = useState<RadiusOption>(25);
  const sendGuardRef = useRef(false);

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
    [t],
  );

  const nickname = useMemo(() => {
    if (!user?.uid) return "common.anonymous";
    return makeNickname(user.uid);
  }, [user?.uid]);

  const ensurePosition = useCallback(async () => {
    if (!mountedRef.current) return;
    setPosLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        throw new Error(t("geo.permissionRequired"));
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const nextPos: Pos = {
        lat: current.coords.latitude,
        lng: current.coords.longitude,
        accuracy: current.coords.accuracy,
      };
      if (!mountedRef.current) return;
      setPos(nextPos);
      setRegion(makeRegion(nextPos.lat, nextPos.lng));
    } catch (e: any) {
      if (!mountedRef.current) return;
      setPos(null);
      setRegion(null);
    } finally {
      if (mountedRef.current) {
        setPosLoading(false);
      }
    }
  }, [t]);

  useEffect(() => {
    ensurePosition();
  }, [ensurePosition]);

  useEffect(() => {
    if (!region || !db || !isFirebaseConfigured()) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = subscribeNowPosts(db, region, (list) => {
      if (!mountedRef.current) return;
      setPosts(list);
      setLoading(false);
    });
    return () => unsub?.();
  }, [region]);

  const onSend = async () => {
    if (sendGuardRef.current) return;
    if (!user) {
      Alert.alert(t("now.signInTitle"), t("now.signInBody"));
      return;
    }
    if (!db || !isFirebaseConfigured()) {
      Alert.alert(t("now.firebaseTitle"), t("now.firebaseBody"));
      return;
    }
    const trimmed = message.trim();
    if (!trimmed) {
      Alert.alert(t("now.emptyTitle"), t("now.emptyBody"));
      return;
    }
    if (!pos) {
      Alert.alert(t("now.noLocationTitle"), t("now.noLocationBody"));
      return;
    }
    sendGuardRef.current = true;
    const previousMessage = message;
    const clientId = `m_${user.uid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setMessage("");
    try {
      if (mountedRef.current) {
        setSending(true);
      }
      await createNowPost(db, {
        clientId,
        uid: user.uid,
        nickname,
        text: trimmed,
        mood,
        lat: pos.lat,
        lng: pos.lng,
      });
    } catch (e: any) {
      if (mountedRef.current) {
        setMessage(previousMessage);
      }
      Alert.alert(t("now.sendFailedTitle"), e?.message ?? t("now.sendFailedBody"));
    } finally {
      if (mountedRef.current) {
        setSending(false);
      }
      sendResetTimeoutRef.current = setTimeout(() => {
        sendGuardRef.current = false;
      }, 250);
    }
  };

  const goToTogether = useCallback(() => {
    navigation.navigate("Together");
  }, [navigation]);

  const goToRooms = useCallback(() => {
    navigation.navigate("Rooms");
  }, [navigation]);

  const visiblePosts = useMemo(() => {
    const deduped = new Map<string, NowPost>();
    for (const p of posts) {
      const dist = distanceKm(pos, p);
      if (radiusKm != null && dist != null && dist > radiusKm) continue;
      deduped.set(String(p.id), p);
    }
    return Array.from(deduped.values());
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
      {moodMeta.map((m) => {
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
        const label =
          option == null ? t("common.all") : `${option} ${t("units.km")}`;
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
        {t("now.myStatusTitle")}
      </Text>
      <Text
        style={{
          color: "#9CA3AF",
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        {t("now.myStatusBody")}
      </Text>
      {renderMoodChips()}
      <TextInput
        value={message}
        onChangeText={setMessage}
        placeholder={t("now.placeholder")}
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
                {t("geo.locationUpdating")}
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
                {t("geo.locationReady")} (~{Math.round(pos.accuracy ?? 0)} {t("units.m")})
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
              <Ionicons name="location-outline" size={16} color="#F97373" />
              <Text
                style={{
                  color: "#FCA5A5",
                  fontSize: 12,
                  textDecorationLine: "underline",
                }}
              >
                {t("geo.enableForNow")}
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
    const moodInfo = moodMeta.find((m) => m.key === item.mood) ?? moodMeta[0];
    const dist = distanceKm(pos, item);
    const formattedNickname = formatNickname(item.nickname, t);
    const nickname =
      formattedNickname === item.nickname
        ? translateMaybeKey(item.nickname, t, ["common."])
        : formattedNickname;
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
            {moodInfo.emoji} {nickname}
          </Text>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            {formatAgoLong(item.createdAt, t)}
            {dist != null ? ` • ~${dist} ${t("units.km")}` : ""}
          </Text>
        </View>
        <Text
          style={{
            color: "#9CA3AF",
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          {moodInfo.label}
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

  const renderHero = () => (
    <View
      style={{
        borderRadius: theme.shapes.card,
        padding: 18,
        backgroundColor: "rgba(12, 16, 31, 0.9)",
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
        {t("now.heroKicker")}
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
        {t("now.heroTitle")}
      </Text>
      <Text
        style={{
          color: theme.colors.subtext,
          fontSize: 14,
          lineHeight: 21,
          marginBottom: 14,
        }}
      >
        {t("now.heroBody")}
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Pressable
          onPress={goToTogether}
          style={{
            borderRadius: theme.shapes.pill,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: theme.colors.accent,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "800" }}>
            {t("now.goToTogether")}
          </Text>
        </Pressable>
        <Pressable
          onPress={goToRooms}
          style={{
            borderRadius: theme.shapes.pill,
            paddingHorizontal: 14,
            paddingVertical: 10,
            backgroundColor: "rgba(255,255,255,0.06)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.08)",
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "700" }}>
            {t("now.openRooms")}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderRoomsBridge = () => (
    <View
      style={{
        borderRadius: 18,
        padding: 14,
        backgroundColor: "rgba(17, 20, 36, 0.88)",
        borderWidth: 1,
        borderColor: theme.colors.borderSubtle,
        marginBottom: 14,
      }}
    >
      <Text style={{ color: theme.colors.text, fontSize: 15, fontWeight: "800", marginBottom: 4 }}>
        {t("now.roomsCardTitle")}
      </Text>
      <Text style={{ color: theme.colors.subtext, fontSize: 13, lineHeight: 19, marginBottom: 10 }}>
        {t("now.roomsCardBody")}
      </Text>
      <Pressable
        onPress={goToRooms}
        style={{
          alignSelf: "flex-start",
          borderRadius: theme.shapes.pill,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: theme.colors.pillBg,
          borderWidth: 1,
          borderColor: theme.colors.borderSubtle,
        }}
      >
        <Text style={{ color: theme.colors.text, fontSize: 13, fontWeight: "800" }}>
          {t("now.openRooms")}
        </Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenShell
      title={t("tabs.now")}
      background="now"
      overlayOpacity={0.18}
      blurRadius={0}
    >
      <View
        style={{
          flex: 1,
          paddingHorizontal: 16,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
        }}
      >
        {renderHero()}
        <SectionTitle>{t("now.myVibeTitle")}</SectionTitle>
        {renderComposer()}
        {renderRoomsBridge()}
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
            {t("now.peopleNearby")}
          </Text>
          <Text
            style={{
              color: "#9CA3AF",
              fontSize: 11,
            }}
          >
            {t("common.radius")}:{" "}
            {radiusKm == null
              ? t("now.radiusAll")
              : t("now.radiusUpTo", { km: String(radiusKm) })}
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
            keyExtractor={(x) => String(x.id)}
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
                  {t("now.noneNearby")}
                </Text>
              </View>
            }
          />
        )}
      </View>
    </ScreenShell>
  );
}
