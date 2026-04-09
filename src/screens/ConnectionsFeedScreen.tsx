import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  formatActivitySignalLabel,
  getDmThreadActivitySignal,
  getPlaySessionActivitySignal,
  useActivityFreshnessState,
} from "@/services/activityFreshness";
import {
  buildDmChatRouteParams,
  ensureDmThread,
  mapDmThreadToPeer,
  subscribeDmThreads,
  type DmThreadDoc,
} from "@/services/dm";
import {
  getPlayActivityLabel,
  getPeerFromSession,
  subscribeRecentMutualPlaySessions,
  type PlaySessionDoc,
} from "@/services/playSessions";
import { theme } from "@/theme";

type HistoryCard = {
  id: string;
  sessionId?: string;
  threadId?: string;
  peerId: string;
  peerName: string;
  activityLabel: string;
  previewText: string;
  freshnessLabel: string;
  strokeCount?: number;
  sortAt: number;
  isFallback: boolean;
  signalLabel?: string;
  signalTone?: "fresh" | "recent";
};

function formatFreshness(
  value: number,
  now: number,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (!value) return t("connections.justNow");

  const diff = Math.max(now - value, 0);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < hour) {
    const minutes = Math.max(Math.round(diff / minute), 1);
    return t("connections.minutesAgo", { count: String(minutes) });
  }

  if (diff < day) {
    const hours = Math.max(Math.round(diff / hour), 1);
    return t("connections.hoursAgo", { count: String(hours) });
  }

  if (diff < 7 * day) {
    const days = Math.max(Math.round(diff / day), 1);
    return t("connections.daysAgo", { count: String(days) });
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleDateString();
  }
}

function formatActivityLabel(
  activity: string,
  t: (key: string) => string,
  tt: (key: string, fallback: string) => string
) {
  if (activity === "draw") return t("connections.sourceDraw");
  if (activity === "chain_draw") {
    return tt("connections.sourceChainDraw", getPlayActivityLabel(activity, "history"));
  }
  return getPlayActivityLabel(activity, "history");
}

function mapSessionToHistoryCard(
  session: PlaySessionDoc,
  uid: string,
  now: number,
  t: (key: string, params?: Record<string, string>) => string,
  tt: (key: string, fallback: string) => string,
  threadBySessionId: Map<string, DmThreadDoc>,
  signalLabel?: string,
  signalTone?: "fresh" | "recent"
): HistoryCard | null {
  const peer = getPeerFromSession(session, uid);
  if (!peer) return null;

  const linkedThread = threadBySessionId.get(session.id);
  const sortAt = session.endedAt ?? session.startedAt ?? session.createdAt;

  return {
    id: session.id,
    sessionId: session.id,
    ...(linkedThread ? { threadId: linkedThread.id } : {}),
    peerId: peer.uid,
    peerName: peer.nickname,
    activityLabel: formatActivityLabel(session.activity, t, tt),
    previewText: linkedThread?.lastMessageText?.trim() || t("connections.connectionPreviewFallback"),
    freshnessLabel: formatFreshness(sortAt, now, t),
    ...(session.resultStrokeCount != null ? { strokeCount: session.resultStrokeCount } : {}),
    sortAt,
    isFallback: false,
    ...(signalLabel ? { signalLabel, signalTone } : {}),
  };
}

function mapThreadToFallbackCard(
  thread: DmThreadDoc,
  uid: string,
  now: number,
  t: (key: string, params?: Record<string, string>) => string,
  tt: (key: string, fallback: string) => string,
  signalLabel?: string,
  signalTone?: "fresh" | "recent"
): HistoryCard | null {
  if (thread.sourceSessionId) return null;
  const peer = mapDmThreadToPeer(thread, uid);
  if (!peer) return null;

  const sortAt = thread.lastMessageAt ?? thread.updatedAt ?? thread.createdAt;
  return {
    id: thread.id,
    threadId: thread.id,
    peerId: peer.uid,
    peerName: peer.name,
    activityLabel:
      thread.source === "play"
        ? formatActivityLabel(thread.artworkSummary?.activity ?? "draw", t, tt)
        : t("connections.sourceOpened"),
    previewText: thread.lastMessageText?.trim() || t("connections.connectionPreviewFallback"),
    freshnessLabel: formatFreshness(sortAt, now, t),
    ...(thread.artworkSummary?.strokeCount != null
      ? { strokeCount: thread.artworkSummary.strokeCount }
      : {}),
    sortAt,
    isFallback: true,
    ...(signalLabel ? { signalLabel, signalTone } : {}),
  };
}

