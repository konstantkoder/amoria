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

import ScreenShell from "@/components/ScreenShell";
import ReplayCanvasWebView from "@/components/play/ReplayCanvasWebView";
import type { SharedCanvasStroke } from "@/components/play/SharedCanvasWebView";
import { auth, db } from "@/config/firebaseConfig";
import { buildDmChatRouteParams, ensureDmThread } from "@/services/dm";
import {
  getPeerFromSession,
  submitRevealDecision,
  subscribePlayEvents,
  subscribePlaySession,
  type PlayRevealDecision,
  type PlaySessionDoc,
  type PlayStrokeBatch,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

const SESSION_DURATION_SEC = 420;

function formatActivityLabel(activity: string) {
  if (activity === "draw") return "Нарисовать вместе";
  return activity;
}

function formatDuration(session: PlaySessionDoc | null) {
  if (!session?.startedAt || !session?.endedAt) return "7 минут";

  const diffSec = Math.max(Math.round((session.endedAt - session.startedAt) / 1000), 0);
  if (!diffSec) return "7 минут";
  if (diffSec >= SESSION_DURATION_SEC) return "7 минут";

  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  if (!minutes) return `${seconds} сек`;
  if (!seconds) return `${minutes} мин`;
  return `${minutes} мин ${seconds} сек`;
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

export default function PlayResultScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const sessionId = String(route.params?.sessionId ?? "");
  const historyMode = route.params?.mode === "history";
  const uid = auth?.currentUser?.uid ?? "";
  const [session, setSession] = React.useState<PlaySessionDoc | null>(null);
  const [events, setEvents] = React.useState<PlayStrokeBatch[]>([]);
  const [decision, setDecision] = React.useState<PlayRevealDecision | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [replayOpen, setReplayOpen] = React.useState(false);
  const [loadingSession, setLoadingSession] = React.useState(true);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [openingChat, setOpeningChat] = React.useState(false);
  const mountedRef = React.useRef(true);
  const openChatPromiseRef = React.useRef<Promise<void> | null>(null);
  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);
  const goToHistory = React.useCallback(() => {
    navigation.navigate("PlayHistory");
  }, [navigation]);
  const goToConnections = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Connections" });
  }, [navigation]);

  React.useEffect(() => {
    mountedRef.current = true;
    setSession(null);
    setEvents([]);
    setDecision(null);
    setSubmitting(false);
    setReplayOpen(historyMode);
    setOpeningChat(false);
    openChatPromiseRef.current = null;

    if (!db || !sessionId) {
      setLoadingSession(false);
      setLoadingEvents(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoadingSession(true);
    setLoadingEvents(true);

    const unsubscribeSession = subscribePlaySession(db, sessionId, (next) => {
      if (!mountedRef.current) return;
      setSession(next);
      setLoadingSession(false);
    });
    const unsubscribeEvents = subscribePlayEvents(db, sessionId, (next) => {
      if (!mountedRef.current) return;
      setEvents(next);
      setLoadingEvents(false);
    });
    return () => {
      mountedRef.current = false;
      unsubscribeSession();
      unsubscribeEvents();
    };
  }, [historyMode, sessionId]);

  React.useEffect(() => {
    const ownDecision = session?.revealDecisions?.[uid];
    if (!mountedRef.current) return;
    if (ownDecision) {
      setDecision((prev) => (prev === ownDecision ? prev : ownDecision));
      return;
    }
    setDecision(null);
  }, [session?.revealDecisions, uid]);

  const peer = React.useMemo(() => {
    if (!session) return null;
    return getPeerFromSession(session, uid);
  }, [session, uid]);

  const peerName = peer?.nickname ?? makeNickname(peer?.uid ?? "peer");
  const totalStrokeCount = React.useMemo(() => {
    if (session?.resultStrokeCount != null) {
      return session.resultStrokeCount;
    }
    return events.reduce((sum, batch) => sum + batch.strokes.length, 0);
  }, [events, session?.resultStrokeCount]);

  const replayStrokes = React.useMemo(() => mapReplayStrokes(events), [events]);
  const myStrokeCount = React.useMemo(
    () =>
      events.reduce(
        (sum, batch) => sum + (batch.uid === uid ? batch.strokes.length : 0),
        0
      ),
    [events, uid]
  );
  const peerStrokeCount = Math.max(totalStrokeCount - myStrokeCount, 0);

  const revealValues = session?.participantIds.map(
    (participantId) => session.revealDecisions?.[participantId]
  ) ?? [];
  const allDecisionsMade =
    revealValues.length > 0 && revealValues.every((value) => value === "open" || value === "skip");
  const allOpen =
    revealValues.length > 0 && revealValues.every((value) => value === "open");
  const anySkip = revealValues.some((value) => value === "skip");
  const showSoftEnding = allDecisionsMade && anySkip;
  const waitingForPeer = Boolean(decision) && !allDecisionsMade;
  const durationLabel = formatDuration(session);
  const activityLabel = formatActivityLabel(session?.activity ?? "draw");
  const outcomeTitle = allOpen
    ? "Открылись оба"
    : showSoftEnding
      ? "Раскрытие остановилось мягко"
      : "Решение еще не завершено";
  const outcomeText = allOpen
    ? "Эта совместная сессия уже открыла личный контакт. Можно вернуться к replay или сразу продолжить разговор."
    : showSoftEnding
      ? "Хотя бы один участник выбрал пропустить раскрытие. Replay и общий след остаются, а чат не открывается."
      : "Один из ответов еще не сохранен. Replay доступен, а чат появится только после взаимного открытия.";

  const openChat = React.useCallback(async () => {
    if (!db || !session || !uid || !peer?.uid) return;
    if (openChatPromiseRef.current) {
      await openChatPromiseRef.current;
      return;
    }

    const task = (async () => {
      if (mountedRef.current) {
        setOpeningChat(true);
      }

      const threadId = await ensureDmThread(db, uid, peer.uid, {
        memberNames: {
          [uid]: session.participantNicknames?.[uid] ?? makeNickname(uid),
          [peer.uid]: peerName,
        },
        source: "play",
        sourceSessionId: sessionId,
        artworkSummary: {
          activity: "draw",
          strokeCount: totalStrokeCount,
        },
      });

      if (!mountedRef.current) return;
      navigation.navigate(
        "DMChat",
        buildDmChatRouteParams({
          threadId,
          peerId: peer.uid,
          peerName,
          sourceSessionId: sessionId,
          backTarget: historyMode ? "history" : "together",
        })
      );
    })().finally(() => {
      openChatPromiseRef.current = null;
      if (mountedRef.current) {
        setOpeningChat(false);
      }
    });

    openChatPromiseRef.current = task;
    await task;
  }, [db, historyMode, navigation, peer?.uid, peerName, session, sessionId, totalStrokeCount, uid]);

  const handleOpenPress = React.useCallback(async () => {
    if (submitting || openingChat) return;

    if (allOpen) {
      await openChat();
      return;
    }

    if (historyMode) return;
    if (!db || !sessionId || !uid || decision) return;
    if (mountedRef.current) {
      setSubmitting(true);
      setDecision("open");
    }
    try {
      await submitRevealDecision(db, sessionId, uid, "open");
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [allOpen, db, decision, historyMode, openChat, openingChat, sessionId, submitting, uid]);

  const handleSkipPress = React.useCallback(async () => {
    if (!db || !sessionId || !uid || submitting || decision || openingChat) return;
    if (mountedRef.current) {
      setSubmitting(true);
      setDecision("skip");
    }
    try {
      await submitRevealDecision(db, sessionId, uid, "skip");
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [db, decision, openingChat, sessionId, submitting, uid]);

  const primaryDisabled =
    submitting ||
    openingChat ||
    (historyMode ? !allOpen : Boolean(decision) && !allOpen);
  const tertiaryDisabled = submitting || openingChat || Boolean(decision);
  const screenTitle = historyMode ? "Совместная история" : "Итог сессии";
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    if (historyMode) {
      goToHistory();
      return;
    }
    goToTogether();
  };

  if (!sessionId) {
    return (
      <ScreenShell
        title={screenTitle}
        background="nightCity"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <Text style={styles.statusTitle}>Сессия не найдена</Text>
          <Text style={styles.statusText}>
            Не удалось открыть итог без идентификатора совместной сессии.
          </Text>
          <Pressable onPress={goToTogether} style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Вернуться во Вместе</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  if (loadingSession || loadingEvents) {
    return (
      <ScreenShell
        title={screenTitle}
        background="nightCity"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.statusText}>Собираем итог совместной сессии…</Text>
        </View>
      </ScreenShell>
    );
  }

  if (!session) {
    return (
      <ScreenShell
        title={screenTitle}
        background="nightCity"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <Text style={styles.statusTitle}>Итог больше недоступен</Text>
          <Text style={styles.statusText}>
            Сессия уже исчезла или не успела сохраниться. Можно вернуться во Вместе и начать новую.
          </Text>
          <Pressable onPress={goToTogether} style={styles.inlineButton}>
            <Text style={styles.inlineButtonText}>Вернуться во Вместе</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={screenTitle}
      background="nightCity"
      showBack
      onBack={handleBack}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>
            {historyMode ? "Совместная история" : "Итог совместной сессии"}
          </Text>
          <Text style={styles.heroTitle}>{historyMode ? "Ваш общий рисунок" : "Рисунок готов"}</Text>
          <Text style={styles.heroText}>
            {historyMode
              ? "Здесь хранится завершенный общий рисунок, к которому можно вернуться в любой момент."
              : "Вы собрали один общий холст из отдельных жестов, темпа и импровизации."}
          </Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Активность</Text>
              <Text style={styles.metaValue}>{activityLabel}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Напарник</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Штрихов</Text>
              <Text style={styles.metaValue}>{totalStrokeCount}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>Длительность</Text>
              <Text style={styles.metaValue}>{durationLabel}</Text>
            </View>
          </View>

          <View style={styles.legendRow}>
            <View style={styles.legendPill}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.primary }]} />
              <Text style={styles.legendText}>Твои штрихи: {myStrokeCount}</Text>
            </View>
            <View style={styles.legendPill}>
              <View style={[styles.legendDot, { backgroundColor: theme.colors.accent }]} />
              <Text style={styles.legendText}>Штрихи напарника: {peerStrokeCount}</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>
            {historyMode ? outcomeTitle : "Что делаем дальше?"}
          </Text>
          <Text style={styles.actionText}>
            {historyMode
              ? outcomeText
              : "Если оба выберут открыть, появится приватный чат и раскроются профили."}
          </Text>

          {historyMode ? (
            allOpen ? (
              <Pressable
                disabled={primaryDisabled}
                onPress={() => void handleOpenPress()}
                style={[styles.primaryButton, primaryDisabled && styles.disabledButton]}
              >
                <Text style={styles.primaryText}>
                  {openingChat ? "Открываем чат…" : "Открыть чат"}
                </Text>
              </Pressable>
            ) : null
          ) : (
            <>
              <Pressable
                disabled={primaryDisabled}
                onPress={() => void handleOpenPress()}
                style={[styles.primaryButton, primaryDisabled && styles.disabledButton]}
              >
                <Text style={styles.primaryText}>
                  {openingChat ? "Открываем чат…" : "Открыть чат и профили"}
                </Text>
              </Pressable>

              <Pressable
                disabled={tertiaryDisabled}
                onPress={() => void handleSkipPress()}
                style={[styles.tertiaryButton, tertiaryDisabled && styles.disabledButton]}
              >
                <Text style={styles.tertiaryText}>Пропустить</Text>
              </Pressable>
            </>
          )}

          <Pressable
            onPress={() => setReplayOpen((prev) => !prev)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>
              {replayOpen ? "Скрыть replay" : "Открыть replay"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.routeCard}>
          <Text style={styles.routeTitle}>
            {historyMode ? "Куда дальше" : "Что можно сделать после сессии"}
          </Text>
          <Text style={styles.routeText}>
            {historyMode
              ? "История хранит совместные моменты, а связи и чаты продолжают уже открытый контакт."
              : "Итог завершает конкретную сессию, а дальше можно перейти в историю, в ленту связей или снова начать во Вместе."}
          </Text>
          <View style={styles.routeActions}>
            {!historyMode ? (
              <Pressable onPress={goToHistory} style={styles.routeButton}>
                <Text style={styles.routeButtonText}>Открыть историю</Text>
              </Pressable>
            ) : null}
            {allOpen ? (
              <Pressable onPress={goToConnections} style={styles.routeButton}>
                <Text style={styles.routeButtonText}>Лента связей</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={goToTogether} style={styles.routeButton}>
              <Text style={styles.routeButtonText}>Вернуться во Вместе</Text>
            </Pressable>
          </View>
        </View>

        {replayOpen ? (
          <View style={styles.replayBlock}>
            <View style={styles.replayHeader}>
              <View>
                <Text style={styles.replayTitle}>Replay рисунка</Text>
                <Text style={styles.replayText}>
                  Проигрываем штрихи в исходном порядке без отдельного экрана.
                </Text>
              </View>
            </View>
            <ReplayCanvasWebView
              strokes={replayStrokes}
              autoplay
              speed={1.25}
              showControls
            />
          </View>
        ) : null}

        {waitingForPeer ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Ждем второго участника</Text>
            <Text style={styles.statusText}>
              Твое решение уже сохранено. Итог останется здесь, а чат откроется только после второго
              согласия.
            </Text>
          </View>
        ) : null}

        {allOpen ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Вы оба выбрали открыть</Text>
            <Text style={styles.statusText}>
              Приватный чат готов. Когда захочешь, открой его через главную кнопку выше.
            </Text>
          </View>
        ) : null}

        {showSoftEnding ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Сессия завершена мягко</Text>
            <Text style={styles.statusText}>
              Кто-то выбрал пропустить раскрытие. Рисунок и replay остаются с вами, но чат не
              откроется.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  inlineButton: {
    marginTop: 4,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
  },
  inlineButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 20,
    backgroundColor: "rgba(20, 18, 35, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    gap: 14,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 28,
    fontWeight: "900",
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 15,
    lineHeight: 22,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaItem: {
    width: "47%",
    minWidth: 140,
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  metaLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 5,
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  legendRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  actionCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(24, 24, 40, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  actionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  actionText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
    alignItems: "center",
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  tertiaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  tertiaryText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  replayBlock: {
    gap: 10,
  },
  routeCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(17, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  routeTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  routeText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  routeActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  routeButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  routeButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  replayHeader: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(18, 14, 30, 0.86)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  replayTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 6,
  },
  replayText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  disabledButton: {
    opacity: 0.6,
  },
  statusCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: theme.colors.cardElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  statusText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
