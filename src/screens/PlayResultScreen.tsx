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
import { useLocale } from "@/contexts/LocaleContext";
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

function formatDuration(
  session: PlaySessionDoc | null,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  if (!session?.startedAt || !session?.endedAt) {
    if (session?.activity === "chain_draw" && session.turnDurationSec && session.maxTurns) {
      const totalSec = session.turnDurationSec * session.maxTurns;
      const minutes = Math.max(Math.round(totalSec / 60), 1);
      return tt("play.result.durationMinutes", "{count} min", {
        count: String(minutes),
      });
    }
    return tt("play.result.durationDefault", "7 min");
  }

  const diffSec = Math.max(Math.round((session.endedAt - session.startedAt) / 1000), 0);
  if (!diffSec) return tt("play.result.durationDefault", "7 min");
  if (diffSec >= SESSION_DURATION_SEC) return tt("play.result.durationDefault", "7 min");

  const minutes = Math.floor(diffSec / 60);
  const seconds = diffSec % 60;
  if (!minutes) {
    return tt("play.result.durationSeconds", "{count} sec", {
      count: String(seconds),
    });
  }
  if (!seconds) {
    return tt("play.result.durationMinutes", "{count} min", {
      count: String(minutes),
    });
  }
  return tt("play.result.durationMinutesSeconds", "{minutes} min {seconds} sec", {
    minutes: String(minutes),
    seconds: String(seconds),
  });
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

type ResultPrimaryIntent =
  | "open_chat"
  | "open_story"
  | "open_profile"
  | "save_open_decision";

type ResultBridgeCopy = {
  happenedTitle: string;
  happenedBody: string;
  nextTitle: string;
  nextBody: string;
  hint: string;
  primaryIntent: ResultPrimaryIntent;
  primaryLabel: string;
};

function getResultBridgeCopy(options: {
  revealOutcome: ReturnType<typeof resolvePlayRevealOutcome>;
  canOpenChat: boolean;
  hasAccount: boolean;
  hasOwnDecision: boolean;
  activity: PlaySessionDoc["activity"] | "draw";
  tt: (key: string, fallback: string, params?: Record<string, string>) => string;
}): ResultBridgeCopy {
  const { activity, canOpenChat, hasAccount, hasOwnDecision, revealOutcome, tt } = options;
  const savedStoryLabel =
    activity === "color_mood"
      ? tt("play.result.storyLabelPalette", "общая палитра")
      : tt("play.result.storyLabelDrawing", "общая история");

  if (revealOutcome === "open_open" && !hasAccount) {
    return {
      happenedTitle: tt("play.result.bridgeChatNeedsAccountTitle", "Связь уже открылась из этого результата"),
      happenedBody: tt(
        "play.result.bridgeChatNeedsAccountBody",
        "После этого общего результата связь уже открылась и сохранилась вместе с историей. Чтобы перейти в личный разговор, сначала нужен активный профиль."
      ),
      nextTitle: tt("play.result.bridgeChatNeedsAccountNextTitle", "Сначала открыть профиль"),
      nextBody: tt(
        "play.result.bridgeChatNeedsAccountNextBody",
        "После входа можно будет вернуться к этой истории, открыть связь в «Связях» и перейти в личный разговор уже без потери общего контекста."
      ),
      hint: tt(
        "play.result.bridgeChatNeedsAccountHint",
        "Сам общий итог уже сохранён: история останется в архиве и не пропадёт."
      ),
      primaryIntent: "open_profile",
      primaryLabel: tt("common.openProfile", "Открыть профиль"),
    };
  }

  if (revealOutcome === "open_open" && canOpenChat) {
    return {
      happenedTitle: tt("play.result.bridgeChatReadyTitle", "Контакт уже стал взаимным"),
      happenedBody: tt(
        "play.result.bridgeChatReadyBody",
        "После этого общего результата между вами уже открылась связь. Общая история сохранена, а отсюда можно сразу перейти в личный разговор."
      ),
      nextTitle: tt("play.result.bridgeChatReadyNextTitle", "Продолжить это уже лично"),
      nextBody: tt(
        "play.result.bridgeChatReadyNextBody",
        "Можно сразу открыть разговор или сначала зайти в саму связь, если хочешь опереться на общую историю и этот сохранённый контекст."
      ),
      hint: tt(
        "play.result.bridgeChatReadyHint",
        "После выхода с этого экрана связь останется в «Связях», а совместная история останется в архиве."
      ),
      primaryIntent: "open_chat",
      primaryLabel: tt("play.result.openPrivateChat", "Открыть личный разговор"),
    };
  }

  if (revealOutcome === "open_open") {
    return {
      happenedTitle: tt("play.result.bridgeConnectionReadyTitle", "Связь уже открылась"),
      happenedBody: tt(
        "play.result.bridgeConnectionReadyBody",
        "Общий результат уже сохранился как открытая связь. Если личный разговор не открывается отсюда, можно спокойно вернуться в саму историю или в раздел «Связи»."
      ),
      nextTitle: tt("play.result.bridgeConnectionReadyNextTitle", "Вернуться к общей истории"),
      nextBody: tt(
        "play.result.bridgeConnectionReadyNextBody",
        "История уже хранит этот общий момент и остаётся самым надёжным мостом обратно в связь."
      ),
      hint: tt(
        "play.result.bridgeConnectionReadyHint",
        "Открытие уже не потеряется: общий результат сохранён вместе со связью."
      ),
      primaryIntent: "open_story",
      primaryLabel: tt("play.result.openSharedStory", "Открыть общую историю"),
    };
  }

  if (revealOutcome === "waiting" && hasOwnDecision) {
    return {
      happenedTitle: tt("play.result.bridgeWaitingTitle", "Твой ответ уже сохранён"),
      happenedBody: tt(
        "play.result.bridgeWaitingBody",
        "После общего результата ты уже сделал свой выбор, а второй человек ещё не ответил."
      ),
      nextTitle: tt("play.result.bridgeWaitingNextTitle", "Пока можно спокойно вернуться к общей истории"),
      nextBody: tt(
        "play.result.bridgeWaitingNextBody",
        "Если второй человек тоже выберет открыть, общий момент станет входом в личный разговор. Пока этого не произошло, история уже сохранена и никуда не денется."
      ),
      hint: tt(
        "play.result.bridgeWaitingHint",
        "Можно спокойно уходить с этого экрана: общий результат уже сохранён, а решение догонит тебя позже."
      ),
      primaryIntent: "open_story",
      primaryLabel: tt("play.result.openSharedStory", "Открыть общую историю"),
    };
  }

  if (revealOutcome === "open_skip" || revealOutcome === "skip_skip") {
    return {
      happenedTitle: tt("play.result.bridgeStoryOnlyTitle", "Этот момент остался общей историей"),
      happenedBody:
        revealOutcome === "open_skip"
          ? tt(
              "play.result.bridgeOpenSkipBody",
              "Один человек был готов открыть контакт, но этот момент всё же остался только в общей истории."
            )
          : tt(
              "play.result.bridgeSkipSkipBody",
              "Вы оба решили оставить этот момент в общей истории и не переводить его в личный разговор."
            ),
      nextTitle: tt("play.result.bridgeStoryOnlyNextTitle", "Вернуться к истории или начать заново"),
      nextBody: tt(
        "play.result.bridgeStoryOnlyNextBody",
        "Открой сохранённую историю, replay или начни новую совместную сессию, если хочешь дать связи ещё один шанс."
      ),
      hint: tt(
        "play.result.bridgeStoryOnlyHint",
        "Даже без личного разговора этот общий итог не пропадает: {story} остаётся в архиве.",
        { story: savedStoryLabel }
      ),
      primaryIntent: "open_story",
      primaryLabel: tt("play.result.openSharedStory", "Открыть общую историю"),
    };
  }

  return {
    happenedTitle: tt("play.result.bridgeDecisionTitle", "Сначала был общий результат"),
    happenedBody: tt(
      "play.result.bridgeDecisionBody",
      "Теперь можно решить, останется ли этот момент только общей историей или станет шагом к личному контакту."
    ),
    nextTitle: tt("play.result.bridgeDecisionNextTitle", "Решить, хочешь ли открыть контакт"),
    nextBody:
      activity === "color_mood"
        ? tt(
            "play.result.bridgeDecisionPaletteNextBody",
            "Если вы оба выберете открыть, палитра приведёт в личный разговор. Если нет, она просто останется вашей общей историей."
          )
        : tt(
            "play.result.bridgeDecisionDrawingNextBody",
            "Если вы оба выберете открыть, этот результат приведёт в личный разговор. Если нет, рисунок останется общей историей."
          ),
    hint: tt(
      "play.result.bridgeDecisionHint",
      "Решение не стирает итог: общая история сохраняется в любом случае."
    ),
    primaryIntent: "save_open_decision",
    primaryLabel: tt("play.result.primaryOpenChat", "Хочу открыть разговор"),
  };
}

export default function PlayResultScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayResult">>();
  const route = useRoute<PlayResultRouteProp>();
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const sessionId = route.params.sessionId.trim();
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
  const goToConnections = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Connections" });
  }, [navigation]);
  const startNewSession = React.useCallback(() => {
    navigation.navigate("PlayMatch", {
      activity: session?.activity === "color_mood" ? "color_mood" : "draw",
    });
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
    setReplayOpen(false);
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
        setLoadError(
          tt(
            "play.result.loadError",
            "Не удалось собрать итог этой совместной сессии. Попробуй открыть его еще раз."
          )
        );
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
        setLoadError(
          tt(
            "play.result.replayLoadError",
            "Мы не смогли загрузить replay этой сессии целиком. Попробуй еще раз."
          )
        );
        setLoadingEvents(false);
      }
    );
    return () => {
      mountedRef.current = false;
      unsubscribeSession();
      unsubscribeEvents();
    };
  }, [reloadKey, sessionId, tt]);

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
  const durationLabel = formatDuration(session, tt);
  const activityLabel = getPlayActivityLabel(session?.activity ?? "draw", "neutral");
  const showDailyPrompt = session?.activity === "daily_prompt";
  const activityHasReplay = playActivityUsesReplay(session?.activity ?? "draw");
  const sessionPrompt = React.useMemo(() => getPlaySessionPrompt(session), [session]);
  const sessionPromptDisplay =
    sessionPrompt?.text?.trim() || tt("playDetail.pendingPrompt", "Тема уточняется");
  const combinedPalette = React.useMemo(() => getPlayColorMoodCombinedPalette(session), [session]);
  const ownPalette = React.useMemo(() => getPlayColorMoodChoices(session, uid), [session, uid]);
  const peerPalette = React.useMemo(
    () => getPlayColorMoodChoices(session, peer?.uid ?? ""),
    [peer?.uid, session]
  );
  const revealCopy = React.useMemo(() => getPlayRevealCopy(revealOutcome), [revealOutcome]);
  const resultModeCopy = React.useMemo(
    () => getPlayResultModeCopy(session?.activity ?? "draw"),
    [session?.activity]
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
  const canOpenChat = Boolean(db && session && uid && peer?.uid);
  const hasAccount = Boolean(uid);
  const hasReplay = replayStrokes.length > 0;
  const summaryItems = React.useMemo(
    () => [
      { label: tt("playDetail.activity", "Режим"), value: activityLabel },
      { label: tt("playDetail.partner", "Партнёр"), value: peerName },
      { label: metricLabel, value: String(metricValue) },
      { label: tt("play.result.timeLabel", "Время"), value: durationLabel },
    ],
    [activityLabel, durationLabel, metricLabel, metricValue, peerName, tt]
  );
  const contributionText =
    session?.activity === "color_mood"
      ? ""
      : tt("play.result.contribution", "Твои штрихи: {mine} • {name}: {peer}", {
          mine: String(myStrokeCount),
          name: peerName,
          peer: String(peerStrokeCount),
        });
  const bridgeCopy = React.useMemo(
    () =>
      getResultBridgeCopy({
        revealOutcome,
        canOpenChat,
        hasAccount,
        hasOwnDecision: Boolean(decision),
        activity: session?.activity ?? "draw",
        tt,
      }),
    [canOpenChat, decision, hasAccount, revealOutcome, session?.activity, tt]
  );

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
          sourceContext: {
            source: "play",
            sourceSessionId: sessionId,
            artworkSummary: {
              activity: session.activity,
              ...(totalStrokeCount != null ? { strokeCount: totalStrokeCount } : {}),
            },
          },
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
        setActionError(
          tt(
            "play.result.openChatFailed",
            "Не удалось открыть чат прямо сейчас. Попробуй еще раз чуть позже."
          )
        );
      }
    }
  }, [db, navigation, peer?.uid, peerName, session, sessionId, totalStrokeCount, tt, uid]);

  const handleOpenPress = React.useCallback(async () => {
    if (submitting || openingChat) return;

    if (allOpen) {
      await openChat();
      return;
    }

    if (!db || !sessionId || !uid || decision) {
      if (mountedRef.current) {
        setActionError(
          tt(
            "play.result.saveDecisionRetry",
            "Сейчас не получилось сохранить решение. Вернись назад или попробуй снова."
          )
        );
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
        setActionError(
          tt(
            "play.result.saveDecisionFailed",
            "Не удалось сохранить выбор. Попробуй еще раз."
          )
        );
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [allOpen, db, decision, openChat, openingChat, sessionId, submitting, tt, uid]);

  const handleSkipPress = React.useCallback(async () => {
    if (!db || !sessionId || !uid || submitting || decision || openingChat) {
      if (mountedRef.current && !submitting && !openingChat) {
        setActionError(
          tt(
            "play.result.saveDecisionRetry",
            "Сейчас не получилось сохранить решение. Попробуй еще раз."
          )
        );
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
        setActionError(
          tt(
            "play.result.saveDecisionFailed",
            "Не удалось сохранить выбор. Попробуй еще раз."
          )
        );
      }
    } finally {
      if (mountedRef.current) {
        setSubmitting(false);
      }
    }
  }, [db, decision, openingChat, sessionId, submitting, tt, uid]);

  const openChatDisabled = submitting || openingChat || !canOpenChat;
  const saveOpenDecisionDisabled = submitting || openingChat || Boolean(decision);
  const skipDisabled = submitting || openingChat || Boolean(decision);
  const primaryDisabled =
    bridgeCopy.primaryIntent === "open_chat"
        ? openChatDisabled
        : bridgeCopy.primaryIntent === "save_open_decision"
          ? saveOpenDecisionDisabled
          : false;
  const primaryLabel =
    bridgeCopy.primaryIntent === "open_chat" && openingChat
      ? tt("connections.openingChat", "Открываем разговор…")
      : bridgeCopy.primaryLabel;
  const showHistoryButton =
    bridgeCopy.primaryIntent !== "open_story" &&
    ((allOpen && canOpenChat) || waitingForPeer || showSoftEnding);
  const showConnectionsButton = revealOutcome === "open_open";
  const screenTitle = tt("play.result.title", "Итог сессии");
  const handleBack = () => {
    if (navigation.canGoBack()) {
      navigation.goBack();
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
            title={tt("play.result.stateMissingTitle", "Сессия не найдена")}
            body={tt(
              "play.result.stateMissingBody",
              "Не удалось открыть итог без идентификатора совместной сессии."
            )}
            primaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
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
            title={tt("play.result.stateOfflineTitle", "Итог пока недоступен")}
            body={tt(
              "play.result.stateOfflineBody",
              "Мы не смогли подключить итог этой сессии прямо сейчас. Вернись назад или попробуй открыть его еще раз позже."
            )}
            primaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
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
            title={tt("play.result.stateLoadingTitle", "Собираем итог")}
            body={tt(
              "play.result.stateLoadingBody",
              "Еще пара секунд, и здесь появится результат вашей совместной сессии."
            )}
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
            title={tt("play.result.stateErrorTitle", "Итог временно недоступен")}
            body={loadError}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
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
            title={tt("play.result.stateNotFoundTitle", "Итог больше недоступен")}
            body={tt(
              "play.result.stateNotFoundBody",
              "Сессия уже исчезла или не успела сохраниться. Можно вернуться во Вместе и начать новую."
            )}
            primaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
            secondaryAction={{ label: tt("playHistory.startNewSession", "Начать новую совместную сессию"), onPress: startNewSession }}
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
                {tt("play.result.finishedKicker", "Сессия завершена")}
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
              <Text style={styles.contextLabel}>{tt("playDetail.topicLabel", "Тема")}</Text>
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
          peerTitle={tt("playDetail.peerPaletteTitle", "Цвета второго участника")}
          compact
          surface="result"
        />

        <View style={styles.actionCard}>
          <View style={styles.actionSection}>
            <Text style={styles.actionEyebrow}>
              {tt("play.result.happenedLabel", "Что произошло между вами")}
            </Text>
            <Text style={styles.actionTitle}>{bridgeCopy.happenedTitle}</Text>
            <Text style={styles.actionText}>{bridgeCopy.happenedBody}</Text>
          </View>

          <View style={styles.actionDivider} />

          <View style={styles.actionSection}>
            <Text style={styles.actionEyebrow}>
              {tt("play.result.nextLabel", "Что делать дальше")}
            </Text>
            <Text style={styles.actionTitle}>{bridgeCopy.nextTitle}</Text>
            <Text style={styles.actionText}>{bridgeCopy.nextBody}</Text>
          </View>

          {actionError ? <Text style={styles.inlineError}>{actionError}</Text> : null}

          <Pressable
            disabled={primaryDisabled}
            onPress={() => {
              if (bridgeCopy.primaryIntent === "open_story") {
                goToDetail(activityHasReplay && replayOpen ? "replay" : undefined);
                return;
              }
              if (bridgeCopy.primaryIntent === "open_profile") {
                navigation.navigate("Profile");
                return;
              }
              if (bridgeCopy.primaryIntent === "open_chat") {
                void openChat();
                return;
              }
              if (bridgeCopy.primaryIntent === "save_open_decision") {
                void handleOpenPress();
              }
            }}
            style={[styles.primaryButton, primaryDisabled && styles.disabledButton]}
          >
            <Text style={styles.primaryText}>{primaryLabel}</Text>
          </Pressable>

          <View style={styles.secondaryActions}>
            {showConnectionsButton ? (
              <Pressable onPress={goToConnections} style={styles.secondaryButton}>
                <Text style={styles.secondaryText}>
                  {tt("play.result.openConnection", "Открыть связь")}
                </Text>
              </Pressable>
            ) : null}
            {!allOpen && !showSoftEnding && !waitingForPeer && !decision ? (
              <Pressable
                disabled={skipDisabled}
                onPress={() => void handleSkipPress()}
                style={[styles.tertiaryButton, skipDisabled && styles.disabledButton]}
              >
                <Text style={styles.tertiaryText}>
                  {tt("play.result.keepAsStory", "Оставить как историю")}
                </Text>
              </Pressable>
            ) : null}
            {showHistoryButton ? (
              <Pressable
                onPress={() => goToDetail(activityHasReplay && replayOpen ? "replay" : undefined)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>
                  {tt("playHistory.openStory", "Открыть историю")}
                </Text>
              </Pressable>
            ) : null}
            {activityHasReplay ? (
              <Pressable
                onPress={() => setReplayOpen((prev) => !prev)}
                style={styles.secondaryButton}
              >
                <Text style={styles.secondaryText}>
                  {replayOpen
                    ? tt("playDetail.hideReplay", "Скрыть replay")
                    : tt("playDetail.openReplay", "Показать replay")}
                </Text>
              </Pressable>
            ) : null}
          </View>
          <Text style={styles.actionHint}>{bridgeCopy.hint}</Text>
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
                <Text style={styles.contextLabel}>{tt("playDetail.topicLabel", "Тема")}</Text>
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
  actionSection: {
    gap: 6,
  },
  actionEyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  actionDivider: {
    height: 1,
    backgroundColor: theme.colors.borderSubtle,
    opacity: 0.7,
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
    gap: 10,
  },
  secondaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  tertiaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 12,
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
