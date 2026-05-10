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
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayResultRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import * as togetherApi from "@/services/api/togetherApi";
import type {
  TogetherParticipantDto,
  TogetherRevealStateDto,
  TogetherSessionResponse,
} from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import {
  getRememberedTogetherSession,
  getTogetherPeer,
  getTogetherStrokes,
  rememberTogetherSession,
} from "@/services/togetherCanvasState";
import { theme } from "@/theme";

type RevealDecision = "open" | "skip";

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
    candidate.outcome !== "blocked"
  ) {
    return null;
  }

  return {
    myDecision:
      candidate.myDecision === "open" || candidate.myDecision === "skip"
        ? candidate.myDecision
        : null,
    outcome: candidate.outcome,
    threadId: typeof candidate.threadId === "string" ? candidate.threadId : null,
    canOpenChat: candidate.canOpenChat === true,
    peerDecisionKnown: candidate.peerDecisionKnown === true,
  };
}

export default function PlayResultScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayResult">>();
  const route = useRoute<PlayResultRouteProp>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );

  const sessionId = route.params.sessionId.trim();
  const uid = authUser?.id ?? "";
  const remembered = React.useMemo(() => getRememberedTogetherSession(sessionId), [sessionId]);
  const [sessionResponse, setSessionResponse] = React.useState<TogetherSessionResponse | null>(remembered);
  const [loading, setLoading] = React.useState(!remembered);
  const [loadError, setLoadError] = React.useState("");
  const [revealState, setRevealState] = React.useState<TogetherRevealStateDto | null>(
    remembered?.revealState ?? null
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [actionError, setActionError] = React.useState("");
  const mountedRef = React.useRef(true);

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
    void togetherApi
      .getSession(sessionId)
      .then((response) => {
        if (!mountedRef.current) return;
        rememberTogetherSession(response);
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

    return () => {
      mountedRef.current = false;
    };
  }, [remembered, sessionId, tt]);

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
      if (!alive || payload.sessionId !== sessionId) return;
      const nextRevealState = readRevealState(payload);
      if (!nextRevealState) return;
      setRevealState(nextRevealState);
    });

    return () => {
      alive = false;
      unsubscribe();
      wsClient.unsubscribeTogetherSession(sessionId);
    };
  }, [sessionId]);

  const session = sessionResponse?.session ?? null;
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const peerName = peer?.displayName?.trim() || tt("profile.amoriaUser", "Пользователь Amoria");
  const strokes = React.useMemo(() => getTogetherStrokes(sessionId), [sessionId]);
  const hasReplay = strokes.length > 0;
  const decision = revealState?.myDecision ?? null;
  const outcome = revealState?.outcome ?? "pending";
  const revealThreadId = revealState?.threadId ?? null;
  const canRevealDecision =
    session?.status === "finished" &&
    !decision &&
    (revealState?.canOpenChat ?? true) &&
    outcome !== "blocked";
  const canOpenExistingChat = outcome === "open_open" && Boolean(revealThreadId);
  const revealLabel = getRevealLabel(outcome, tt);

  const navigateToThread = React.useCallback(
    (threadId: string, nextPeer: TogetherParticipantDto | null) => {
      if (!threadId || !nextPeer?.id) return;
      navigation.replace("DMChat", {
        threadId,
        peerId: nextPeer.id,
        peerName: nextPeer.displayName,
        backTarget: "history",
        sourceContext: {
          source: "together",
          sourceSessionId: sessionId,
          artworkSummary: {
            activity: "draw",
            strokeCount: strokes.length,
          },
        },
      });
    },
    [navigation, sessionId, strokes.length]
  );

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
        if (
          nextDecision === "open" &&
          nextRevealState.outcome === "open_open" &&
          nextRevealState.threadId
        ) {
          navigateToThread(nextRevealState.threadId, peer);
        }
      } catch {
        if (!mountedRef.current) return;
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
    [canRevealDecision, navigateToThread, peer, sessionId, submitting, tt]
  );

  const handleOpenChatPress = React.useCallback(() => {
    if (canOpenExistingChat && revealThreadId) {
      navigateToThread(revealThreadId, peer);
      return;
    }

    void submitDecision("open");
  }, [canOpenExistingChat, navigateToThread, peer, revealThreadId, submitDecision]);

  const goToDetail = React.useCallback(() => {
    if (!sessionId) return;
    navigation.navigate("PlaySessionDetail", { sessionId, focus: "replay" });
  }, [navigation, sessionId]);

  const startNewSession = React.useCallback(() => {
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  const screenTitle = tt("play.result.title", "Итог сессии");

  if (!sessionId) {
    return (
      <ScreenShell title={screenTitle} background="togetherStory" showBack onBack={handleBack}>
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
      <ScreenShell title={screenTitle} background="togetherStory" showBack onBack={handleBack}>
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
      <ScreenShell title={screenTitle} background="togetherStory" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("play.result.stateErrorTitle", "Итог временно недоступен")}
            body={loadError || tt("play.result.stateNotFoundBody", "Сессия уже исчезла или не успела сохраниться.")}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => navigation.replace("PlayResult", { sessionId }) }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (isTerminalClosedStatus(session.status)) {
    return (
      <ScreenShell title={screenTitle} background="togetherStory" showBack onBack={handleBack}>
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
    <ScreenShell title={screenTitle} background="togetherStory" showBack onBack={handleBack}>
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
                {tt("play.result.drawHeroTitle", "Ваш общий рисунок готов")}
              </Text>
            </View>
            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>{revealLabel}</Text>
            </View>
          </View>
          <Text style={styles.heroText}>{session.promptText}</Text>
          <Text style={styles.heroSubtext}>
            {tt(
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
              <Text style={styles.metaLabel}>{tt("play.result.strokeCount", "Штрихи")}</Text>
              <Text style={styles.metaValue}>{String(strokes.length)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.replayCard}>
          <Text style={styles.sectionTitle}>
            {tt("play.result.replayTitle", "Replay")}
          </Text>
          {hasReplay ? (
            <View style={styles.replayWrap}>
              <ReplayCanvasWebView strokes={strokes} autoplay showControls />
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {tt(
                "play.result.replayEmpty",
                "Replay появится для рисунков, созданных в этой сессии на текущем устройстве."
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
                  "play.result.bridgeDecisionDrawingNextBody",
                  "Если вы оба выберете открыть, этот результат приведёт в чат. Если нет, рисунок останется общей историей."
                )}
          </Text>
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
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
            <Pressable
              style={[
                styles.secondaryButton,
                submitting || !canRevealDecision ? styles.buttonDisabled : null,
              ]}
              onPress={() => void submitDecision("skip")}
              disabled={submitting || !canRevealDecision}
            >
              <Text style={styles.secondaryButtonText}>
                {tt("play.result.skipChat", "Оставить историей")}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.bottomActions}>
          <Pressable style={styles.outlineButton} onPress={goToDetail}>
            <Text style={styles.outlineButtonText}>
              {tt("play.result.openSharedStory", "Открыть общую историю")}
            </Text>
          </Pressable>
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
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
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
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryButtonText: {
    color: theme.colors.text,
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
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  outlineButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
