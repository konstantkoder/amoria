import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { auth, db } from "@/config/firebaseConfig";
import CoreStateCard from "@/components/CoreStateCard";
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
  activity?: "draw" | "chain_draw";
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
    ...(thread.artworkSummary?.activity
      ? { activity: thread.artworkSummary.activity }
      : {}),
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
  const [threads, setThreads] = useState<DmThreadDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setThreads([]);
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
        setThreads(threads);
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
  }, [reloadKey, tt, uid]);

  const cards = useMemo(
    () =>
      threads
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
        .sort((a, b) => b.sortAt - a.sortAt),
    [freshnessState.dmThreads, t, threads, tt, uid]
  );

  const sourceLabels = useMemo(
    () => ({
      play: {
        draw: tt("inbox.sourcePlay", "После совместной сессии"),
        chain_draw: tt("inbox.sourcePlayChainDraw", "После рисунка по очереди"),
      },
      direct: tt("inbox.sourceDefault", "Личный чат"),
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
                {item.sourceKey === "play"
                  ? sourceLabels.play[item.activity ?? "draw"]
                  : sourceLabels.direct}
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

  if (!uid) {
    return (
      <ScreenShell
        title={t("tabs.chats")}
        background="togetherChat"
      >
        <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: "center" }}>
          <CoreStateCard
            icon="person-circle-outline"
            title="Чаты доступны после входа"
            body="Войди в аккаунт, чтобы видеть личные диалоги, открытые после совместных сессий."
            primaryAction={{ label: "Открыть профиль", onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: "Вернуться во Вместе", onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!db) {
    return (
      <ScreenShell
        title={t("tabs.chats")}
        background="togetherChat"
      >
        <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: "center" }}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("inbox.errorTitle", "Chats are temporarily unavailable")}
            body="Мы не смогли подключить личные чаты прямо сейчас. Попробуй позже или вернись во Вместе."
            primaryAction={{ label: "Вернуться во Вместе", onPress: goToTogether }}
            secondaryAction={{ label: "Открыть связи", onPress: () => navigation.navigate("Tabs", { screen: "Connections" }) }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("tabs.chats")}
      background="togetherChat"
    >
      <View
        style={[styles.screenContent, { paddingBottom: insets.bottom + 8 }]}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeaderRow}>
            <Text
              style={styles.heroTitle}
            >
              {tt("inbox.activeTitle", "Активные чаты")}
            </Text>
            <Text style={styles.heroCount}>{cards.length}</Text>
          </View>
          <Text style={styles.heroText}>
            {tt(
              "inbox.subheader",
              "Здесь идёт активная переписка. «Связи» держат общий контекст, а «Чаты» продолжают сам разговор."
            )}
          </Text>
          <Pressable
            onPress={() => navigation.navigate("Tabs", { screen: "Connections" })}
            style={styles.heroLinkButton}
          >
            <Text style={styles.heroLinkText}>
              {tt("inbox.openConnections", "Связи")}
            </Text>
          </Pressable>
        </View>

        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            <CoreStateCard
              loading
              icon="chatbubbles-outline"
              title={t("tabs.chats")}
              body={tt("inbox.loading", "Loading your chats…")}
            />
          </View>
        ) : error ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            <CoreStateCard
              icon="cloud-offline-outline"
              title={tt("inbox.errorTitle", "Chats are temporarily unavailable")}
              body={error}
              primaryAction={{
                label: tt("common.retry", "Повторить"),
                onPress: () => setReloadKey((prev) => prev + 1),
              }}
              secondaryAction={{
                label: tt("inbox.openConnections", "Связи"),
                onPress: () => navigation.navigate("Tabs", { screen: "Connections" }),
              }}
            />
          </View>
        ) : cards.length ? (
          <FlatList
            data={cards}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            <CoreStateCard
              icon="chatbubbles-outline"
              title={tt("chats.empty", "No chats yet.")}
              body={tt(
                "inbox.emptyBody",
                "After a mutual open, the personal chat will appear here and stay ready whenever you want to continue."
              )}
              primaryAction={{ label: "Начать новую совместную сессию", onPress: startNewSession }}
              secondaryAction={{
                label: tt("inbox.openConnections", "Связи"),
                onPress: () => navigation.navigate("Tabs", { screen: "Connections" }),
              }}
            />
          </View>
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroCard: {
    marginBottom: 16,
    gap: 10,
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(16, 20, 38, 0.72)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  heroCount: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  heroLinkButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroLinkText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
});
