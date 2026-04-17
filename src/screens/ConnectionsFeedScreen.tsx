import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
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
  getPlayColorMoodCombinedPalette,
  getPlayActivityLabel,
  getPeerFromSession,
  getPlaySessionPrompt,
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
  continuationLabel: string;
  sharedMomentText: string;
  freshnessLabel: string;
  resultLabel: string;
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
  if (activity === "daily_prompt") {
    return tt("connections.sourceDailyPrompt", getPlayActivityLabel(activity, "history"));
  }
  if (activity === "color_mood") {
    return tt("connections.sourceColorMood", getPlayActivityLabel(activity, "history"));
  }
  return getPlayActivityLabel(activity, "history");
}

function buildSessionResultLabel(
  session: PlaySessionDoc,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  if (session.activity === "color_mood") {
    const paletteCount = getPlayColorMoodCombinedPalette(session).length;
    return paletteCount
      ? tt("connections.sharedPaletteCount", "Общая палитра: {count} цветов", {
          count: String(paletteCount),
        })
      : tt("connections.sharedPaletteReady", "Общая палитра уже собрана");
  }

  if (session.resultStrokeCount != null) {
    return tt("connections.sharedStrokeCount", "Общий итог: {count} штрихов", {
      count: String(session.resultStrokeCount),
    });
  }

  const prompt = getPlaySessionPrompt(session);
  if (session.activity === "daily_prompt" && prompt?.text?.trim()) {
    return tt("connections.sharedPrompt", "Тема: «{prompt}»", {
      prompt: prompt.text.trim(),
    });
  }

  return tt("connections.sharedResultReady", "Общий результат уже сохранён");
}

function buildSessionSharedMomentText(
  session: PlaySessionDoc,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  const prompt = getPlaySessionPrompt(session);

  switch (session.activity) {
    case "chain_draw":
      return tt(
        "connections.sharedMomentChainDraw",
        "Вы собрали один рисунок по очереди, и именно эта совместная сессия открыла между вами связь."
      );
    case "daily_prompt":
      return prompt?.text?.trim()
        ? tt(
            "connections.sharedMomentDailyPromptWithTopic",
            "Вы вместе ответили на тему «{prompt}», и этот общий рисунок стал началом связи.",
            { prompt: prompt.text.trim() }
          )
        : tt(
            "connections.sharedMomentDailyPrompt",
            "Вы вместе ответили рисунком на общую тему дня, и этот момент стал началом связи."
          );
    case "color_mood":
      return tt(
        "connections.sharedMomentColorMood",
        "Вы собрали общую палитру настроения, и этот мягкий общий итог стал точкой входа в связь."
      );
    case "draw":
    default:
      return tt(
        "connections.sharedMomentDraw",
        "Вы собрали один общий рисунок на двоих, и именно после него между вами открылась связь."
      );
  }
}

function buildFallbackResultLabel(
  thread: DmThreadDoc,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  if (thread.artworkSummary?.activity === "color_mood") {
    return tt("connections.sharedPaletteReady", "Общая палитра уже собрана");
  }

  if (thread.artworkSummary?.strokeCount != null) {
    return tt("connections.sharedStrokeCount", "Общий итог: {count} штрихов", {
      count: String(thread.artworkSummary.strokeCount),
    });
  }

  return tt("connections.sharedResultReady", "Общий результат уже сохранён");
}

