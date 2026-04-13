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
import type { PlayActivity } from "@/services/playSessions";
import { theme } from "@/theme";

type InboxThreadCard = {
  id: string;
  peerId: string;
  peerName: string;
  sourceKey: "play" | "direct";
  activity?: PlayActivity;
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
        daily_prompt: tt("inbox.sourcePlayDailyPrompt", "После общей темы дня"),
        color_mood: tt("inbox.sourcePlayColorMood", "После палитры настроения"),
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

  const renderHeroCard = (showAction: boolean) => (
    <View style={styles.heroCard}>
      <View style={styles.heroHeaderRow}>
        <Text style={styles.heroTitle}>
          {tt("inbox.activeTitle", "Активные чаты")}
        </Text>
        <Text style={styles.heroCount}>{cards.length}</Text>
      </View>
      <Text style={styles.heroText}>
        {tt(
          "inbox.subheader",
          "Здесь продолжается личный разговор. «Связи» держат контекст, а «Чаты» — сам диалог."
        )}
      </Text>
      {showAction ? (
        <Pressable
          onPress={() => navigation.navigate("Tabs", { screen: "Connections" })}
          style={styles.heroLinkButton}
        >
          <Text style={styles.heroLinkText}>
            {tt("inbox.openConnections", "Связи")}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyStateCard}>
      <View style={styles.emptyStateIcon}>
        <Text style={styles.emptyStateIconText}>💬</Text>
      </View>
      <Text style={styles.emptyStateTitle}>{t("chats.empty")}</Text>
      <Text style={styles.emptyStateText}>
        {tt(
          "inbox.emptyBody",
          "Когда связь перейдёт в личный диалог, чат останется здесь и будет ждать продолжения."
        )}
      </Text>
      <Pressable
        onPress={() => navigation.navigate("Tabs", { screen: "Connections" })}
        style={styles.emptyPrimaryButton}
      >
        <Text style={styles.emptyPrimaryButtonText}>
          {tt("inbox.openConnections", "Связи")}
        </Text>
      </Pressable>
      <Pressable onPress={startNewSession} style={styles.emptySecondaryButton}>
        <Text style={styles.emptySecondaryButtonText}>
          {tt("inbox.startNewSession", "Start a new shared session")}
        </Text>
      </Pressable>
    </View>
  );

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
            title={tt("inbox.authRequiredTitle", "Chats require sign-in")}
            body={tt(
              "inbox.authRequiredBody",
              "Sign in to see personal chats opened after shared sessions."
            )}
            primaryAction={{ label: t("menu.profile"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
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
            body={tt(
              "inbox.offlineBody",
              "We couldn't connect your personal chats right now. Try later or go back to Together."
            )}
            primaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
            secondaryAction={{
              label: tt("inbox.openConnections", "Connections"),
              onPress: () => navigation.navigate("Tabs", { screen: "Connections" }),
            }}
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
        {renderHeroCard(cards.length > 0)}

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
          renderEmptyState()
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
    gap: 8,
    padding: 16,
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
    fontSize: 17,
    fontWeight: "800",
  },
  heroCount: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  heroLinkButton: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroLinkText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  emptyStateCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(17, 20, 36, 0.82)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  emptyStateIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.2)",
  },
  emptyStateIconText: {
    fontSize: 20,
  },
  emptyStateTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  emptyStateText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyPrimaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    marginTop: 2,
  },
  emptyPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  emptySecondaryButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  emptySecondaryButtonText: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
});
