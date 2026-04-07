import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import ScreenShell from "@/components/ScreenShell";
import ReplayCanvasWebView from "@/components/play/ReplayCanvasWebView";
import type { SharedCanvasStroke } from "@/components/play/SharedCanvasWebView";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import { markPlaySessionSeen } from "@/services/activityFreshness";
import {
  buildDmChatRouteParams,
  findDmThreadBySourceSessionId,
  subscribeDmThreads,
  type DmThreadDoc,
} from "@/services/dm";
import {
  getPeerFromSession,
  getPlayRevealCopy,
  resolvePlayRevealOutcome,
  subscribePlayEvents,
  subscribePlaySession,
  type PlaySessionDoc,
  type PlayStrokeBatch,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

function formatActivityLabel(activity: string) {
  if (activity === "draw") return "Нарисовали вместе";
  return activity;
}

function formatSourceLabel(activity: string) {
  if (activity === "draw") {
    return "Совместный рисунок, который остался в вашей общей истории.";
  }
  return "Совместная история";
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

function mapReplayStrokes(events: PlayStrokeBatch[]): SharedCanvasStroke[] {
  return events.flatMap((batch) =>
    batch.strokes.map((stroke) => ({
      id: stroke.id,
      uid: batch.uid,
      color: stroke.color,
      width: stroke.width,
      points: stroke.points.map((point) => ({
        x: point.x,
        y: point.y,
      })),
    }))
  );
}

export default function PlaySessionDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const sessionId = String(route.params?.sessionId ?? "");
  const replayFocus = route.params?.focus === "replay";
  const uid = auth?.currentUser?.uid ?? "";

  const [session, setSession] = React.useState<PlaySessionDoc | null>(null);
  const [events, setEvents] = React.useState<PlayStrokeBatch[]>([]);
  const [threads, setThreads] = React.useState<DmThreadDoc[]>([]);
  const [loadingSession, setLoadingSession] = React.useState(true);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [loadingThreads, setLoadingThreads] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [threadLookupError, setThreadLookupError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [replayOpen, setReplayOpen] = React.useState(replayFocus);
  const mountedRef = React.useRef(true);

  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const goToHistory = React.useCallback(() => {
    navigation.navigate("PlayHistory");
  }, [navigation]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("PlayHistory");
  }, [navigation]);

  React.useEffect(() => {
    mountedRef.current = true;
    setSession(null);
    setEvents([]);
    setThreads([]);
    setReplayOpen(replayFocus);
    setLoadError(null);
    setThreadLookupError(null);

    if (!db || !sessionId) {
      setLoadingSession(false);
      setLoadingEvents(false);
      setLoadingThreads(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoadingSession(true);
    setLoadingEvents(true);
    setLoadingThreads(Boolean(uid));
    const sessionLoadError = () => {
      if (!mountedRef.current) return;
      setLoadError(
        tt(
          "playDetail.errorBody",
          "Не удалось открыть эту совместную историю прямо сейчас. Попробуй еще раз."
        )
      );
      setLoadingSession(false);
    };
    const eventsLoadError = () => {
      if (!mountedRef.current) return;
      setLoadError(
        tt(
          "playDetail.errorBody",
          "Не удалось открыть эту совместную историю прямо сейчас. Попробуй еще раз."
        )
      );
      setLoadingEvents(false);
    };

    const unsubscribeSession = subscribePlaySession(
      db,
      sessionId,
      (next) => {
        if (!mountedRef.current) return;
        setSession(next);
        setLoadingSession(false);
      },
      sessionLoadError
    );
    const unsubscribeEvents = subscribePlayEvents(
      db,
      sessionId,
      (next) => {
        if (!mountedRef.current) return;
        setEvents(next);
        setLoadingEvents(false);
      },
      eventsLoadError
    );
    const unsubscribeThreads =
      uid && db
        ? subscribeDmThreads(
            db,
            uid,
            (next) => {
              if (!mountedRef.current) return;
              setThreads(next);
              setLoadingThreads(false);
              setThreadLookupError(null);
            },
            () => {
              if (!mountedRef.current) return;
              setThreads([]);
              setLoadingThreads(false);
              setThreadLookupError(
                tt(
                  "playDetail.chatLookupError",
                  "Не удалось проверить, готов ли чат. Попробуй открыть страницу еще раз."
                )
              );
            }
          )
        : () => {};

    return () => {
      mountedRef.current = false;
      unsubscribeSession();
      unsubscribeEvents();
      unsubscribeThreads();
    };
  }, [replayFocus, reloadKey, sessionId, tt, uid]);

  React.useEffect(() => {
    if (!sessionId) return;
    void markPlaySessionSeen(sessionId);
  }, [sessionId]);

  const peer = React.useMemo(() => {
    if (!session) return null;
    return getPeerFromSession(session, uid);
  }, [session, uid]);

  const peerName = peer?.nickname ?? makeNickname(peer?.uid ?? "peer");
  const detailThread = React.useMemo(
    () => findDmThreadBySourceSessionId(threads, sessionId),
    [sessionId, threads]
  );
  const totalStrokeCount = React.useMemo(() => {
    if (session?.resultStrokeCount != null) {
      return session.resultStrokeCount;
    }
    return events.reduce((sum, batch) => sum + batch.strokes.length, 0);
  }, [events, session?.resultStrokeCount]);
  const replayStrokes = React.useMemo(() => mapReplayStrokes(events), [events]);
  const revealOutcome = React.useMemo(
    () => (session ? resolvePlayRevealOutcome(session) : "waiting"),
    [session]
  );
  const revealCopy = React.useMemo(() => getPlayRevealCopy(revealOutcome), [revealOutcome]);
  const canOpenChat = revealOutcome === "open_open" && Boolean(detailThread?.id);
  const isLoading = loadingSession || loadingEvents || loadingThreads;
  const sortAt = session?.endedAt ?? session?.startedAt ?? session?.createdAt ?? 0;

  const openChat = React.useCallback(() => {
    if (!detailThread?.id || !peer?.uid) return;
    navigation.navigate(
      "DMChat",
      buildDmChatRouteParams({
        threadId: detailThread.id,
        peerId: peer.uid,
        peerName,
        backTarget: "sessionDetail",
        backSessionId: sessionId,
      })
    );
  }, [detailThread?.id, navigation, peer?.uid, peerName, sessionId]);

  const startNewSession = React.useCallback(() => {
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  const openReplay = React.useCallback(() => {
    setReplayOpen((prev) => !prev);
  }, []);

  if (!sessionId) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="nightCity"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>
            {tt("playDetail.missingTitle", "История не найдена")}
          </Text>
          <Text style={styles.stateText}>
            {tt(
              "playDetail.missingBody",
              "Не удалось открыть страницу истории без идентификатора совместной сессии."
            )}
          </Text>
          <Pressable onPress={goToHistory} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>
              {tt("playDetail.goToHistory", "Вернуться к историям")}
            </Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  if (isLoading) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="nightCity"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.stateText}>
            {tt("playDetail.loading", "Собираем страницу вашей совместной истории…")}
          </Text>
        </View>
      </ScreenShell>
    );
  }

  if (loadError) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="nightCity"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <View style={styles.stateIcon}>
            <Ionicons name="cloud-offline-outline" size={34} color={theme.colors.accent} />
          </View>
          <Text style={styles.stateTitle}>
            {tt("playDetail.errorTitle", "История временно недоступна")}
          </Text>
          <Text style={styles.stateText}>{loadError}</Text>
          <Pressable onPress={() => setReloadKey((prev) => prev + 1)} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{tt("common.retry", "Повторить")}</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  if (!session) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="nightCity"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <Text style={styles.stateTitle}>
            {tt("playDetail.notFoundTitle", "Эта история больше недоступна")}
          </Text>
          <Text style={styles.stateText}>
            {tt(
              "playDetail.notFoundBody",
              "Документ совместной сессии не найден. Можно вернуться к общим историям или начать новую сессию."
            )}
          </Text>
          <View style={styles.centerActions}>
            <Pressable onPress={goToHistory} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {tt("playDetail.goToHistory", "Вернуться к историям")}
              </Text>
            </Pressable>
            <Pressable onPress={goToTogether} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {tt("playDetail.goToTogether", "Вернуться во Вместе")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={tt("playDetail.title", "Совместная история")}
      background="nightCity"
      showBack
      onBack={handleBack}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>
            {tt("playDetail.heroKicker", "Страница вашей совместной истории")}
          </Text>
          <Text style={styles.heroTitle}>{peerName}</Text>
          <Text style={styles.heroText}>{formatSourceLabel(session.activity)}</Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.activity", "Активность")}</Text>
              <Text style={styles.metaValue}>{formatActivityLabel(session.activity)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner", "Второй участник")}</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.date", "Дата")}</Text>
              <Text style={styles.metaValue}>{formatDateTime(sortAt)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.strokes", "Штрихов")}</Text>
              <Text style={styles.metaValue}>{String(totalStrokeCount)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.statusKicker}>{tt("playDetail.revealKicker", "Как закончилась сессия")}</Text>
          <Text style={styles.statusTitle}>{revealCopy.shortLabel}</Text>
          <Text style={styles.statusText}>{revealCopy.description}</Text>
        </View>

        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>{tt("playDetail.chatTitle", "Что можно сделать дальше")}</Text>
          {canOpenChat ? (
            <>
              <Text style={styles.actionText}>
                {tt(
                  "playDetail.chatReady",
                  "Личный чат уже открыт. Можно вернуться в разговор в любой момент."
                )}
              </Text>
              <Pressable onPress={openChat} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>
                  {tt("connections.openChat", "Открыть чат")}
                </Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.actionText}>
              {threadLookupError
                ? threadLookupError
                : revealOutcome === "open_open"
                  ? tt(
                      "playDetail.chatPending",
                      "Открытие состоялось, но чат еще не найден в этой истории. Попробуй зайти сюда чуть позже."
                    )
                  : tt(
                      "playDetail.chatUnavailable",
                      "Чат появится только там, где совместная сессия действительно открылась в личный контакт."
                    )}
            </Text>
          )}
          <View style={styles.actionRow}>
            <Pressable onPress={startNewSession} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {tt("playDetail.startNew", "Начать новую совместную сессию")}
              </Text>
            </Pressable>
            <Pressable onPress={goToHistory} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Открыть другие истории</Text>
            </Pressable>
            <Pressable onPress={goToTogether} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Вернуться во Вместе</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.replayBlock}>
          <View style={styles.replayHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.replayTitle}>{tt("playDetail.replayTitle", "Replay рисунка")}</Text>
              <Text style={styles.replayText}>
                {tt(
                  "playDetail.replayBody",
                  "Здесь можно заново пройти весь рисунок по штрихам и вернуться к моменту, который вы собрали вдвоем."
                )}
              </Text>
            </View>
            <Pressable onPress={openReplay} style={styles.replayToggle}>
              <Text style={styles.replayToggleText}>
                {replayOpen
                  ? tt("playDetail.hideReplay", "Скрыть replay")
                  : tt("playDetail.openReplay", "Открыть replay")}
              </Text>
            </Pressable>
          </View>

          {replayOpen ? (
            <ReplayCanvasWebView
              key={`${sessionId}_${replayStrokes.length}`}
              strokes={replayStrokes}
              autoplay
              speed={1.25}
              showControls
            />
          ) : null}
        </View>
      </ScrollView>
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
    gap: 14,
    paddingHorizontal: 28,
  },
  stateIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
  },
  stateTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  stateText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  centerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  heroCard: {
    padding: 20,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(13, 18, 34, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "800",
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    minWidth: "46%",
    flexGrow: 1,
    padding: 14,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  metaLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  statusCard: {
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(19, 24, 45, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  statusKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  statusText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  actionCard: {
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(11, 16, 30, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  actionTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
  },
  actionText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  primaryButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 11,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  replayBlock: {
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(10, 14, 26, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 14,
  },
  replayHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  replayTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 4,
  },
  replayText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  replayToggle: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  replayToggleText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
});
