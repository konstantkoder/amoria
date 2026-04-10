import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import ReplayCanvasWebView from "@/components/play/ReplayCanvasWebView";
import type { SharedCanvasStroke } from "@/components/play/SharedCanvasWebView";
import { auth, db } from "@/config/firebaseConfig";
import { buildDmChatRouteParams, ensureDmThread } from "@/services/dm";
import {
  getPlayActivityLabel,
  getPlayActivityStoryText,
  getPeerFromSession,
  getPlayRevealCopy,
  getPlaySessionPrompt,
  resolvePlayRevealOutcome,
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

function formatDuration(session: PlaySessionDoc | null) {
  if (!session?.startedAt || !session?.endedAt) {
    if (session?.activity === "chain_draw" && session.turnDurationSec && session.maxTurns) {
      const totalSec = session.turnDurationSec * session.maxTurns;
      const minutes = Math.max(Math.round(totalSec / 60), 1);
      return `${minutes} мин`;
    }
    return "7 минут";
  }

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
  const [loadError, setLoadError] = React.useState("");
  const [actionError, setActionError] = React.useState("");
  const [reloadKey, setReloadKey] = React.useState(0);
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
  const startNewSession = React.useCallback(() => {
    navigation.navigate("PlayMatch", { activity: session?.activity ?? "draw" });
  }, [navigation, session?.activity]);
  const goToDetail = React.useCallback(
    (focus?: "replay") => {
      if (!sessionId) return;
      navigation.navigate("PlaySessionDetail", {
        sessionId,
        ...(focus ? { focus } : {}),
      });
    },
    [navigation, sessionId]
  );

  React.useEffect(() => {
    mountedRef.current = true;
    setSession(null);
    setEvents([]);
    setDecision(null);
    setSubmitting(false);
    setReplayOpen(historyMode);
    setOpeningChat(false);
    setLoadError("");
    setActionError("");
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

    const unsubscribeSession = subscribePlaySession(
      db,
      sessionId,
      (next) => {
        if (!mountedRef.current) return;
        setSession(next);
        setLoadingSession(false);
      },
      () => {
        if (!mountedRef.current) return;
        setLoadError("Не удалось собрать итог этой совместной сессии. Попробуй открыть его еще раз.");
        setLoadingSession(false);
      }
    );
    const unsubscribeEvents = subscribePlayEvents(
      db,
      sessionId,
      (next) => {
        if (!mountedRef.current) return;
        setEvents(next);
        setLoadingEvents(false);
      },
      () => {
        if (!mountedRef.current) return;
        setLoadError("Мы не смогли загрузить replay этой сессии целиком. Попробуй еще раз.");
        setLoadingEvents(false);
      }
    );
    return () => {
      mountedRef.current = false;
      unsubscribeSession();
      unsubscribeEvents();
    };
  }, [historyMode, reloadKey, sessionId]);

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

  const revealOutcome = React.useMemo(
    () => (session ? resolvePlayRevealOutcome(session) : "waiting"),
    [session]
  );
  const allOpen = revealOutcome === "open_open";
  const showSoftEnding = revealOutcome === "open_skip" || revealOutcome === "skip_skip";
  const waitingForPeer = Boolean(decision) && revealOutcome === "waiting";
  const durationLabel = formatDuration(session);
  const activityLabel = getPlayActivityLabel(session?.activity ?? "draw", "neutral");
  const showDailyPrompt = session?.activity === "daily_prompt";
  const sessionPrompt = React.useMemo(() => getPlaySessionPrompt(session), [session]);
  const sessionPromptDisplay = sessionPrompt?.text?.trim() || "Тема уточняется";
  const revealCopy = React.useMemo(() => getPlayRevealCopy(revealOutcome), [revealOutcome]);
  const canOpenChat = Boolean(db && session && uid && peer?.uid);
  const hasReplay = replayStrokes.length > 0;
  const outcomeTitle = allOpen
    ? "Открылись оба"
    : showSoftEnding
      ? "Раскрытие остановилось мягко"
      : "Решение еще не завершено";

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
          activity: session.activity,
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
          backTarget: "sessionDetail",
          backSessionId: sessionId,
          })
      );
      if (mountedRef.current) {
        setActionError("");
      }
    })().finally(() => {
      openChatPromiseRef.current = null;
      if (mountedRef.current) {
        setOpeningChat(false);
      }
    });

    openChatPromiseRef.current = task;
    try {
      await task;
    } catch {
      if (mountedRef.current) {
        setActionError("Не удалось открыть чат прямо сейчас. Попробуй еще раз чуть позже.");
      }
    }
  }, [db, navigation, peer?.uid, peerName, session, sessionId, totalStrokeCount, uid]);

  const handleOpenPress = React.useCallback(async () => {
    if (submitting || openingChat) return;

    if (allOpen) {
      await openChat();
      return;
    }

    if (historyMode) return;
    if (!db || !sessionId || !uid || decision) {
      if (mountedRef.current) {
        setActionError("Сейчас не получилось сохранить решение. Вернись назад или попробуй снова.");
      }
      return;
    }
    if (mountedRef.current) {
      setSubmitting(true);
      setDecision("open");
      setActionError("");
    }
    try {
      await submitRevealDecision(db, sessionId, uid, "open");
    } catch {
      if (mountedRef.current) {
        setDecision(null);
        setActionError("Не удалось сохранить выбор. Попробуй еще раз.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [allOpen, db, decision, historyMode, openChat, openingChat, sessionId, submitting, uid]);

  const handleSkipPress = React.useCallback(async () => {
    if (!db || !sessionId || !uid || submitting || decision || openingChat) {
      if (mountedRef.current && !submitting && !openingChat) {
        setActionError("Сейчас не получилось сохранить решение. Попробуй еще раз.");
      }
      return;
    }
    if (mountedRef.current) {
      setSubmitting(true);
      setDecision("skip");
      setActionError("");
    }
    try {
      await submitRevealDecision(db, sessionId, uid, "skip");
    } catch {
      if (mountedRef.current) {
        setDecision(null);
        setActionError("Не удалось сохранить выбор. Попробуй еще раз.");
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [db, decision, openingChat, sessionId, submitting, uid]);

  const primaryDisabled =
    submitting ||
    openingChat ||
    (historyMode ? !allOpen || !canOpenChat : Boolean(decision) && !allOpen);
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
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title="Сессия не найдена"
            body="Не удалось открыть итог без идентификатора совместной сессии."
            primaryAction={{ label: "Вернуться во Вместе", onPress: goToTogether }}
            secondaryAction={{ label: "Назад", onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!db) {
    return (
      <ScreenShell
        title={screenTitle}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title="Итог пока недоступен"
            body="Мы не смогли подключить итог этой сессии прямо сейчас. Вернись назад или попробуй открыть его еще раз позже."
            primaryAction={{ label: "Вернуться во Вместе", onPress: goToTogether }}
            secondaryAction={{ label: "Назад", onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadingSession || loadingEvents) {
    return (
      <ScreenShell
        title={screenTitle}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="sparkles-outline"
            title="Собираем итог"
            body="Еще пара секунд, и здесь появится результат вашей совместной сессии."
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadError) {
    return (
      <ScreenShell
        title={screenTitle}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title="Итог временно недоступен"
            body={loadError}
            primaryAction={{ label: "Повторить", onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: "Назад", onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!session) {
    return (
      <ScreenShell
        title={screenTitle}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="albums-outline"
            title="Итог больше недоступен"
            body="Сессия уже исчезла или не успела сохраниться. Можно вернуться во Вместе и начать новую."
            primaryAction={{ label: "Вернуться во Вместе", onPress: goToTogether }}
            secondaryAction={{ label: "Начать новую совместную сессию", onPress: startNewSession }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={screenTitle}
      background="togetherStory"
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
            {historyMode ? "Совместная история" : "Сразу после совместной сессии"}
          </Text>
          <Text style={styles.heroTitle}>
            {historyMode ? "Ваш общий рисунок" : "Ваш общий рисунок готов"}
          </Text>
          <Text style={styles.heroText}>
            {historyMode
              ? "Здесь хранится завершенный общий рисунок, к которому можно вернуться в любой момент."
              : "Это итог только что завершившейся совместной сессии. Постоянный дом рисунка и replay находится в совместной истории."}{" "}
            {session
              ? getPlayActivityStoryText(session.activity, sessionPrompt?.text)
              : ""}
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
            {showDailyPrompt ? (
              <View style={[styles.metaItem, styles.metaItemWide]}>
                <Text style={styles.metaLabel}>Тема</Text>
                <Text style={styles.metaValue}>{sessionPromptDisplay}</Text>
              </View>
            ) : null}
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
            {historyMode ? outcomeTitle : "Что делать с этой сессией дальше?"}
          </Text>
          <Text style={styles.actionText}>
            {historyMode
              ? revealCopy.description
              : allOpen && !uid
                ? "Открытие уже произошло, но чтобы войти в личный чат, нужен активный аккаунт."
                : allOpen && !canOpenChat
                ? "Открытие уже произошло, но контекст чата пока не готов. Можно открыть историю или попробовать чуть позже."
                : "Если вы оба выберете открыть чат, сессия перейдет в личный контакт. Если нет, рисунок останется только вашей совместной историей."}
          </Text>
          {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

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
                  {openingChat ? "Открываем чат…" : "Хочу открыть чат"}
                </Text>
              </Pressable>

              <Pressable
                disabled={tertiaryDisabled}
                onPress={() => void handleSkipPress()}
                style={[styles.tertiaryButton, tertiaryDisabled && styles.disabledButton]}
              >
                <Text style={styles.tertiaryText}>Оставить как историю</Text>
              </Pressable>
            </>
          )}

          <Pressable
            onPress={() => setReplayOpen((prev) => !prev)}
            style={styles.secondaryButton}
          >
            <Text style={styles.secondaryText}>
              {replayOpen ? "Скрыть replay" : "Показать replay"}
            </Text>
          </Pressable>
        </View>

        <View style={styles.routeCard}>
          <Text style={styles.routeTitle}>
            {historyMode ? "Где живёт эта история" : "Куда эта история перейдёт дальше"}
          </Text>
          <Text style={styles.routeText}>
            {historyMode
              ? "Это промежуточный взгляд на историю. Полная страница истории остаётся главным домом для replay, статуса и возврата в чат."
              : "Итог нужен для решения сразу после сессии. Потом рисунок живёт в совместной истории, а открытая связь продолжается уже в чатах и связях."}
          </Text>
          <View style={styles.routeActions}>
            <Pressable
              onPress={() => goToDetail(replayOpen ? "replay" : undefined)}
              style={styles.routeButtonPrimary}
            >
              <Text style={styles.routeButtonPrimaryText}>Открыть совместную историю</Text>
            </Pressable>
            {allOpen && !historyMode ? (
              <Pressable onPress={goToConnections} style={styles.routeButton}>
                <Text style={styles.routeButtonText}>Связи</Text>
              </Pressable>
            ) : !historyMode ? (
              <Pressable onPress={startNewSession} style={styles.routeButton}>
                <Text style={styles.routeButtonText}>Начать новую совместную сессию</Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {replayOpen ? (
          <View style={styles.replayBlock}>
            <View style={styles.replayHeader}>
              <View>
                <Text style={styles.replayTitle}>Replay рисунка</Text>
                <Text style={styles.replayText}>
                  Штрихи идут в исходном порядке, чтобы можно было заново прожить этот общий момент.
                </Text>
              </View>
            </View>
            {showDailyPrompt ? (
              <View style={styles.contextPill}>
                <Text style={styles.contextLabel}>Тема</Text>
                <Text style={styles.contextText}>{sessionPromptDisplay}</Text>
              </View>
            ) : null}
            {!hasReplay ? (
              <View style={styles.statusCard}>
                <Text style={styles.statusTitle}>Replay пока пустой</Text>
                <Text style={styles.statusText}>
                  Эта сессия сохранилась без штрихов. Итог и статус связи остались, но сам replay здесь недоступен.
                </Text>
              </View>
            ) : null}
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
  metaItemWide: {
    width: "100%",
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
  inlineError: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
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
  routeButtonPrimary: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: theme.colors.primary,
  },
  routeButtonPrimaryText: {
    color: "#fff",
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
  contextPill: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  contextLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  contextText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
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
