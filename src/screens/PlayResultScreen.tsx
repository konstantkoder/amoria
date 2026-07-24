import React from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import ReplayCanvasWebView from "@/components/play/ReplayCanvasWebView";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import type { Locale } from "@/i18n/translations";
import {
  type PlayResultRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import {
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import * as togetherApi from "@/services/api/togetherApi";
import type {
  TogetherEventDto,
  TogetherParticipantDto,
  TogetherRevealStateDto,
  StorySparksArtifactDto,
  TogetherSessionResponse,
  TurnBasedMomentDto,
} from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import {
  getRememberedTogetherSession,
  getTogetherPeer,
  getTogetherStrokes,
  rememberTogetherSession,
  replaceTogetherStrokesFromEvents,
} from "@/services/togetherCanvasState";
import { localizeTogetherPrompt } from "@/services/togetherPromptLocalization";
import {
  buildStoryArtifactFromEvents,
  localizeStoryText,
  storyArtifactToDmSummary,
} from "@/services/togetherStorySparksState";
import { theme } from "@/theme";

type RevealDecision = "open" | "skip" | "continue_story";

function getRevealLabel(
  outcome: string,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  switch (outcome) {
    case "open_open":
      return tt("play.reveal.openOpenShort", "Чат открыт");
    case "open_skip":
      return tt("play.reveal.openSkipShort", "Осталось историей");
    case "skip_skip":
      return tt("play.reveal.skipSkipShort", "Без чата");
    case "continue_story":
      return tt("play.reveal.continueStoryShort", "История продолжается");
    case "mixed_intent":
      return tt("play.reveal.mixedIntentShort", "Без общего пути");
    case "blocked":
      return tt("play.reveal.blockedShort", "Контакт недоступен");
    case "pending":
    default:
      return tt("play.reveal.waitingShort", "Ждём ответ");
  }
}

function isTerminalClosedStatus(status?: string | null) {
  return status === "abandoned" || status === "cancelled";
}

function readRevealState(payload: wsClient.RealtimeMessage): TogetherRevealStateDto | null {
  if (payload.type !== "together.reveal.updated") return null;
  const value = payload.revealState;
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<TogetherRevealStateDto>;
  if (
    candidate.outcome !== "pending" &&
    candidate.outcome !== "open_open" &&
    candidate.outcome !== "open_skip" &&
    candidate.outcome !== "skip_skip" &&
    candidate.outcome !== "continue_story" &&
    candidate.outcome !== "mixed_intent" &&
    candidate.outcome !== "blocked"
  ) {
    return null;
  }

  return {
    myDecision:
      candidate.myDecision === "open" ||
      candidate.myDecision === "skip" ||
      candidate.myDecision === "continue_story"
        ? candidate.myDecision
        : null,
    outcome: candidate.outcome,
    threadId: typeof candidate.threadId === "string" ? candidate.threadId : null,
    canOpenChat: candidate.canOpenChat === true,
    peerDecisionKnown: candidate.peerDecisionKnown === true,
    nextSessionId:
      typeof candidate.nextSessionId === "string" ? candidate.nextSessionId : null,
    nextActivity:
      candidate.nextActivity === "story_sparks" ||
      candidate.nextActivity === "draw"
        ? candidate.nextActivity
        : null,
  };
}

export default function PlayResultScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayResult">>();
  const route = useRoute<PlayResultRouteProp>();
  const { user: authUser } = useAuth();
  const { locale, t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );

  const sessionId = route.params.sessionId.trim();
  const isTurnBased = route.params.mode === "turn_based";
  const momentId = route.params.momentId;
  const uid = authUser?.id ?? "";
  const remembered = React.useMemo(() => getRememberedTogetherSession(sessionId), [sessionId]);
  const [sessionResponse, setSessionResponse] = React.useState<TogetherSessionResponse | null>(remembered);
  const [loading, setLoading] = React.useState(!remembered);
  const [loadError, setLoadError] = React.useState("");
  const [revealState, setRevealState] = React.useState<TogetherRevealStateDto | null>(
    remembered?.revealState ?? null
  );
  const [sessionEvents, setSessionEvents] = React.useState<TogetherEventDto[]>([]);
  const [replayStrokes, setReplayStrokes] = React.useState(() =>
    getTogetherStrokes(sessionId)
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState("");
  const [turnBasedMoment, setTurnBasedMoment] = React.useState<TurnBasedMomentDto | null>(null);
  const mountedRef = React.useRef(true);
  const chatNavigationRef = React.useRef(false);
  const storyNavigationRef = React.useRef(false);

  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    goToTogether();
  }, [goToTogether, navigation]);

  const refreshTurnBasedResult = React.useCallback(async () => {
    if (!isTurnBased || !momentId || !sessionId) return;
    const [sessionResult, momentResult] = await Promise.all([
      togetherApi.getSession(sessionId),
      togetherApi.getTurnBasedMoment(momentId),
    ]);
    if (!mountedRef.current) return;
    rememberTogetherSession(sessionResult);
    setSessionResponse(sessionResult);
    setRevealState(sessionResult.revealState ?? null);
    setTurnBasedMoment(momentResult.moment);
  }, [isTurnBased, momentId, sessionId]);

  useFocusEffect(React.useCallback(() => {
    void refreshTurnBasedResult().catch(() => undefined);
    return undefined;
  }, [refreshTurnBasedResult]));

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refreshTurnBasedResult().catch(() => undefined);
    });
    return () => subscription.remove();
  }, [refreshTurnBasedResult]);

  React.useEffect(() => {
    mountedRef.current = true;
    setLoadError("");
    setActionError("");
    if (!sessionId) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(!remembered);
    setRevealState(remembered?.revealState ?? null);
    setSessionEvents([]);
    setReplayStrokes(getTogetherStrokes(sessionId));
    chatNavigationRef.current = false;
    storyNavigationRef.current = false;
    void Promise.all([
      togetherApi.getSession(sessionId),
      togetherApi.getSessionEvents(sessionId),
    ])
      .then(([response, eventsResponse]) => {
        if (!mountedRef.current) return;
        rememberTogetherSession(response);
        setSessionEvents(eventsResponse.items);
        if (response.session.activity === "draw") {
          setReplayStrokes(replaceTogetherStrokesFromEvents(sessionId, eventsResponse.items));
        } else {
          setReplayStrokes([]);
        }
        setSessionResponse(response);
        setRevealState(response.revealState ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadError(
          tt(
            "play.result.loadError",
            "Не удалось собрать итог этой совместной сессии. Попробуй открыть его еще раз."
          )
        );
        setLoading(false);
      });
    if (isTurnBased && momentId) {
      void togetherApi.getTurnBasedMoment(momentId)
        .then((response) => { if (mountedRef.current) setTurnBasedMoment(response.moment); })
        .catch(() => undefined);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [isTurnBased, momentId, remembered, sessionId, tt]);

  const session = sessionResponse?.session ?? null;
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const identityRevealed =
    !isTurnBased || Boolean(turnBasedMoment?.identityRevealed && sessionResponse?.identityRevealed);
  const peerName = identityRevealed
    ? peer?.displayName?.trim() || tt("profile.amoriaUser", "Пользователь Amoria")
    : tt("together.turnBased.anonymousPeer", "Другой участник");
  const rawSessionActivity = session?.activity as string | undefined;
  const sessionActivity =
    rawSessionActivity === "story_sparks"
      ? "story_sparks"
      : rawSessionActivity === "draw"
      ? "draw"
      : null;
  const strokes = replayStrokes;
  const storyArtifact = React.useMemo(
    () =>
      session?.activity === "story_sparks" && session.storyPack
        ? buildStoryArtifactFromEvents(sessionEvents, session.storyPack)
        : null,
    [session, sessionEvents]
  );
  const storyDmSummary = React.useMemo(
    () => storyArtifactToDmSummary(storyArtifact, locale),
    [locale, storyArtifact]
  );
  const hasReplay = strokes.length > 0;
  const hasStoryArtifact = Boolean(storyArtifact);
  const decision = turnBasedMoment?.myRevealDecision ?? revealState?.myDecision ?? null;
  const outcome = revealState?.outcome ?? "pending";
  const revealThreadId = revealState?.threadId ?? null;
  const nextStorySessionId =
    revealState?.nextActivity === "story_sparks" ? revealState.nextSessionId : null;
  const canRevealDecision =
    session?.status === "finished" &&
    sessionActivity !== null &&
    !decision &&
    (revealState?.canOpenChat ?? true) &&
    outcome !== "blocked" &&
    (!isTurnBased || turnBasedMoment?.action === "review_draw" || turnBasedMoment?.action === "review_story");
  const canContinueStory = sessionActivity === "draw" && canRevealDecision;
  const canOpenExistingChat = outcome === "open_open" && Boolean(revealThreadId);
  const revealLabel = getRevealLabel(outcome, tt);

  const navigateToThread = React.useCallback(
    (threadId: string, nextPeer: TogetherParticipantDto | null) => {
      if (!threadId || !nextPeer?.id || !sessionActivity || chatNavigationRef.current) return;
      chatNavigationRef.current = true;
      navigation.replace("DMChat", {
        threadId,
        peerId: nextPeer.id,
        peerName: nextPeer.displayName,
        backTarget: "inbox",
        sourceContext: {
          source: "together",
          sourceSessionId: sessionId,
          artworkSummary: {
            activity: sessionActivity,
            ...(sessionActivity === "draw" ? { strokeCount: strokes.length } : {}),
            ...(sessionActivity === "story_sparks" && storyDmSummary ? storyDmSummary : {}),
          },
        },
      });
    },
    [navigation, sessionActivity, sessionId, storyDmSummary, strokes.length]
  );

  const navigateToStorySparks = React.useCallback(
    (nextSessionId: string, reason: "response" | "realtime" | "refresh") => {
      if (!nextSessionId || storyNavigationRef.current) return;
      storyNavigationRef.current = true;
      try {
        navigation.replace("PlayStorySparks", {
          sessionId: nextSessionId,
          ...(isTurnBased ? { mode: "turn_based", momentId } : {}),
        });
      } catch (error) {
        storyNavigationRef.current = false;
        const safeError = sanitizeErrorForReport(error);
        reportClientError({
          screen: "PlayResultScreen",
          action: "continueStory",
          step: "storySparksNavigationFailed",
          code: safeError.code,
          message: safeError.message,
          stack: safeError.stack,
          metadata: {
            sourceSessionId: sessionId,
            nextSessionId,
            reason,
          },
        });
        setActionError(
          tt(
            "play.result.continueStoryNavigationFailed",
            "История готова, но перейти к ней не получилось. Попробуй открыть итог ещё раз."
          )
        );
      }
    },
    [isTurnBased, momentId, navigation, sessionId, tt]
  );

  React.useEffect(() => {
    let alive = true;
    if (!sessionId) {
      return () => {
        alive = false;
      };
    }

    wsClient.connect();
    wsClient.subscribeTogetherSession(sessionId);
    const unsubscribe = wsClient.onMessage((payload) => {
      if (!alive) return;
      if (payload.type === "together.turn_based.updated" && isTurnBased && momentId) {
        void refreshTurnBasedResult().catch(() => undefined);
        return;
      }
      if (payload.sessionId !== sessionId) return;
      const nextRevealState = readRevealState(payload);
      if (!nextRevealState) return;
      setRevealState(nextRevealState);
    });

    return () => {
      alive = false;
      unsubscribe();
      wsClient.unsubscribeTogetherSession(sessionId);
    };
  }, [isTurnBased, momentId, refreshTurnBasedResult, sessionId]);

  React.useEffect(() => {
    if (
      revealState?.outcome !== "open_open" ||
      !revealState.threadId ||
      revealState.myDecision !== "open"
    ) {
      return;
    }

    navigateToThread(revealState.threadId, peer);
  }, [
    navigateToThread,
    peer,
    revealState?.myDecision,
    revealState?.outcome,
    revealState?.threadId,
  ]);

  React.useEffect(() => {
    if (revealState?.outcome !== "continue_story") return;
    if (revealState.nextActivity !== "story_sparks" || !revealState.nextSessionId) {
      reportClientError({
        screen: "PlayResultScreen",
        action: "continueStory",
        step: "invalidContinuationOutcome",
        message: "Backend returned continue_story without a story_sparks next session",
        metadata: {
          sourceSessionId: sessionId,
          nextSessionIdPresent: Boolean(revealState.nextSessionId),
          nextActivity: revealState.nextActivity ?? null,
        },
      });
      setActionError(
        tt(
          "play.result.invalidContinuationOutcome",
          "Продолжение ещё не готово на сервере. Подождём синхронизацию и попробуем обновить."
        )
      );
      return;
    }

    navigateToStorySparks(revealState.nextSessionId, "realtime");
  }, [
    navigateToStorySparks,
    revealState?.nextActivity,
    revealState?.nextSessionId,
    revealState?.outcome,
    sessionId,
    tt,
  ]);

  React.useEffect(() => {
    if (!sessionId || session?.status !== "finished") return;
    const shouldRefresh =
      outcome === "pending" ||
      (outcome === "open_open" && !revealThreadId) ||
      (outcome === "continue_story" && !nextStorySessionId);
    if (!shouldRefresh) return;

    let cancelled = false;
    const refreshRevealState = async () => {
      try {
        const response = await togetherApi.getSession(sessionId);
        if (cancelled || !mountedRef.current) return;
        rememberTogetherSession(response);
        setSessionResponse(response);
        setRevealState(response.revealState ?? null);
      } catch {
        // The explicit retry/error path stays on the initial page load.
      }
    };

    const timer = setInterval(() => {
      void refreshRevealState();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [nextStorySessionId, outcome, revealThreadId, session?.status, sessionId]);

  const submitDecision = React.useCallback(
    async (nextDecision: RevealDecision) => {
      if (!sessionId || submitting || !canRevealDecision) return;
      setSubmitting(true);
      setActionError("");

      try {
        const response = await togetherApi.reveal(sessionId, nextDecision);
        if (!mountedRef.current) return;
        const nextRevealState = response.revealState;
        setRevealState(nextRevealState);
        if (isTurnBased && momentId) {
          const refreshed = await togetherApi.getTurnBasedMoment(momentId);
          if (mountedRef.current) setTurnBasedMoment(refreshed.moment);
        }
        if (
          nextDecision === "continue_story" &&
          nextRevealState.outcome === "continue_story"
        ) {
          if (
            nextRevealState.nextActivity === "story_sparks" &&
            nextRevealState.nextSessionId
          ) {
            navigateToStorySparks(nextRevealState.nextSessionId, "response");
          } else {
            reportClientError({
              screen: "PlayResultScreen",
              action: "continueStory",
              step: "invalidContinuationOutcome",
              message: "continue_story response did not include a story_sparks next session",
              metadata: {
                sourceSessionId: sessionId,
                nextSessionIdPresent: Boolean(nextRevealState.nextSessionId),
                nextActivity: nextRevealState.nextActivity ?? null,
              },
            });
          }
        }
        if (
          nextDecision === "open" &&
          nextRevealState.outcome === "open_open" &&
          nextRevealState.threadId
        ) {
          navigateToThread(nextRevealState.threadId, peer);
        }
      } catch (error) {
        if (!mountedRef.current) return;
        const safeError = sanitizeErrorForReport(error);
        if (nextDecision === "continue_story") {
          reportClientError({
            screen: "PlayResultScreen",
            action: "continueStory",
            step: "continueStoryDecisionFailed",
            code: safeError.code,
            message: safeError.message,
            stack: safeError.stack,
            metadata: {
              sourceSessionId: sessionId,
              activity: sessionActivity,
            },
          });
          if (safeError.code === "together_continuation_failed") {
            reportClientError({
              screen: "PlayResultScreen",
              action: "continueStory",
              step: "nextStorySessionCreationFailed",
              code: safeError.code,
              message: safeError.message,
              stack: safeError.stack,
              metadata: {
                sourceSessionId: sessionId,
                activity: sessionActivity,
              },
            });
          }
        } else {
          reportClientError({
            screen: "PlayResultScreen",
            action: "revealDecision",
            step: "saveDecisionFailed",
            code: safeError.code,
            message: safeError.message,
            stack: safeError.stack,
            metadata: {
              sessionId,
              decision: nextDecision,
              activity: sessionActivity,
            },
          });
        }
        setActionError(
          tt(
            "play.result.saveDecisionFailed",
            "Не удалось сохранить выбор. Попробуй еще раз."
          )
        );
      } finally {
        if (mountedRef.current) setSubmitting(false);
      }
    },
    [
      canRevealDecision,
      isTurnBased,
      momentId,
      navigateToStorySparks,
      navigateToThread,
      peer,
      sessionActivity,
      sessionId,
      submitting,
      tt,
    ]
  );

  const handleOpenChatPress = React.useCallback(() => {
    if (canOpenExistingChat && revealThreadId) {
      navigateToThread(revealThreadId, peer);
      return;
    }

    void submitDecision("open");
  }, [canOpenExistingChat, navigateToThread, peer, revealThreadId, submitDecision]);

  const handleContinueStoryPress = React.useCallback(() => {
    void submitDecision("continue_story");
  }, [submitDecision]);

  const startNewSession = React.useCallback(() => {
    navigation.navigate("PlayMatch", {
      activity: sessionActivity ?? "draw",
    });
  }, [navigation, sessionActivity]);

  const screenTitle = tt("play.result.title", "Итог сессии");

  if (!sessionId) {
    return (
      <ScreenShell title={screenTitle} background="chatWarm" showBack onBack={handleBack}>
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

  if (loading) {
    return (
      <ScreenShell title={screenTitle} background="chatWarm" showBack onBack={handleBack}>
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

  if (loadError || !session) {
    return (
      <ScreenShell title={screenTitle} background="chatWarm" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("play.result.stateErrorTitle", "Итог временно недоступен")}
            body={loadError || tt("play.result.stateNotFoundBody", "Сессия уже исчезла или не успела сохраниться.")}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => navigation.replace("PlayResult", {
              sessionId,
              ...(isTurnBased ? { mode: "turn_based", momentId } : {}),
            }) }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!sessionActivity) {
    return (
      <ScreenShell title={screenTitle} background="chatWarm" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title={tt("play.unsupportedOldSessionTitle", "Сессия недоступна")}
            body={tt(
              "play.unsupportedOldSession",
              "Эта старая сессия больше недоступна в текущей версии."
            )}
            primaryAction={{
              label: tt("common.backToTogether", "Вернуться во Вместе"),
              onPress: goToTogether,
            }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (isTerminalClosedStatus(session.status)) {
    return (
      <ScreenShell title={screenTitle} background="chatWarm" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="ban-outline"
            title={tt("play.result.interruptedTitle", "Сессия была прервана")}
            body={tt(
              "play.result.interruptedBody",
              "Чат по этой сессии недоступен, потому что совместная сессия не была завершена."
            )}
            primaryAction={{
              label: tt("common.backToTogether", "Вернуться во Вместе"),
              onPress: goToTogether,
            }}
            secondaryAction={{
              label: tt("playHistory.startNewSession", "Начать новую совместную сессию"),
              onPress: startNewSession,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={screenTitle} background="chatWarm" showBack onBack={handleBack}>
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
              <Text style={styles.heroTitle}>
                {sessionActivity === "story_sparks"
                  ? tt("play.result.storySparksHeroTitle", "Ваша история на двоих готова")
                  : tt("play.result.drawHeroTitle", "Ваш общий рисунок готов")}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{revealLabel}</Text>
            </View>
          </View>
          <Text style={styles.heroText}>
            {sessionActivity === "story_sparks" && storyArtifact
              ? localizeStoryText(storyArtifact.title, locale)
              : localizeTogetherPrompt(session, tt)}
          </Text>
          <Text style={styles.heroSubtext}>
            {sessionActivity === "story_sparks"
              ? tt(
                  "play.result.storySavedNote",
                  "История уже сохранена как общий момент. Теперь можно решить, открывать ли личный разговор."
                )
              : tt(
                  "play.result.drawingSavedNote",
                  "Рисунок уже сохранён как общий момент. Теперь можно решить, открывать ли личный разговор."
                )}
          </Text>
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner", "Партнёр")}</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>
                {sessionActivity === "story_sparks"
                  ? tt("play.result.storyRoundCount", "Раунды")
                  : tt("play.metric.strokes", "Штрихов")}
              </Text>
              <Text style={styles.metaValue}>
                {sessionActivity === "story_sparks"
                  ? String(storyArtifact?.rounds.length ?? 0)
                  : String(strokes.length)}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.replayCard}>
          <Text style={styles.sectionTitle}>
            {sessionActivity === "story_sparks"
              ? tt("play.result.storyArtifactTitle", "Story card")
              : tt("play.result.replayTitle", "Replay")}
          </Text>
          {sessionActivity === "story_sparks" ? (
            hasStoryArtifact && storyArtifact ? (
              <StoryArtifactCard artifact={storyArtifact} locale={locale} />
            ) : (
              <Text style={styles.emptyText}>
                {tt("play.result.storyEmpty", "Данные истории для этой сессии пока недоступны.")}
              </Text>
            )
          ) : hasReplay ? (
            <View style={styles.replayWrap}>
              <ReplayCanvasWebView strokes={strokes} autoplay showControls={false} />
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {tt(
                "play.result.replayEmpty",
                "Replay для этой истории пока недоступен."
              )}
            </Text>
          )}
        </View>

        <View style={styles.bridgeCard}>
          <Text style={styles.sectionTitle}>
            {tt("play.result.bridgeDecisionTitle", "Решить, хочешь ли открыть контакт")}
          </Text>
          <Text style={styles.bridgeBody}>
            {outcome === "blocked"
              ? tt(
                    "play.result.bridgeBlockedBody",
                    "Контакт недоступен. Чат не может быть открыт из-за настроек безопасности."
                  )
              : outcome === "mixed_intent"
              ? tt(
                  "play.result.bridgeMixedIntentBody",
                  "Вы выбрали разные продолжения, поэтому чат не откроется и История на двоих не начнётся. Результат останется в общей истории."
                )
              : outcome === "continue_story"
              ? tt(
                  "play.result.bridgeContinueStoryReadyBody",
                  "Вы оба выбрали продолжить историю. Открываем общий Story Sparks этап для этой пары."
                )
              : decision && outcome === "pending"
              ? decision === "continue_story"
                ? tt(
                    "play.result.bridgeWaitingAfterContinueStoryBody",
                    "Ждём решение второго участника. История на двоих начнётся только если вы оба выберете продолжить."
                  )
                : decision === "open"
                ? tt(
                    "play.result.bridgeWaitingAfterOpenBody",
                    "Твой ответ сохранён. Ждём второе решение; чат откроется только если второй человек тоже выберет открыть."
                  )
                : tt(
                    "play.result.bridgeWaitingAfterSkipBody",
                    "Твой ответ сохранён. Ждём второе решение; чат по этой сессии не откроется, но история останется сохранённой."
                  )
              : decision
              ? outcome === "pending"
                ? tt(
                    "play.result.bridgeWaitingBody",
                    "Твой ответ сохранён. Если второй человек тоже выберет открыть, появится чат."
                  )
                : tt(
                    "play.result.bridgeStoryOnlyBody",
                    "Решение сохранено. Общий результат останется в истории."
                  )
              : tt(
                  sessionActivity === "story_sparks"
                    ? "play.result.bridgeDecisionStoryNextBody"
                    : "play.result.bridgeDecisionDrawingNextBody",
                  sessionActivity === "story_sparks"
                    ? "Если вы оба выберете открыть, история приведёт в чат. Если нет, она останется общей историей."
                    : "Можно открыть чат, продолжить через Историю на двоих или оставить рисунок общей историей."
                )}
          </Text>
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          {canOpenExistingChat || canRevealDecision ? (
            <View style={styles.actionRow}>
              <Pressable
                style={[
                  styles.primaryButton,
                  submitting || (!canOpenExistingChat && !canRevealDecision)
                    ? styles.buttonDisabled
                    : null,
                ]}
                onPress={handleOpenChatPress}
                disabled={submitting || (!canOpenExistingChat && !canRevealDecision)}
              >
                <Text style={styles.primaryButtonText}>
                  {canOpenExistingChat
                    ? tt("play.result.chatReady", "Чат открыт")
                    : submitting
                    ? tt("play.result.savingDecision", "Сохраняем…")
                    : tt("play.result.primaryOpenChat", "Открыть чат")}
                </Text>
              </Pressable>
              {canRevealDecision ? (
                <>
                  {canContinueStory ? (
                    <Pressable
                      style={[
                        styles.secondaryButton,
                        styles.continueButton,
                        submitting ? styles.buttonDisabled : null,
                      ]}
                      onPress={handleContinueStoryPress}
                      disabled={submitting}
                    >
                      <Text style={styles.secondaryButtonText}>
                        {tt("play.result.continueStory", "Продолжить историю")}
                      </Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    style={[
                      styles.secondaryButton,
                      submitting ? styles.buttonDisabled : null,
                    ]}
                    onPress={() => void submitDecision("skip")}
                    disabled={submitting}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {tt("play.result.skipChat", "Оставить историей")}
                    </Text>
                  </Pressable>
                </>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={styles.bottomActions}>
          {false ? (
          <Pressable style={styles.outlineButton} onPress={startNewSession}>
            <Text style={styles.outlineButtonText}>
              {tt("play.result.openSharedStory", "Открыть общую историю")}
            </Text>
          </Pressable>
          ) : null}
          <Pressable style={styles.outlineButton} onPress={startNewSession}>
            <Text style={styles.outlineButtonText}>
              {tt("playHistory.startNewSession", "Начать новую совместную сессию")}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function StoryArtifactCard({
  artifact,
  locale,
}: {
  artifact: StorySparksArtifactDto;
  locale: Locale;
}) {
  return (
    <View style={styles.storyArtifact}>
      <Text style={styles.storyArtifactTitle}>
        {localizeStoryText(artifact.title, locale)}
      </Text>
      <Text style={styles.storyArtifactSummary}>
        {localizeStoryText(artifact.summary, locale)}
      </Text>
      <View style={styles.storyRoundList}>
        {artifact.rounds.map((round) => (
          <View key={round.roundId} style={styles.storyRoundItem}>
            <Text style={styles.storyRoundTitle}>
              {localizeStoryText(round.title, locale)}
            </Text>
            <View style={styles.storyChoiceList}>
              {round.choices.map((choice) => (
                <View
                  key={`${choice.fromUserId}-${choice.roundId}`}
                  style={styles.storyChoiceChip}
                >
                  <Text style={styles.storyChoiceEmoji}>{choice.card.emoji}</Text>
                  <Text style={styles.storyChoiceText}>
                    {localizeStoryText(choice.card.title, locale)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    gap: 12,
    backgroundColor: "rgba(10, 13, 26, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  heroHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  heroHeaderText: {
    flex: 1,
    gap: 4,
  },
  heroKicker: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  statusBadge: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  statusBadgeText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  heroText: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  heroSubtext: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: "row",
    gap: 10,
  },
  metaItem: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  metaLabel: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  replayCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(13, 17, 31, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  replayWrap: {
    height: 320,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  storyArtifact: {
    gap: 12,
  },
  storyArtifactTitle: {
    color: theme.colors.text,
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  storyArtifactSummary: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  storyRoundList: {
    gap: 10,
  },
  storyRoundItem: {
    gap: 8,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
  },
  storyRoundTitle: {
    color: "#FFE0B8",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  storyChoiceList: {
    gap: 8,
  },
  storyChoiceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  storyChoiceEmoji: {
    width: 24,
    color: theme.colors.text,
    fontSize: 18,
    textAlign: "center",
  },
  storyChoiceText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  emptyText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  bridgeCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(16, 20, 38, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  bridgeBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  errorText: {
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 52,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryActionBg,
    borderWidth: 1,
    borderColor: theme.colors.primaryActionBorder,
  },
  primaryButtonText: {
    color: theme.colors.primaryActionText,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 50,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: theme.buttons.secondary.borderColor,
  },
  continueButton: {
    backgroundColor: theme.buttons.secondary.backgroundColor,
    borderColor: theme.buttons.secondary.borderColor,
  },
  secondaryButtonText: {
    color: theme.colors.secondaryActionText,
    fontSize: 14,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  bottomActions: {
    gap: 10,
  },
  outlineButton: {
    minHeight: 48,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: theme.buttons.secondary.borderColor,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  outlineButtonText: {
    color: theme.colors.secondaryActionText,
    fontSize: 14,
    fontWeight: "800",
  },
});
