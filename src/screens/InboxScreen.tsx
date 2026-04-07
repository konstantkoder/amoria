import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { auth, db } from "@/config/firebaseConfig";
import ScreenShell from "@/components/ScreenShell";
import {
  formatActivitySignalLabel,
  getDmThreadActivitySignal,
  useActivityFreshnessState,
} from "@/services/activityFreshness";
import {
  buildDmChatRouteParams,
  mapDmThreadToPeer,
  subscribeDmThreads,
  type DmThreadDoc,
} from "@/services/dm";
import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme";

type InboxThreadCard = {
  id: string;
  peerId: string;
  peerName: string;
  sourceKey: "play" | "direct";
  previewText: string;
  dateLabel: string;
  sortAt: number;
  signalLabel?: string;
  signalTone?: "fresh" | "recent";
};

function formatThreadDate(value: number) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

function mapThreadToCard(
  thread: DmThreadDoc,
  uid: string,
  fallbackName: string,
  previewFallback: string,
  seenAt: number,
  formatSignal: (thread: DmThreadDoc) => string
): InboxThreadCard | null {
  const peer = mapDmThreadToPeer(thread, uid);
  if (!peer) return null;

  const sortAt = thread.lastMessageAt ?? thread.updatedAt ?? thread.createdAt;
  const signal = getDmThreadActivitySignal(thread, seenAt);
  return {
    id: thread.id,
    peerId: peer.uid,
    peerName: peer.name || fallbackName,
    sourceKey: thread.source === "play" ? "play" : "direct",
    previewText: thread.lastMessageText?.trim() || previewFallback,
    dateLabel: formatThreadDate(sortAt),
    sortAt,
    ...(signal ? { signalLabel: formatSignal(thread), signalTone: signal.tone } : {}),
  };
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { t } = useLocale();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const uid = auth?.currentUser?.uid ?? "";
  const freshnessState = useActivityFreshnessState();
  const [cards, setCards] = useState<InboxThreadCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setCards([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const unsubscribe = subscribeDmThreads(
      db,
      uid,
      (threads) => {
        if (!alive) return;
        const next = threads
          .map((thread) =>
            mapThreadToCard(
              thread,
              uid,
              t("common.user"),
              tt("inbox.previewFallback", "The connection is open. You can write first."),
              freshnessState.dmThreads[thread.id] ?? 0,
              (currentThread) =>
                formatActivitySignalLabel(
                  getDmThreadActivitySignal(
                    currentThread,
                    freshnessState.dmThreads[currentThread.id] ?? 0
                  ),
                  tt
                )
            )
          )
          .filter((item): item is InboxThreadCard => Boolean(item))
          .sort((a, b) => b.sortAt - a.sortAt);

        setCards(next);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        setError(tt("inbox.errorBody", "We couldn't connect your personal chats right now. Try again."));
        setLoading(false);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [freshnessState.dmThreads, reloadKey, t, tt, uid]);

  const sourceLabels = useMemo(
    () => ({
      play: tt("connections.sourceDraw", "Drew together"),
      direct: tt("inbox.sourceDefault", "Open chat"),
    }),
    [tt]
  );
  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);
  const startNewSession = useCallback(() => {
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  const renderCard = useCallback(
    ({ item }: { item: InboxThreadCard }) => (
      <Pressable
        onPress={() =>
          navigation.navigate(
            "DMChat",
            buildDmChatRouteParams({
              threadId: item.id,
              peerId: item.peerId,
              peerName: item.peerName,
              backTarget: "inbox",
            })
          )
        }
        style={{
          backgroundColor:
            item.signalTone === "fresh" ? "rgba(25, 20, 37, 0.94)" : "rgba(17, 20, 36, 0.9)",
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor:
            item.signalTone === "fresh" ? "rgba(255, 78, 138, 0.34)" : theme.colors.borderSubtle,
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 17,
                  fontWeight: "800",
                }}
              >
                {item.peerName}
              </Text>
              {item.signalLabel ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: theme.shapes.pill,
                    backgroundColor:
                      item.signalTone === "fresh"
                        ? "rgba(255, 78, 138, 0.16)"
                        : "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderColor:
                      item.signalTone === "fresh"
                        ? "rgba(255, 78, 138, 0.28)"
                        : theme.colors.borderSubtle,
                  }}
                >
                  <Text
                    style={{
                      color: item.signalTone === "fresh" ? theme.colors.primary : theme.colors.text,
                      fontSize: 11,
                      fontWeight: "800",
                    }}
                  >
                    {item.signalLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: theme.shapes.pill,
                backgroundColor: "rgba(255, 122, 60, 0.12)",
                borderWidth: 1,
                borderColor: "rgba(255, 122, 60, 0.22)",
              }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "800" }}>
                {sourceLabels[item.sourceKey]}
              </Text>
            </View>
          </View>
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {item.dateLabel}
          </Text>
        </View>

        <Text
          style={{
            color: item.signalTone === "fresh" ? theme.colors.text : theme.colors.subtext,
            fontSize: 14,
            lineHeight: 20,
          }}
          numberOfLines={2}
        >
          {item.previewText}
        </Text>
      </Pressable>
    ),
    [navigation, sourceLabels]
  );

  return (
    <ScreenShell
      title={t("tabs.chats")}
      background="chats"
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
        <View style={{ marginBottom: 16, gap: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "baseline",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 18,
                fontWeight: "800",
              }}
            >
              {t("tabs.chats")}
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12 }}>{cards.length}</Text>
          </View>
          <Text style={{ color: theme.colors.subtext, fontSize: 14, lineHeight: 20 }}>
            {tt(
              "inbox.subheader",
              "This is where active personal conversation lives. Connections keeps the shared story, and Chats keeps the dialogue moving."
            )}
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Connections" })}
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.shapes.pill,
              backgroundColor: theme.colors.pillBg,
              borderWidth: 1,
              borderColor: theme.colors.borderSubtle,
            }}
          >
            <Text style={{ color: theme.colors.text, fontSize: 12, fontWeight: "800" }}>
              {tt("inbox.openConnections", "Открыть связи")}
            </Text>
          </Pressable>
          <Pressable
            onPress={startNewSession}
            style={{
              alignSelf: "flex-start",
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: theme.shapes.pill,
              backgroundColor: theme.colors.primary,
            }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "800" }}>
              Начать новую совместную сессию
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
              gap: 12,
            }}
          >
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={{ color: theme.colors.subtext, fontSize: 14, textAlign: "center" }}>
              {tt("inbox.loading", "Loading your chats…")}
            </Text>
          </View>
        ) : error ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
              gap: 12,
            }}
          >
            <View
              style={{
                width: 78,
                height: 78,
                borderRadius: 39,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255, 122, 60, 0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Ionicons name="alert-circle-outline" size={34} color={theme.colors.accent} />
            </View>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 18,
                fontWeight: "800",
                textAlign: "center",
              }}
            >
              {tt("inbox.errorTitle", "Chats are temporarily unavailable")}
            </Text>
            <Text style={{ color: theme.colors.subtext, fontSize: 14, lineHeight: 20, textAlign: "center" }}>
              {error}
            </Text>
            <Pressable
              onPress={() => setReloadKey((prev) => prev + 1)}
              style={{
                marginTop: 4,
                paddingHorizontal: 14,
                paddingVertical: 10,
                borderRadius: theme.shapes.pill,
                backgroundColor: theme.colors.primary,
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "800" }}>
                {tt("common.retry", "Retry")}
              </Text>
            </Pressable>
          </View>
        ) : cards.length ? (
          <FlatList
            data={cards}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 12, gap: 12 }}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 28,
            }}
          >
            <View
              style={{
                width: 78,
                height: 78,
                borderRadius: 39,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(255, 78, 138, 0.12)",
                borderWidth: 1,
                borderColor: "rgba(255,255,255,0.08)",
              }}
            >
              <Ionicons name="chatbubbles-outline" size={34} color={theme.colors.primary} />
            </View>
            <Text
              style={{
                color: theme.colors.text,
                fontSize: 18,
                fontWeight: "800",
                textAlign: "center",
                marginTop: 18,
                marginBottom: 8,
              }}
            >
              {tt("chats.empty", "No chats yet.")}
            </Text>
            <Text
              style={{
                color: theme.colors.subtext,
                fontSize: 14,
                textAlign: "center",
                lineHeight: 20,
                marginBottom: 18,
              }}
            >
              {tt(
                "inbox.emptyBody",
                "After a mutual open, the personal chat will appear here and stay ready whenever you want to continue."
              )}
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
              <Pressable
                onPress={startNewSession}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: theme.shapes.pill,
                  backgroundColor: theme.colors.primary,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "800" }}>
                  Начать новую совместную сессию
                </Text>
              </Pressable>
              <Pressable
                onPress={goToTogether}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: theme.shapes.pill,
                  backgroundColor: theme.colors.pillBg,
                  borderWidth: 1,
                  borderColor: theme.colors.borderSubtle,
                }}
              >
                <Text style={{ color: theme.colors.text, fontWeight: "800" }}>
                  Вернуться во Вместе
                </Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </ScreenShell>
  );
}
