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
import type { Locale } from "@/i18n/translations";
import {
  type PlaySessionDetailRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import * as togetherApi from "@/services/api/togetherApi";
import type {
  TogetherEventDto,
  TogetherHistoryItem,
  TogetherRevealStateDto,
  StorySparksArtifactDto,
  TogetherSessionResponse,
} from "@/services/api/types";
import { markPlaySessionSeen } from "@/services/activityFreshness";
import {
  getRememberedTogetherSession,
  getTogetherPeer,
  getTogetherStrokes,
  rememberTogetherSession,
  replaceTogetherStrokesFromEvents,
} from "@/services/togetherCanvasState";
import { buildTogetherPaletteFromEvents } from "@/services/togetherPaletteState";
import {
  buildStoryArtifactFromEvents,
  localizeStoryText,
  storyArtifactToDmSummary,
} from "@/services/togetherStorySparksState";
import { theme } from "@/theme";

function formatDateTime(value: string) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function getOutcomeLabel(
  outcome: string,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  switch (outcome) {
    case "open_open":
      return tt("playDetail.outcomeOpen", "Чат открыт");
    case "open_skip":
      return tt("playDetail.outcomeMixed", "Осталось историей");
    case "skip_skip":
      return tt("playDetail.outcomeClosed", "Без чата");
    case "blocked":
      return tt("playDetail.outcomeBlocked", "Контакт недоступен");
    case "pending":
    default:
      return tt("playDetail.outcomeWaiting", "Ждём ответ");
  }
}

function isTerminalClosedStatus(status?: string | null) {
  return status === "abandoned" || status === "cancelled";
}

function getPaletteLabel(
  label: string,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  return tt(`play.colorMood.option.${label}`, label);
}

function revealStateFromHistoryItem(
  item: TogetherHistoryItem | null
): TogetherRevealStateDto | null {
  if (!item) return null;
  return {
    myDecision: item.myDecision ?? null,
    outcome: item.outcome,
    threadId: item.threadId ?? null,
    canOpenChat: item.canOpenChat === true,
    peerDecisionKnown: item.peerDecisionKnown === true,
  };
}

export default function PlaySessionDetailScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlaySessionDetail">>();
  const route = useRoute<PlaySessionDetailRouteProp>();
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
  const uid = authUser?.id ?? "";
  const remembered = React.useMemo(() => getRememberedTogetherSession(sessionId), [sessionId]);
  const [sessionResponse, setSessionResponse] = React.useState<TogetherSessionResponse | null>(remembered);
  const [historyItem, setHistoryItem] = React.useState<TogetherHistoryItem | null>(null);
  const [loading, setLoading] = React.useState(!remembered);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [openingChat, setOpeningChat] = React.useState(false);
  const [chatActionError, setChatActionError] = React.useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = React.useState<TogetherEventDto[]>([]);
  const [replayStrokes, setReplayStrokes] = React.useState(() =>
    getTogetherStrokes(sessionId)
  );
  const [reloadKey, setReloadKey] = React.useState(0);
  const mountedRef = React.useRef(true);
  const chatNavigationRef = React.useRef(false);

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
    setLoadError(null);
    setChatActionError(null);
    if (!sessionId) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(!remembered);
    setSessionEvents([]);
    setReplayStrokes(getTogetherStrokes(sessionId));
    chatNavigationRef.current = false;
    void Promise.all([
      togetherApi.getSession(sessionId),
      togetherApi.history(100),
      togetherApi.getSessionEvents(sessionId),
    ])
      .then(([session, history, sessionEvents]) => {
        if (!mountedRef.current) return;
        rememberTogetherSession(session);
        const backendStrokes =
          session.session.activity === "draw"
            ? replaceTogetherStrokesFromEvents(sessionId, sessionEvents.items)
            : [];
        setSessionResponse(session);
        setHistoryItem(history.items.find((item) => item.sessionId === sessionId) ?? null);
        setSessionEvents(sessionEvents.items);
        setReplayStrokes(backendStrokes);
        setLoading(false);
        void markPlaySessionSeen(sessionId);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadError(
          tt(
            "playDetail.errorBody",
            "Не удалось открыть эту совместную историю прямо сейчас. Попробуй еще раз."
          )
        );
        setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [remembered, reloadKey, sessionId, tt]);

  const session = sessionResponse?.session ?? null;
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const peerName =
    historyItem?.peer.displayName ||
    peer?.displayName?.trim() ||
    tt("profile.amoriaUser", "Пользователь Amoria");
  const revealState = sessionResponse?.revealState ?? revealStateFromHistoryItem(historyItem);
  const outcome = revealState?.outcome ?? "pending";
  const revealThreadId = revealState?.threadId ?? null;
  const sessionActivity =
    session?.activity === "story_sparks"
      ? "story_sparks"
      : session?.activity === "color_mood"
      ? "color_mood"
      : "draw";
  const palette = React.useMemo(
    () => buildTogetherPaletteFromEvents(sessionEvents),
    [sessionEvents]
  );
  const eventStoryArtifact = React.useMemo(
    () =>
      session?.activity === "story_sparks" && session.storyPack
        ? buildStoryArtifactFromEvents(sessionEvents, session.storyPack)
        : null,
    [session, sessionEvents]
  );
  const storyArtifact = eventStoryArtifact ?? historyItem?.storyArtifact ?? null;
  const storyDmSummary = React.useMemo(
    () => storyArtifactToDmSummary(storyArtifact, locale),
    [locale, storyArtifact]
  );
  const canRevealOpen =
    session?.status === "finished" &&
    revealState?.canOpenChat === true &&
    revealState.myDecision == null &&
    outcome !== "blocked";
  const canOpenExistingThread = outcome === "open_open" && Boolean(revealThreadId);
  const strokes = replayStrokes;
  const hasReplay = strokes.length > 0;
  const hasPalette = palette.length > 0;
  const hasStoryArtifact = Boolean(storyArtifact);
  const sessionClosed = isTerminalClosedStatus(session?.status ?? historyItem?.status);

  React.useEffect(() => {
    if (!sessionId || session?.status !== "finished") return;
    const shouldRefresh =
      outcome === "pending" || (outcome === "open_open" && !revealThreadId);
    if (!shouldRefresh) return;

    let cancelled = false;
    const refreshRevealState = async () => {
      try {
        const response = await togetherApi.getSession(sessionId);
        if (cancelled || !mountedRef.current) return;
        rememberTogetherSession(response);
        setSessionResponse(response);
      } catch {
        // The explicit retry state remains tied to the full detail load.
      }
    };

    const timer = setInterval(() => {
      void refreshRevealState();
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [outcome, revealThreadId, session?.status, sessionId]);

  const openChat = React.useCallback(async () => {
    if (sessionClosed || !peer?.id || chatNavigationRef.current) return;
    if (canOpenExistingThread && revealThreadId) {
      chatNavigationRef.current = true;
      setTimeout(() => {
        chatNavigationRef.current = false;
      }, 1200);
      navigation.navigate("DMChat", {
        threadId: revealThreadId,
        peerId: peer.id,
        peerName,
        backTarget: "sessionDetail",
        backSessionId: sessionId,
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
      return;
    }
    if (!canRevealOpen) return;

    setOpeningChat(true);
    setChatActionError(null);
    try {
      const response = await togetherApi.reveal(sessionId, "open");
      const nextRevealState = response.revealState;
      setSessionResponse((current) =>
        current ? { ...current, revealState: nextRevealState } : current
      );
      setHistoryItem((current) =>
        current
          ? {
              ...current,
              outcome: nextRevealState.outcome,
              myDecision: nextRevealState.myDecision,
              threadId: nextRevealState.threadId,
              canOpenChat: nextRevealState.canOpenChat,
              peerDecisionKnown: nextRevealState.peerDecisionKnown,
            }
          : current
      );
      if (nextRevealState.outcome !== "open_open" || !nextRevealState.threadId) {
        return;
      }
      chatNavigationRef.current = true;
      setTimeout(() => {
        chatNavigationRef.current = false;
      }, 1200);
      navigation.navigate("DMChat", {
        threadId: nextRevealState.threadId,
        peerId: peer.id,
        peerName,
        backTarget: "sessionDetail",
        backSessionId: sessionId,
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
    } catch {
      setChatActionError(
        tt(
          "playDetail.openChatFailed",
          "Не удалось открыть чат прямо сейчас. Попробуй ещё раз чуть позже."
        )
      );
    } finally {
      if (mountedRef.current) setOpeningChat(false);
    }
  }, [
    canOpenExistingThread,
    canRevealOpen,
    navigation,
    peer?.id,
    peerName,
    revealThreadId,
    sessionActivity,
    sessionClosed,
    sessionId,
    storyDmSummary,
    strokes.length,
    tt,
  ]);

  if (!sessionId) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title={tt("playDetail.missingTitle", "История не найдена")}
            body={tt("playDetail.missingBody", "Не удалось открыть историю без идентификатора сессии.")}
            primaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loading) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="albums-outline"
            title={tt("playDetail.loadingTitle", "Открываем историю")}
            body={tt(
              "playDetail.loadingBody",
              "Собираем общий результат, партнёра и контекст этой сессии."
            )}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadError || !session) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("playDetail.errorTitle", "История временно недоступна")}
            body={loadError || tt("playDetail.notFoundBody", "Эта история больше недоступна.")}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: tt("playDetail.backToHistory", "Вернуться к историям"), onPress: goToHistory }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={tt("playDetail.title", "Совместная история")}
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
          <Text style={styles.kicker}>{tt("playDetail.kicker", "Together")}</Text>
          <Text style={styles.title}>
            {sessionActivity === "story_sparks" && storyArtifact
              ? localizeStoryText(storyArtifact.title, locale)
              : session.promptText}
          </Text>
          <Text style={styles.body}>
            {sessionClosed
              ? tt("playDetail.interruptedBody", "Сессия была прервана. Чат по этой сессии недоступен.")
              : tt("playDetail.storyBody", "Общая история с {name}", { name: peerName })}
          </Text>
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner", "Партнёр")}</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.status", "Статус")}</Text>
              <Text style={styles.metaValue}>
                {sessionClosed
                  ? tt("playDetail.outcomeInterrupted", "Сессия прервана")
                  : getOutcomeLabel(outcome, tt)}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.createdAt", "Создано")}</Text>
              <Text style={styles.metaValue}>{formatDateTime(session.createdAt)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.replayCard}>
          <Text style={styles.sectionTitle}>
            {sessionActivity === "story_sparks"
              ? tt("playDetail.storyArtifactTitle", "Story card")
              : sessionActivity === "color_mood"
              ? tt("playDetail.paletteTitle", "Общая палитра")
              : tt("playDetail.replayTitle", "Replay")}
          </Text>
          {sessionActivity === "story_sparks" ? (
            hasStoryArtifact && storyArtifact ? (
              <StoryArtifactCard artifact={storyArtifact} locale={locale} />
            ) : (
              <Text style={styles.emptyText}>
                {tt("playDetail.storyEmpty", "Данные истории для этой сессии пока недоступны.")}
              </Text>
            )
          ) : sessionActivity === "color_mood" ? (
            hasPalette ? (
              <View style={styles.paletteRow}>
                {palette.map((selection) => (
                  <View key={`${selection.fromUserId}-${selection.id}`} style={styles.paletteItem}>
                    <View style={[styles.paletteSwatch, { backgroundColor: selection.color }]} />
                    <Text style={styles.paletteLabel}>{getPaletteLabel(selection.label, tt)}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.emptyText}>
                {tt(
                  "playDetail.paletteEmpty",
                  "Данные палитры для этой истории пока недоступны."
                )}
              </Text>
            )
          ) : hasReplay ? (
            <View style={styles.replayWrap}>
              <ReplayCanvasWebView strokes={strokes} autoplay={route.params.focus === "replay"} showControls />
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {tt(
                "playDetail.replayEmpty",
                "Replay для этой истории пока недоступен."
              )}
            </Text>
          )}
        </View>

        <View style={styles.bridgeCard}>
          <Text style={styles.sectionTitle}>
            {outcome === "open_open"
              ? sessionClosed
                ? tt("playDetail.bridgeInterruptedTitle", "Сессия была прервана")
                : tt("playDetail.bridgeChatReadyTitle", "Из этой истории уже можно вернуться в чат")
              : tt("playDetail.bridgeStoryOnlyTitle", "Эта история осталась вашим общим моментом")}
          </Text>
          <Text style={styles.body}>
            {sessionClosed
              ? tt(
                  "playDetail.bridgeInterruptedBody",
                  "Reveal и чат недоступны, потому что эта совместная сессия не была завершена."
                )
              : outcome === "blocked"
                ? tt(
                    "playDetail.bridgeBlockedBody",
                    "Контакт недоступен. Чат не может быть открыт из-за настроек безопасности."
                  )
              : outcome === "open_open"
              ? tt(
                  "playDetail.bridgeChatReadyBody",
                  "Эта история уже стала частью открытого чата. Отсюда можно сразу перейти в разговор."
                )
              : tt(
                  "playDetail.bridgeStoryOnlyBody",
                  "Контакт не перешёл в чат или ещё ждёт второго решения, но вся общая история остаётся здесь."
                )}
          </Text>
          {chatActionError ? <Text style={styles.errorText}>{chatActionError}</Text> : null}
          <View style={styles.actionRow}>
            {(canOpenExistingThread || canRevealOpen) && !sessionClosed ? (
              <Pressable
                style={[styles.primaryButton, openingChat ? styles.buttonDisabled : null]}
                onPress={() => void openChat()}
                disabled={openingChat}
              >
                <Text style={styles.primaryButtonText}>
                  {openingChat
                    ? tt("playDetail.openingChat", "Открываем…")
                    : canOpenExistingThread
                    ? tt("playDetail.openPrivateChat", "Открыть чат")
                    : tt("playDetail.chooseOpenChat", "Открыть чат")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.secondaryButton}
              onPress={() =>
                navigation.navigate("PlayMatch", {
                  activity: sessionActivity === "color_mood" ? "story_sparks" : sessionActivity,
                })
              }
            >
              <Text style={styles.secondaryButtonText}>
                {tt("playDetail.startAnotherSession", "Начать ещё одну совместную сессию")}
              </Text>
            </Pressable>
          </View>
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
    paddingBottom: 42,
    gap: 16,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    gap: 10,
    backgroundColor: "rgba(10, 13, 26, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  kicker: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  metaGrid: {
    gap: 10,
  },
  metaItem: {
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
  paletteRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  paletteItem: {
    minWidth: 112,
    flex: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  paletteSwatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  paletteLabel: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
    textTransform: "capitalize",
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
  errorText: {
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    gap: 10,
  },
  primaryButton: {
    minHeight: 50,
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
    minHeight: 48,
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
});
