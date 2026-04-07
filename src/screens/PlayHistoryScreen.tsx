import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  buildDmChatRouteParams,
  ensureDmThread,
  findDmThreadBySourceSessionId,
  subscribeDmThreads,
  type DmThreadDoc,
} from "@/services/dm";
import {
  getPlayRevealCopy,
  subscribeMyPlayHistory,
  type PlayHistoryItem,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

function formatActivityLabel(activity: string) {
  if (activity === "draw") return "Нарисовали вместе";
  return activity;
}

function formatSourceLabel(activity: string) {
  if (activity === "draw") {
    return "Совместный рисунок, который вы собрали вдвоем";
  }
  return "Совместная сессия";
}

function formatDateTime(value: number) {
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

type HistoryCard = PlayHistoryItem & {
  threadId?: string;
};

export default function PlayHistoryScreen() {
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
  const [history, setHistory] = useState<PlayHistoryItem[]>([]);
  const [threads, setThreads] = useState<DmThreadDoc[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);
  const goToConnections = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Connections" });
  }, [navigation]);
  const handleLoadError = useCallback(() => {
    setError(
      tt(
        "playHistory.errorBody",
        "Не удалось собрать ваши совместные истории. Попробуй еще раз."
      )
    );
  }, [tt]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setHistory([]);
      setHistoryLoaded(true);
      setError(null);
      return;
    }

    setHistoryLoaded(false);
    setError(null);
    const unsubscribe = subscribeMyPlayHistory(
      db,
      uid,
      (next) => {
        if (!alive) return;
        setHistory(next);
        setHistoryLoaded(true);
      },
      () => {
        if (!alive) return;
        handleLoadError();
        setHistoryLoaded(true);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [handleLoadError, reloadKey, uid]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setThreads([]);
      setThreadsLoaded(true);
      return;
    }

    setThreadsLoaded(false);
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
        handleLoadError();
        setThreadsLoaded(true);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [handleLoadError, reloadKey, uid]);

  const cards = useMemo<HistoryCard[]>(
    () =>
      history.map((item) => {
        const thread = findDmThreadBySourceSessionId(threads, item.sessionId);
        return {
          ...item,
          ...(thread?.id ? { threadId: thread.id } : {}),
        };
      }),
    [history, threads]
  );

  const isLoading = !historyLoaded || !threadsLoaded;

  const openDetail = useCallback(
    (sessionId: string) => {
      navigation.navigate("PlaySessionDetail", { sessionId });
    },
    [navigation]
  );

  const openReplay = useCallback(
    (sessionId: string) => {
      navigation.navigate("PlaySessionDetail", { sessionId, focus: "replay" });
    },
    [navigation]
  );

  const openChat = useCallback(
    async (card: HistoryCard) => {
      if (!db || !uid || card.revealOutcome !== "open_open") return;

      setOpeningChatId(card.id);
      try {
        const threadId =
          card.threadId ??
          (await ensureDmThread(db, uid, card.peer.uid, {
            memberNames: {
              [uid]: makeNickname(uid),
              [card.peer.uid]: card.peer.nickname,
            },
            source: "play",
            sourceSessionId: card.sessionId,
            artworkSummary: {
              activity: card.activity,
              strokeCount: card.strokeCount,
            },
          }));

        navigation.navigate(
          "DMChat",
          buildDmChatRouteParams({
            threadId,
            peerId: card.peer.uid,
            peerName: card.peer.nickname,
            backTarget: "sessionDetail",
            backSessionId: card.sessionId,
          })
        );
      } finally {
        setOpeningChatId((prev) => (prev === card.id ? null : prev));
      }
    },
    [navigation, uid]
  );

  const goToStart = useCallback(() => {
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  const renderCard = useCallback(
    (item: HistoryCard) => (
      <Pressable
        key={item.id}
        onPress={() => openDetail(item.sessionId)}
        style={styles.card}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardTopText}>
            <Text style={styles.cardTitle}>{item.peer.nickname}</Text>
            <Text style={styles.cardActivity}>{formatActivityLabel(item.activity)}</Text>
          </View>
          <Text style={styles.cardDate}>{formatDateTime(item.sortAt)}</Text>
        </View>

        <Text style={styles.cardSource}>{formatSourceLabel(item.activity)}</Text>

        <View style={styles.metaGrid}>
          <View style={styles.metaChip}>
            <Ionicons name="brush-outline" size={14} color={theme.colors.accent} />
            <Text style={styles.metaText}>
              {tt("connections.strokeCount", "Штрихов: {count}", {
                count: String(item.strokeCount ?? 0),
              })}
            </Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="sparkles-outline" size={14} color={theme.colors.primary} />
            <Text style={styles.metaText}>{getPlayRevealCopy(item.revealOutcome).shortLabel}</Text>
          </View>
        </View>

        <Text style={styles.cardStatus}>{getPlayRevealCopy(item.revealOutcome).description}</Text>

        <View style={styles.actionsRow}>
          <Pressable onPress={() => openReplay(item.sessionId)} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>
              {tt("connections.openReplay", "Открыть replay")}
            </Text>
          </Pressable>
          {item.revealOutcome === "open_open" ? (
            <Pressable
              onPress={() => void openChat(item)}
              style={styles.primaryButton}
              disabled={openingChatId === item.id}
            >
              <Text style={styles.primaryButtonText}>
                {openingChatId === item.id
                  ? tt("connections.openingChat", "Открываем чат…")
                  : tt("connections.openChat", "Открыть чат")}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    ),
    [openChat, openDetail, openReplay, openingChatId, tt]
  );

  const renderEmpty = () => (
    <View style={styles.centerBlock}>
      <View style={styles.emptyIcon}>
        <Ionicons name="albums-outline" size={34} color={theme.colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>
        {tt("playHistory.emptyTitle", "Общие истории появятся здесь")}
      </Text>
      <Text style={styles.emptyText}>
        {tt(
          "playHistory.emptyBody",
          "После первой совместной сессии здесь появятся ваши общие истории."
        )}
      </Text>
      <Pressable onPress={goToStart} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>
          {tt("playHistory.startCta", "Начать совместную сессию")}
        </Text>
      </Pressable>
    </View>
  );

  const renderError = () => (
    <View style={styles.centerBlock}>
      <View style={styles.emptyIcon}>
        <Ionicons name="cloud-offline-outline" size={34} color={theme.colors.accent} />
      </View>
      <Text style={styles.emptyTitle}>
        {tt("playHistory.errorTitle", "История временно недоступна")}
      </Text>
      <Text style={styles.emptyText}>{error}</Text>
      <Pressable onPress={() => setReloadKey((prev) => prev + 1)} style={styles.primaryButton}>
        <Text style={styles.primaryButtonText}>{tt("common.retry", "Повторить")}</Text>
      </Pressable>
    </View>
  );

  return (
    <ScreenShell
      title={tt("playHistory.title", "Мои совместные истории")}
      background="nightCity"
      overlayOpacity={0.2}
      blurRadius={4}
      showBack
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        goToTogether();
      }}
    >
      {isLoading ? (
        <View style={styles.centerBlock}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.loadingText}>
            {tt("playHistory.loading", "Собираем ваши совместные истории…")}
          </Text>
        </View>
      ) : error ? (
        renderError()
      ) : !cards.length ? (
        renderEmpty()
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.heroCard}>
            <Text style={styles.heroKicker}>
              {tt("playHistory.heroKicker", "Память продукта")}
            </Text>
            <Text style={styles.heroTitle}>
              {tt("playHistory.heroTitle", "Все совместные моменты остаются рядом")}
            </Text>
            <Text style={styles.heroText}>
              {tt(
                "playHistory.heroBody",
                "Здесь живут ваши завершенные сессии: с кем они были, чем закончились и куда можно вернуться дальше."
              )}
            </Text>
            <View style={styles.heroActions}>
              <Pressable onPress={goToStart} style={styles.heroPrimaryButton}>
                <Text style={styles.heroPrimaryButtonText}>Хочу новую совместную сессию</Text>
              </Pressable>
              <Pressable onPress={goToConnections} style={styles.heroSecondaryButton}>
                <Text style={styles.heroSecondaryButtonText}>Лента связей</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {tt("playHistory.sectionTitle", "Завершенные совместные сессии")}
            </Text>
            <Text style={styles.sectionText}>
              {tt(
                "playHistory.sectionBody",
                "Открой replay, посмотри, как закончилась сессия, и вернись в чат там, где он уже доступен."
              )}
            </Text>
            {cards.map(renderCard)}
            <View style={styles.reentryCard}>
              <Text style={styles.reentryTitle}>Готова новая совместная сессия?</Text>
              <Text style={styles.reentryText}>
                История хранит прошлые моменты, а новый круг начинается отсюда без лишнего обхода.
              </Text>
              <View style={styles.reentryActions}>
                <Pressable onPress={goToStart} style={styles.heroPrimaryButton}>
                  <Text style={styles.heroPrimaryButtonText}>Начать новую совместную сессию</Text>
                </Pressable>
                <Pressable onPress={goToTogether} style={styles.heroSecondaryButton}>
                  <Text style={styles.heroSecondaryButtonText}>Вернуться во Вместе</Text>
                </Pressable>
              </View>
            </View>
          </View>
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
  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  loadingText: {
    color: theme.colors.subtext,
    fontSize: 14,
    textAlign: "center",
  },
  heroCard: {
    padding: 20,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(13, 18, 34, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
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
  section: {
    gap: 12,
  },
  reentryCard: {
    marginTop: 6,
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(11, 16, 30, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  reentryTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  reentryText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  reentryActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
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
    backgroundColor: "rgba(19, 24, 45, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTopText: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  cardActivity: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  cardDate: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  cardSource: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  metaText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  cardStatus: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  emptyIcon: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
});