function buildFallbackSharedMomentText(
  thread: DmThreadDoc,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  switch (thread.artworkSummary?.activity) {
    case "chain_draw":
      return tt(
        "connections.fallbackSharedMomentChainDraw",
        "Эта связь уже выросла из рисунка по очереди, даже если полная страница общей истории ещё не подтянулась."
      );
    case "daily_prompt":
      return tt(
        "connections.fallbackSharedMomentDailyPrompt",
        "Эта связь уже выросла из вашего общего ответа на тему дня, а подробная история подтянется чуть позже."
      );
    case "color_mood":
      return tt(
        "connections.fallbackSharedMomentColorMood",
        "Эта связь уже выросла из общей палитры настроения, а полный контекст истории ещё догружается."
      );
    case "draw":
      return tt(
        "connections.fallbackSharedMomentDraw",
        "Эта связь уже выросла из общего рисунка, даже если полная страница истории ещё не появилась здесь."
      );
    default:
      return tt(
        "connections.fallbackSharedMomentDefault",
        "Эта связь уже выросла из общего опыта. Полная страница истории подтянется чуть позже."
      );
  }
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
  const hasContinuationPreview = Boolean(linkedThread?.lastMessageText?.trim());

  return {
    id: session.id,
    sessionId: session.id,
    ...(linkedThread ? { threadId: linkedThread.id } : {}),
    peerId: peer.uid,
    peerName: peer.nickname,
    activityLabel: formatActivityLabel(session.activity, t, tt),
    previewText:
      linkedThread?.lastMessageText?.trim() ||
      tt(
        "connections.connectionPreviewFallbackCoreLoop",
        "Личный разговор уже готов продолжить этот общий момент, даже если сообщений там ещё не было."
      ),
    continuationLabel: hasContinuationPreview
      ? tt("connections.chatContinuationLabel", "Что уже происходит в разговоре")
      : tt("connections.chatReadyLabel", "Что уже открыто в разговоре"),
    sharedMomentText: buildSessionSharedMomentText(session, tt),
    freshnessLabel: formatFreshness(sortAt, now, t),
    resultLabel: buildSessionResultLabel(session, tt),
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
  const hasContinuationPreview = Boolean(thread.lastMessageText?.trim());
  return {
    id: thread.id,
    threadId: thread.id,
    peerId: peer.uid,
    peerName: peer.name,
    activityLabel:
      thread.source === "play"
        ? formatActivityLabel(thread.artworkSummary?.activity ?? "draw", t, tt)
        : t("connections.sourceOpened"),
    previewText:
      thread.lastMessageText?.trim() ||
      tt(
        "connections.fallbackPreviewFallback",
        "Личный разговор уже живёт дальше, а страница общей истории ещё не успела прикрепиться."
      ),
    continuationLabel: hasContinuationPreview
      ? tt("connections.chatContinuationLabel", "Что уже происходит в разговоре")
      : tt("connections.chatReadyLabel", "Что уже открыто в разговоре"),
    sharedMomentText: buildFallbackSharedMomentText(thread, tt),
    freshnessLabel: formatFreshness(sortAt, now, t),
    resultLabel: buildFallbackResultLabel(thread, tt),
    sortAt,
    isFallback: true,
    ...(signalLabel ? { signalLabel, signalTone } : {}),
  };
}

export default function ConnectionsFeedScreen() {
  const navigation = useNavigation<RootStackNavigationProp>();
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
        setActionError(
          tt(
            "connections.storyMissingBody",
            "We couldn't find the source shared story for this conversation. Try opening the connection later."
          )
        );
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
        setActionError(
          tt(
            "connections.openChatFailed",
            "We couldn't open the conversation right now. Try again a bit later."
          )
        );
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
  const renderHeroCard = (showActions: boolean) => (
    <View style={styles.heroCard}>
      <Text style={styles.heroKicker}>
        {tt("connections.coreLoopKicker", "После Together")}
      </Text>
      <Text style={styles.heroTitle}>
        {tt(
          "connections.coreLoopTitle",
          "Здесь живут связи, у которых уже есть общая история"
        )}
      </Text>
      <Text style={styles.heroText}>
        {tt(
          "connections.coreLoopBody",
          "Это не новая лента и не каталог людей. Каждая связь здесь уже выросла из конкретной совместной сессии: можно вернуться в историю, открыть личный разговор или снова уйти во Вместе."
        )}
      </Text>
      {showActions ? (
        <View style={styles.heroActions}>
          <Pressable onPress={goToTogether} style={styles.heroPrimaryButton}>
            <Text style={styles.heroPrimaryButtonText}>
              {tt("connections.returnToTogether", "Вернуться во Вместе")}
            </Text>
          </Pressable>
          <Pressable onPress={goToHistory} style={styles.heroSecondaryButton}>
            <Text style={styles.heroSecondaryButtonText}>
              {tt("connections.openStories", "Общие истории")}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const renderEmptyState = () => (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {renderHeroCard(false)}

      <View style={styles.emptyStateCard}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="git-network-outline" size={22} color={theme.colors.accent} />
        </View>
        <Text style={styles.emptyStateTitle}>
          {tt(
            "connections.emptyTitleCoreLoop",
            "Здесь появятся связи, у которых уже есть общая история"
          )}
        </Text>
        <Text style={styles.emptyStateText}>
          {tt(
            "connections.emptyBodyCoreLoop",
            "Когда общий результат во Вместе действительно откроет контакт, связь появится здесь вместе со своей историей и входом в личный разговор."
          )}
        </Text>
        <View style={styles.emptyMetaRow}>
          <View style={styles.emptyMetaPill}>
            <Text style={styles.emptyMetaText}>
              {tt("connections.emptyMetaContext", "Общий результат")}
            </Text>
          </View>
          <View style={styles.emptyMetaPill}>
            <Text style={styles.emptyMetaText}>
              {tt("connections.emptyMetaChat", "Личное продолжение")}
            </Text>
          </View>
        </View>
        <Pressable onPress={goToTogether} style={styles.emptyPrimaryButton}>
          <Text style={styles.emptyPrimaryButtonText}>
            {tt("connections.returnToTogether", "Вернуться во Вместе")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate("PlayMatch", { activity: "draw" })}
          style={styles.emptySecondaryButton}
        >
          <Text style={styles.emptySecondaryButtonText}>
            {tt("connections.startNewSession", "Начать новую совместную сессию")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );

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

        <View style={styles.contextBlock}>
          <Text style={styles.contextLabel}>
            {tt("connections.sharedMomentLabel", "Что уже произошло между вами")}
          </Text>
          <Text style={styles.contextText}>{card.sharedMomentText}</Text>
        </View>

        <View style={styles.contextBlock}>
          <Text style={styles.contextLabel}>{card.continuationLabel}</Text>
          <Text style={styles.previewText} numberOfLines={2}>
            {card.previewText}
          </Text>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>{card.resultLabel}</Text>
          </View>
          <View style={styles.metaPill}>
            <Text style={styles.metaPillText}>
              {card.isFallback
                ? tt("connections.chatAlreadyLive", "Личный разговор уже живёт как продолжение")
                : tt("connections.sharedStoryAndChat", "Связь уже держится на этой общей истории")}
            </Text>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {!card.isFallback && card.sessionId ? (
            <Pressable onPress={() => openDetail(card.sessionId!)} style={styles.secondaryCta}>
              <Text style={styles.secondaryCtaText}>
                {tt("connections.openStory", "Вернуться к общей истории")}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => void openChat(card)}
            style={styles.primaryCta}
            disabled={openingCardId === card.id}
          >
            <Text style={styles.primaryCtaText}>
              {openingCardId === card.id
                ? tt("connections.openingChat", "Открываем разговор…")
                : card.threadId
                  ? tt("connections.continueInChat", "Продолжить разговор")
                  : tt("connections.openPrivateChat", "Открыть разговор")}
            </Text>
          </Pressable>
        </View>
      </View>
    ),
    [openChat, openDetail, openingCardId, tt]
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
            title={tt("connections.authRequiredTitle", "Войдите, чтобы увидеть свои связи")}
            body={tt(
              "connections.authRequiredBodyCoreLoop",
              "После входа здесь будут собираться связи, которые уже выросли из ваших совместных сессий во Вместе."
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
        title={t("tabs.connections")}
        background="togetherStory"
      >
        <View style={styles.emptyWrap}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("connections.errorTitle", "Connections are temporarily unavailable")}
            body={tt(
              "connections.offlineBodyCoreLoop",
              "Сейчас не получается собрать связи и их общие истории. Попробуй позже или вернись во Вместе."
            )}
            primaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
            secondaryAction={{
              label: tt("connections.openStories", "Shared stories"),
              onPress: goToHistory,
            }}
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
        renderEmptyState()
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {actionError ? (
            <View style={styles.inlineErrorCard}>
              <Text style={styles.inlineErrorTitle}>
                {tt("connections.inlineErrorTitle", "Личный чат пока не прикрепился")}
              </Text>
              <Text style={styles.inlineErrorText}>{actionError}</Text>
            </View>
          ) : null}

          {renderHeroCard(true)}

          {historyCards.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {tt("connections.openConnectionsTitleCoreLoop", "Связи с уже прожитым общим контекстом")}
              </Text>
              <Text style={styles.sectionText}>
                {tt(
                  "connections.openConnectionsBodyCoreLoop",
                  "Каждая связь здесь уже привязана к конкретной совместной сессии, её результату и следующему личному шагу между вами."
                )}
              </Text>
              {historyCards.map(renderConnectionCard)}
            </View>
          ) : null}

          {fallbackCards.length ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>
                {tt("connections.fallbackTitleCoreLoop", "Связи, где чат уже продолжает историю")}
              </Text>
              <Text style={styles.sectionText}>
                {tt(
                  "connections.fallbackBodyCoreLoop",
                  "Личный чат здесь уже живёт как продолжение общего момента, даже если полная страница истории ещё не успела прикрепиться."
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
    padding: 14,
    paddingBottom: 32,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 28,
  },
  heroCard: {
    padding: 15,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(13, 18, 34, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 7,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  heroActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  heroSecondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
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
    paddingVertical: 9,
    backgroundColor: theme.colors.primary,
  },
  heroPrimaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  sectionText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
  card: {
    borderRadius: theme.shapes.card,
    padding: 15,
    backgroundColor: "rgba(19, 24, 45, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    gap: 10,
  },
  storyCard: {
    borderRadius: theme.shapes.card,
    padding: 15,
    backgroundColor: "rgba(12, 16, 31, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.16)",
    gap: 10,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 3,
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
    fontSize: 12,
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
  contextBlock: {
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  contextLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  contextText: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 19,
  },
  previewText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
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
    gap: 8,
  },
  primaryCta: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 9,
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
    paddingVertical: 9,
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
  emptyStateCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
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
  emptyMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  emptyMetaPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  emptyMetaText: {
    color: theme.colors.pillText,
    fontSize: 12,
    fontWeight: "700",
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