export default function ConnectionsFeedScreen() {
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
  const [now, setNow] = useState(() => Date.now());
  const [threads, setThreads] = useState<DmThreadDoc[]>([]);
  const [sessions, setSessions] = useState<PlaySessionDoc[]>([]);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingCardId, setOpeningCardId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setThreads([]);
      setThreadsLoaded(true);
      setError(null);
      setActionError(null);
      return;
    }

    setThreadsLoaded(false);
    setError(null);
    setActionError(null);
    const unsubscribe = subscribeDmThreads(
      db,
      uid,
      (next) => {
        if (!alive) return;
        setThreads(next);
        setThreadsLoaded(true);
      },
      () => {
        if (!alive) return;
        setError(tt("connections.errorBody", "We couldn't load your open connections right now."));
        setThreadsLoaded(true);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [uid, tt, reloadKey]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setSessions([]);
      setSessionsLoaded(true);
      return;
    }

    setSessionsLoaded(false);
    setError(null);
    const unsubscribe = subscribeRecentMutualPlaySessions(
      db,
      uid,
      (next) => {
        if (!alive) return;
        setSessions(next);
        setSessionsLoaded(true);
      },
      5,
      () => {
        if (!alive) return;
        setError(tt("connections.errorBody", "We couldn't load your open connections right now."));
        setSessionsLoaded(true);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [uid, reloadKey, tt]);

  useEffect(() => {
    setNow(Date.now());
  }, [sessions, threads]);

  const threadBySessionId = useMemo(() => {
    const next = new Map<string, DmThreadDoc>();
    for (const thread of threads) {
      if (thread.sourceSessionId) {
        next.set(thread.sourceSessionId, thread);
      }
    }
    return next;
  }, [threads]);

  const sessionById = useMemo(() => {
    const next = new Map<string, PlaySessionDoc>();
    for (const session of sessions) {
      next.set(session.id, session);
    }
    return next;
  }, [sessions]);

  const historyCards = useMemo(
    () =>
      sessions
        .map((session) => {
          const linkedThread = threadBySessionId.get(session.id);
          const threadSignal = linkedThread
            ? getDmThreadActivitySignal(linkedThread, freshnessState.dmThreads[linkedThread.id] ?? 0, now)
            : null;
          const sessionSignal = getPlaySessionActivitySignal(
            session,
            freshnessState.playSessions[session.id] ?? 0,
            now
          );
          const signal = threadSignal ?? sessionSignal;

          return mapSessionToHistoryCard(
            session,
            uid,
            now,
            t,
            tt,
            threadBySessionId,
            formatActivitySignalLabel(signal, tt),
            signal?.tone
          );
        })
        .filter((item): item is HistoryCard => Boolean(item))
        .sort((a, b) => b.sortAt - a.sortAt)
        .slice(0, 8),
    [freshnessState.dmThreads, freshnessState.playSessions, now, sessions, t, threadBySessionId, tt, uid]
  );

  const fallbackCards = useMemo(
    () =>
      historyCards.length
        ? []
        : threads
            .map((thread) => {
              const signal = getDmThreadActivitySignal(
                thread,
                freshnessState.dmThreads[thread.id] ?? 0,
                now
              );
              return mapThreadToFallbackCard(
                thread,
                uid,
                now,
                t,
                tt,
                formatActivitySignalLabel(signal, tt),
                signal?.tone
              );
            })
            .filter((item): item is HistoryCard => Boolean(item))
            .sort((a, b) => b.sortAt - a.sortAt),
    [freshnessState.dmThreads, historyCards.length, now, t, threads, tt, uid]
  );

  const isLoading = !threadsLoaded || !sessionsLoaded;
  const isEmpty = !historyCards.length && !fallbackCards.length;

  const openChat = useCallback(
    async (card: HistoryCard) => {
      if (!db || !uid || !card.peerId) return;

      if (card.threadId) {
        setActionError(null);
        navigation.navigate(
          "DMChat",
          buildDmChatRouteParams({
            threadId: card.threadId,
            peerId: card.peerId,
            peerName: card.peerName,
            backTarget: "connections",
          })
        );
        return;
      }

      if (!card.sessionId) return;
      const session = sessionById.get(card.sessionId);
      if (!session) {
        setActionError("Не удалось найти исходную совместную историю для этого чата. Попробуй открыть связь позже.");
        return;
      }

      setOpeningCardId(card.id);
      try {
        const threadId = await ensureDmThread(db, uid, card.peerId, {
          memberNames: {
            [uid]: session.participantNicknames?.[uid] ?? t("common.you"),
            [card.peerId]: card.peerName,
          },
          source: "play",
          sourceSessionId: session.id,
          artworkSummary: {
            activity: session.activity,
            strokeCount: session.resultStrokeCount,
          },
        });

        navigation.navigate(
          "DMChat",
          buildDmChatRouteParams({
            threadId,
            peerId: card.peerId,
            peerName: card.peerName,
            backTarget: "connections",
          })
        );
        setActionError(null);
      } catch {
        setActionError("Не удалось открыть чат прямо сейчас. Попробуй еще раз чуть позже.");
      } finally {
        setOpeningCardId((prev) => (prev === card.id ? null : prev));
      }
    },
    [db, navigation, sessionById, t, uid]
  );

  const openDetail = useCallback(
    (sessionId: string) => {
      navigation.navigate("PlaySessionDetail", { sessionId });
    },
    [navigation]
  );

  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const goToHistory = useCallback(() => {
    navigation.navigate("PlayHistory");
  }, [navigation]);
  const startNewSession = useCallback(() => {
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  const renderConnectionCard = useCallback(
    (card: HistoryCard) => (
      <View key={card.id} style={card.isFallback ? styles.storyCard : styles.card}>
        <View style={styles.cardTopRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{card.peerName}</Text>
              {card.signalLabel ? (
                <View
                  style={[
                    styles.signalBadge,
                    card.signalTone === "fresh" ? styles.signalBadgeFresh : styles.signalBadgeRecent,
                  ]}
                >
                  <Text
                    style={[
                      styles.signalBadgeText,
                      card.signalTone === "fresh"
                        ? styles.signalBadgeTextFresh
                        : styles.signalBadgeTextRecent,
                    ]}
                  >
                    {card.signalLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.cardSource}>{card.activityLabel}</Text>
          </View>
          <Text style={styles.cardDate}>{card.freshnessLabel}</Text>
        </View>

        <Text style={styles.previewText} numberOfLines={2}>
          {card.previewText}
        </Text>

        <View style={styles.metaRow}>
          {card.strokeCount != null ? (
            <View style={styles.metaPill}>
              <Text style={styles.metaPillText}>
                {t("connections.strokeCount", { count: String(card.strokeCount) })}
              </Text>
            </View>
          ) : null}
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>
              {card.isFallback ? t("connections.connectionOpen") : t("connections.mutualOpen")}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {!card.isFallback && card.sessionId ? (
            <Pressable onPress={() => openDetail(card.sessionId!)} style={styles.secondaryCta}>
              <Text style={styles.secondaryCtaText}>Открыть историю</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void openChat(card)}
            style={styles.primaryCta}
            disabled={openingCardId === card.id}
          >
            <Text style={styles.primaryCtaText}>
              {openingCardId === card.id
                ? tt("connections.openingChat", "Открываем чат…")
                : t("connections.openChat")}
            </Text>
          </Pressable>
        </View>
      </View>
    ),
    [openChat, openDetail, openingCardId, t, tt]
  );

  if (!uid) {
    return (
      <ScreenShell
        title={t("tabs.connections")}
        background="togetherStory"
      >
        <View style={styles.emptyWrap}>
          <CoreStateCard
            icon="person-circle-outline"
            title="Связи доступны после входа"
            body="Войди в аккаунт, чтобы видеть открытые связи, совместные истории и быстрый вход в личные чаты."
            primaryAction={{ label: "Открыть профиль", onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!db) {
    return (
      <ScreenShell
        title={t("tabs.connections")}
        background="togetherStory"
      >
        <View style={styles.emptyWrap}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("connections.errorTitle", "Connections are temporarily unavailable")}
            body="Мы не смогли подключить связи прямо сейчас. Попробуй позже или вернись во Вместе."
            primaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
            secondaryAction={{ label: "Совместные истории", onPress: goToHistory }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("tabs.connections")}
      background="togetherStory"
    >
      {isLoading ? (
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="git-network-outline"
            title={t("tabs.connections")}
            body={t("connections.loading")}
          />
        </View>
      ) : error ? (
        <View style={styles.emptyWrap}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("connections.errorTitle", "Connections are temporarily unavailable")}
            body={error}
            primaryAction={{
              label: tt("common.retry", "Повторить"),
              onPress: () => setReloadKey((prev) => prev + 1),
            }}
            secondaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
          />
        </View>
      ) : isEmpty ? (
        <View style={styles.emptyWrap}>
          <CoreStateCard
            icon="git-network-outline"
            title={t("connections.emptyTitle")}
            body={t("connections.emptyBody")}
            primaryAction={{ label: "Начать совместную сессию", onPress: startNewSession }}
            secondaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
          />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {actionError ? (
            <View style={styles.inlineErrorCard}>
              <Text style={styles.inlineErrorTitle}>Чат пока не открылся</Text>
              <Text style={styles.inlineErrorText}>{actionError}</Text>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            <Text style={styles.heroKicker}>{t("connections.heroKicker")}</Text>
            <Text style={styles.heroTitle}>{t("connections.heroTitle")}</Text>
            <Text style={styles.heroText}>{t("connections.heroBody")}</Text>
            <View style={styles.heroActions}>
              <Pressable onPress={startNewSession} style={styles.heroPrimaryButton}>
                <Text style={styles.heroPrimaryButtonText}>Начать новую совместную сессию</Text>
              </Pressable>
              <Pressable onPress={goToHistory} style={styles.heroSecondaryButton}>
                <Text style={styles.heroSecondaryButtonText}>Совместные истории</Text>
              </Pressable>
            </View>
          </View>

          {historyCards.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{t("connections.openConnectionsTitle")}</Text>
              <Text style={styles.sectionText}>{t("connections.openConnectionsBody")}</Text>
              {historyCards.map(renderConnectionCard)}
            </View>
          ) : null}

          {fallbackCards.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {tt("connections.fallbackTitle", "Открытые чаты без сохраненной истории")}
              </Text>
              <Text style={styles.sectionText}>
                {tt(
                  "connections.fallbackBody",
                  "Здесь остаются связи, у которых чат уже жив, но полная история совместной сессии еще не подтянулась."
                )}
              </Text>
              {fallbackCards.map(renderConnectionCard)}
            </View>
          ) : null}
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 18,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  heroCard: {
    padding: 20,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(13, 18, 34, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 8,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    marginBottom: 10,
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  heroSecondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  heroPrimaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
  },
  heroPrimaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  sectionText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(19, 24, 45, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 12,
  },
  storyCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(12, 16, 31, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.16)",
    gap: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 4,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 4,
  },
  cardSource: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  signalBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  signalBadgeFresh: {
    backgroundColor: "rgba(255, 78, 138, 0.16)",
    borderColor: "rgba(255, 78, 138, 0.28)",
  },
  signalBadgeRecent: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: theme.colors.borderSubtle,
  },
  signalBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  signalBadgeTextFresh: {
    color: theme.colors.primary,
  },
  signalBadgeTextRecent: {
    color: theme.colors.text,
  },
  cardDate: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  previewText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
  },
  metaPillText: {
    color: theme.colors.pillText,
    fontSize: 12,
    fontWeight: "700",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryCta: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.accent,
  },
  primaryCtaText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  secondaryCta: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  secondaryCtaText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  inlineErrorCard: {
    padding: 16,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(255, 77, 103, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 77, 103, 0.22)",
    gap: 6,
  },
  inlineErrorTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  inlineErrorText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
