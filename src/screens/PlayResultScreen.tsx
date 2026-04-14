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
import PlayModeContextCard from "@/components/play/PlayModeContextCard";
import ReplayCanvasWebView from "@/components/play/ReplayCanvasWebView";
import type { SharedCanvasStroke } from "@/components/play/SharedCanvasWebView";
import { auth, db } from "@/config/firebaseConfig";
import {
  type PlayResultRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { buildDmChatRouteParams, ensureDmThread } from "@/services/dm";
import {
  getPlayActivityLabel,
  getPlayActivityMetricLabel,
  getPlayActivityStoryText,
  getPlayColorMoodChoices,
  getPlayColorMoodCombinedPalette,
  getPeerFromSession,
  getPlayRevealCopy,
  getPlayReplayCopy,
  getPlayResultModeCopy,
  getPlaySessionPrompt,
  playActivityUsesReplay,
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
  const navigation = useNavigation<RootStackNavigationProp<"PlayResult">>();
  const route = useRoute<PlayResultRouteProp>();
  const sessionId = route.params.sessionId.trim();
  const historyMode = route.params.mode === "history";
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
  const activityHasReplay = playActivityUsesReplay(session?.activity ?? "draw");
  const sessionPrompt = React.useMemo(() => getPlaySessionPrompt(session), [session]);
  const sessionPromptDisplay = sessionPrompt?.text?.trim() || "Тема уточняется";
  const combinedPalette = React.useMemo(() => getPlayColorMoodCombinedPalette(session), [session]);
  const ownPalette = React.useMemo(() => getPlayColorMoodChoices(session, uid), [session, uid]);
  const peerPalette = React.useMemo(
    () => getPlayColorMoodChoices(session, peer?.uid ?? ""),
    [peer?.uid, session]
  );
  const revealCopy = React.useMemo(() => getPlayRevealCopy(revealOutcome), [revealOutcome]);
  const resultModeCopy = React.useMemo(
    () =>
      getPlayResultModeCopy(session?.activity ?? "draw", {
        historyMode,
        promptText: sessionPrompt?.text,
      }),
    [historyMode, session?.activity, sessionPrompt?.text]
  );
  const replayCopy = React.useMemo(
    () => getPlayReplayCopy(session?.activity ?? "draw"),
    [session?.activity]
  );
  const metricLabel = React.useMemo(
    () => getPlayActivityMetricLabel(session?.activity ?? "draw", "result"),
    [session?.activity]
  );
  const metricValue =
    session?.activity === "color_mood"
      ? combinedPalette.length || ownPalette.length || peerPalette.length
      : totalStrokeCount;
  const archiveArtifactLabel = session?.activity === "color_mood" ? "палитра" : "рисунок";
  const canOpenChat = Boolean(db && session && uid && peer?.uid);
  const hasReplay = replayStrokes.length > 0;
  const summaryItems = React.useMemo(
    () => [
      { label: "Режим", value: activityLabel },
      { label: "Вместе", value: peerName },
      { label: metricLabel, value: String(metricValue) },
      { label: "Время", value: durationLabel },
    ],
    [activityLabel, durationLabel, metricLabel, metricValue, peerName]
  );
  const contributionText =
    session?.activity === "color_mood"
      ? ""
      : `Твои штрихи: ${myStrokeCount} • ${peerName}: ${peerStrokeCount}`;
  const nextStepTitle = historyMode
    ? allOpen && canOpenChat
      ? "Контакт уже открыт"
      : "История сохранена"
    : allOpen
      ? "Чат уже открыт"
      : showSoftEnding
        ? "История сохранена"
        : waitingForPeer
          ? "Ждём второй ответ"
          : "Что дальше";
  const nextStepText = historyMode
    ? allOpen && canOpenChat
      ? "Можно перейти в личный чат. Полный итог этой сессии уже сохранён в совместной истории."
      : allOpen
        ? "Открытие уже произошло, но чат пока не подтянулся. Полный итог этой сессии уже сохранён."
        : "Полная история этой сессии уже сохранена. Здесь можно быстро перейти к ней и при необходимости открыть replay."
    : allOpen && !canOpenChat
      ? "Открытие уже произошло, но чат пока не готов. Итог уже сохранён в совместной истории."
      : allOpen
        ? "Вы оба открыли контакт. Дальше связь продолжается в личном чате."
        : showSoftEnding
          ? `Сессия осталась в истории. ${archiveArtifactLabel === "палитра" ? "Палитра сохранена и останется только у вас двоих." : "Рисунок и replay сохранены в общей истории."}`
          : waitingForPeer
            ? "Твоё решение уже сохранено. Чат откроется только если второй участник тоже выберет открыть."
            : `Если вы оба выберете открыть, сессия перейдёт в личный чат. Если нет, ${archiveArtifactLabel} останется в совместной истории.`;

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
      navigation.replace(
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

  const openCtaDisabled =
    submitting ||
    openingChat ||
    (allOpen
      ? !canOpenChat
      : historyMode
        ? !allOpen || !canOpenChat
        : Boolean(decision) && !allOpen);
  const skipDisabled = submitting || openingChat || Boolean(decision);
  const primaryDisabled = historyMode
    ? allOpen && canOpenChat
      ? openCtaDisabled
      : false
    : allOpen && !canOpenChat
      ? false
      : allOpen
        ? openCtaDisabled
      : showSoftEnding
        ? false
        : waitingForPeer
          ? true
          : openCtaDisabled;
  const primaryLabel = historyMode
    ? allOpen && canOpenChat
      ? openingChat
        ? "Открываем чат…"
        : "Открыть чат"
      : "Открыть совместную историю"
    : allOpen && !canOpenChat
      ? "Открыть совместную историю"
      : allOpen
        ? openingChat
          ? "Открываем чат…"
          : "Открыть чат"
      : showSoftEnding
        ? "Открыть совместную историю"
        : waitingForPeer
          ? "Ждём решение второго"
          : "Хочу открыть чат";
  const showHistoryButton = historyMode
    ? allOpen && canOpenChat
    : (allOpen && canOpenChat) || waitingForPeer || showSoftEnding;
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
          <View style={styles.heroHeaderRow}>
            <View style={styles.heroHeaderText}>
              <Text style={styles.heroKicker}>
                {historyMode ? "Совместная история" : "Сессия завершена"}
              </Text>
              <Text style={styles.heroTitle}>{resultModeCopy.heroTitle}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                allOpen
                  ? styles.statusBadgePrimary
                  : showSoftEnding
                    ? styles.statusBadgeMuted
                    : styles.statusBadgeNeutral,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  allOpen
                    ? styles.statusBadgeTextPrimary
                    : showSoftEnding
                      ? styles.statusBadgeTextMuted
                      : styles.statusBadgeTextNeutral,
                ]}
              >
                {revealCopy.shortLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.heroText}>
            {getPlayActivityStoryText(session.activity, sessionPrompt?.text)}
          </Text>
          <Text style={styles.heroSubtext}>{resultModeCopy.heroBody}</Text>
          {showDailyPrompt ? (
            <View style={styles.contextPill}>
              <Text style={styles.contextLabel}>Тема</Text>
              <Text style={styles.contextText}>{sessionPromptDisplay}</Text>
            </View>
          ) : null}
          <View style={styles.metaGrid}>
            {summaryItems.map((item) => (
              <View key={item.label} style={styles.metaItem}>
                <Text style={styles.metaLabel}>{item.label}</Text>
                <Text style={styles.metaValue}>{item.value}</Text>
              </View>
            ))}
          </View>
          {contributionText ? (
            <Text style={styles.heroNote}>{contributionText}</Text>
          ) : null}
        </View>

        <PlayModeContextCard
          activity={session.activity}
          promptText={sessionPrompt?.text}
          combinedPalette={combinedPalette}
          ownPalette={ownPalette}
          peerPalette={peerPalette}
          peerTitle="Цвета второго участника"
          compact
          surface="result"
        />

        <View style={styles.actionCard}>
          <Text style={styles.actionTitle}>{nextStepTitle}</Text>
          <Text style={styles.actionText}>{nextStepText}</Text>
          {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

          <Pressable
            disabled={primaryDisabled}
            onPress={() => {
              if (historyMode && (!allOpen || !canOpenChat)) {
                goToDetail(activityHasReplay && replayOpen ? "replay" : undefined);
                return;
              }
              if (!historyMode && (showSoftEnding || (allOpen && !canOpenChat))) {
                goToDetail(activityHasReplay && replayOpen ? "replay" : undefined);
                return;
              }
              void handleOpenPress();
            }}
            style={[styles.primaryButton, primaryDisabled && styles.disabledButton]}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>

          <View style={styles.secondaryActions}>
            {!historyMode && !allOpen && !showSoftEnding && !waitingForPeer && !decision ? (
              <Pressable
                disabled={skipDisabled}
                onPress={() => void handleSkipPress()}
                style={[styles.tertiaryButton, skipDisabled && styles.disabledButton]}
              >
                <Text style={styles.tertiaryText}>Оставить как историю</Text>
              </Pressable>
            ) : null}
            {showHistoryButton ? (
              <Pressable
                onPress={() => goToDetail(activityHasReplay && replayOpen ? "replay" : undefined)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>Открыть совместную историю</Text>
              </Pressable>
            ) : null}
            {activityHasReplay ? (
              <Pressable
                onPress={() => setReplayOpen((prev) => !prev)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>
                  {replayOpen ? "Скрыть replay" : "Показать replay"}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.actionHint}>{resultModeCopy.routeText}</Text>
        </View>

        {activityHasReplay && replayOpen ? (
          <View style={styles.replayBlock}>
            <View style={styles.replayHeader}>
              <View>
                <Text style={styles.replayTitle}>{replayCopy.title}</Text>
                <Text style={styles.replayText}>{replayCopy.body}</Text>
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
                <Text style={styles.statusTitle}>{replayCopy.emptyTitle}</Text>
                <Text style={styles.statusText}>{replayCopy.emptyBody}</Text>
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
    padding: 18,
    backgroundColor: "rgba(20, 18, 35, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  heroHeaderText: {
    flex: 1,
    gap: 6,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "900",
  },
  heroText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  heroSubtext: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  heroNote: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  statusBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  statusBadgePrimary: {
    backgroundColor: "rgba(255, 78, 138, 0.14)",
    borderColor: "rgba(255, 78, 138, 0.24)",
  },
  statusBadgeMuted: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: theme.colors.borderSubtle,
  },
  statusBadgeNeutral: {
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderColor: "rgba(255, 122, 60, 0.22)",
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  statusBadgeTextPrimary: {
    color: theme.colors.primary,
  },
  statusBadgeTextMuted: {
    color: theme.colors.text,
  },
  statusBadgeTextNeutral: {
    color: theme.colors.accent,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaItem: {
    width: "48%",
    minWidth: 140,
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  metaLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  actionCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
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
  actionHint: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
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
  secondaryActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  tertiaryButton: {
    borderRadius: theme.shapes.pill,
    paddingVertical: 11,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
    alignItems: "center",
  },
  tertiaryText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  replayBlock: {
    gap: 10,
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
