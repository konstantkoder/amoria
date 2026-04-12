import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";

import {
  type NearbyTabNavigationProp,
  buildRoomsTarget,
} from "@/navigation/appRoutes";
import { theme } from "@/theme";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  type NowMood,
  type NowPost,
  createNowPost,
  makeRegion,
  subscribeNowPosts,
} from "@/services/now";
import { makeNickname } from "@/services/rooms";
import { useLocale } from "@/contexts/LocaleContext";
import { formatAgoLong } from "@/utils/timeAgo";
import { translateMaybeKey } from "@/utils/i18n";
import { formatNickname } from "@/utils/nickname";

type Pos = { lat: number; lng: number; accuracy?: number | null };
type RadiusOption = number | null;

type Props = {
  showHero?: boolean;
  showRoomsBridge?: boolean;
  bottomInset?: number;
};

const RADIUS_OPTIONS: RadiusOption[] = [5, 10, 25, 50, 100, null];

function distanceKm(pos: Pos | null, item: { lat?: number; lng?: number }): number | null {
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

export default function NearbyNowSection({
  showHero = false,
  showRoomsBridge = false,
  bottomInset,
}: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NearbyTabNavigationProp>();
  const user = auth?.currentUser ?? null;
  const { t } = useLocale();
  const mountedRef = useRef(true);
  const sendResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendGuardRef = useRef(false);

  const [pos, setPos] = useState<Pos | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [region, setRegion] = useState<string | null>(null);
  const [posts, setPosts] = useState<NowPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [mood, setMood] = useState<NowMood>("chill");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [radiusKm, setRadiusKm] = useState<RadiusOption>(25);

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
    } catch {
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
    void ensurePosition();
  }, [ensurePosition]);

  useEffect(() => {
    if (!region || !db || !isFirebaseConfigured()) {
      setPosts([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeNowPosts(db, region, (list) => {
      if (!mountedRef.current) return;
      setPosts(list);
      setLoading(false);
    });
    return () => unsubscribe?.();
  }, [region]);

  const onSend = useCallback(async () => {
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
    } catch (error: any) {
      if (mountedRef.current) {
        setMessage(previousMessage);
      }
      Alert.alert(t("now.sendFailedTitle"), error?.message ?? t("now.sendFailedBody"));
    } finally {
      if (mountedRef.current) {
        setSending(false);
      }
      sendResetTimeoutRef.current = setTimeout(() => {
        sendGuardRef.current = false;
      }, 250);
    }
  }, [message, mood, nickname, pos, t, user]);

  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const goToRooms = useCallback(() => {
    navigation.navigate(...buildRoomsTarget());
  }, [navigation]);

  const visiblePosts = useMemo(() => {
    const deduped = new Map<string, NowPost>();
    for (const post of posts) {
      const distance = distanceKm(pos, post);
      if (radiusKm != null && distance != null && distance > radiusKm) continue;
      deduped.set(String(post.id), post);
    }
    return Array.from(deduped.values());
  }, [pos, posts, radiusKm]);
  const showStandaloneHeading = showHero || showRoomsBridge;

  const renderHero = showHero ? (
    <View style={styles.heroCard}>
      <Text style={styles.heroKicker}>{t("now.heroKicker")}</Text>
      <Text style={styles.heroTitle}>{t("now.heroTitle")}</Text>
      <Text style={styles.heroBody}>{t("now.heroBody")}</Text>
      <View style={styles.heroActions}>
        <Pressable onPress={goToTogether} style={styles.heroPrimaryButton}>
          <Text style={styles.heroPrimaryButtonText}>{t("now.goToTogether")}</Text>
        </Pressable>
        <Pressable onPress={goToRooms} style={styles.heroSecondaryButton}>
          <Text style={styles.heroSecondaryButtonText}>{t("now.openRooms")}</Text>
        </Pressable>
      </View>
    </View>
  ) : null;

  const renderComposer = (
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
        placeholderTextColor="#6B7280"
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
          ) : pos ? (
            <View style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color="#A7F3D0" />
              <Text style={styles.locationText}>
                {t("geo.locationReady")} (~{Math.round(pos.accuracy ?? 0)} {t("units.m")})
              </Text>
            </View>
          ) : (
            <TouchableOpacity onPress={ensurePosition} style={styles.locationRow}>
              <Ionicons name="location-outline" size={16} color="#F97373" />
              <Text style={styles.locationLink}>{t("geo.enableForNow")}</Text>
            </TouchableOpacity>
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
    </View>
  );

  const renderRoomsBridge = showRoomsBridge ? (
    <View style={styles.roomsBridgeCard}>
      <Text style={styles.roomsBridgeTitle}>{t("now.roomsCardTitle")}</Text>
      <Text style={styles.roomsBridgeBody}>{t("now.roomsCardBody")}</Text>
      <Pressable onPress={goToRooms} style={styles.roomsBridgeButton}>
        <Text style={styles.roomsBridgeButtonText}>{t("now.openRooms")}</Text>
      </Pressable>
    </View>
  ) : null;

  const header = (
    <View style={styles.headerContent}>
      {renderHero}
      {showStandaloneHeading ? (
        <Text style={styles.sectionHeading}>{t("now.myVibeTitle")}</Text>
      ) : null}
      {renderComposer}
      {renderRoomsBridge}
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
    </View>
  );

  const renderPostItem = ({ item }: { item: NowPost }) => {
    const moodInfo = moodMeta.find((meta) => meta.key === item.mood) ?? moodMeta[0];
    const distance = distanceKm(pos, item);
    const formattedNickname = formatNickname(item.nickname, t);
    const authorLabel =
      formattedNickname === item.nickname
        ? translateMaybeKey(item.nickname, t, ["common."])
        : formattedNickname;

    return (
      <View style={styles.postCard}>
        <View style={styles.postHeader}>
          <Text style={styles.postAuthor}>
            {moodInfo.emoji} {authorLabel}
          </Text>
          <Text style={styles.postMeta}>
            {formatAgoLong(item.createdAt, t)}
            {distance != null ? ` • ~${distance} ${t("units.km")}` : ""}
          </Text>
        </View>
        <View style={styles.postMoodPill}>
          <Text style={styles.postMoodText}>{moodInfo.label}</Text>
        </View>
        <Text style={styles.postText}>{item.text}</Text>
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
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>{t("now.peopleNearby")}</Text>
              <Text style={styles.emptyText}>{t("now.noneNearby")}</Text>
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  headerContent: {
    gap: 10,
    paddingHorizontal: 2,
    paddingBottom: 8,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(12, 16, 31, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    marginBottom: 8,
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroPrimaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.accent,
  },
  heroPrimaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  heroSecondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  sectionHeading: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 2,
    paddingHorizontal: 2,
  },
  composerCard: {
    borderRadius: 20,
    padding: 14,
    backgroundColor: "rgba(17, 20, 36, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  composerTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  sectionTitle: {
    color: "#E5E7EB",
    fontSize: 14,
    fontWeight: "800",
  },
  sectionBody: {
    color: "#9CA3AF",
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3,
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  moodChipActive: {
    backgroundColor: "rgba(255,78,138,0.18)",
    borderColor: "rgba(255,78,138,0.28)",
  },
  moodEmoji: {
    fontSize: 14,
    marginRight: 4,
  },
  moodText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  moodTextActive: {
    fontWeight: "800",
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    backgroundColor: "rgba(5, 8, 22, 0.36)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: theme.colors.pillText,
    fontSize: 14,
    minHeight: 74,
    textAlignVertical: "top",
  },
  composerFooter: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
  },
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 38,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  locationText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  locationLink: {
    color: "#FCA5A5",
    fontSize: 11,
    textDecorationLine: "underline",
  },
  sendButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(55,65,81,0.9)",
  },
  sendButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  roomsBridgeCard: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(17, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  roomsBridgeTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  roomsBridgeBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 8,
  },
  roomsBridgeButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  roomsBridgeButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  listHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
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
    gap: 6,
  },
  radiusChip: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  radiusChipActive: {
    backgroundColor: "rgba(255,122,60,0.18)",
    borderColor: "rgba(255,122,60,0.24)",
  },
  radiusText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "600",
  },
  radiusTextActive: {
    fontWeight: "800",
  },
  postCard: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "rgba(17, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  postHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  postAuthor: {
    color: "#E5E7EB",
    fontSize: 13,
    fontWeight: "700",
    flex: 1,
  },
  postMeta: {
    color: "#9CA3AF",
    fontSize: 11,
  },
  postMoodPill: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  postMoodText: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "700",
  },
  postText: {
    color: "#D1D5DB",
    fontSize: 13,
    lineHeight: 18,
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
    borderRadius: 16,
    padding: 14,
    backgroundColor: "rgba(17, 20, 36, 0.72)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
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
