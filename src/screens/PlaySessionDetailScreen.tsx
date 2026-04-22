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
  type PlaySessionDetailRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { markPlaySessionSeen } from "@/services/activityFreshness";
import {
  buildDmChatRouteParams,
  ensureDmThread,
  findDmThreadBySourceSessionId,
  subscribeDmThreads,
  type DmThreadDoc,
} from "@/services/dm";
import {
  getPlayActivityLabel,
  getPlayActivityMetricLabel,
  getPlayActivityStoryText,
  getPlayColorMoodChoices,
  getPlayColorMoodCombinedPalette,
  getPeerFromSession,
  getPlayRevealCopy,
  getPlayReplayCopy,
  getPlaySessionPrompt,
  playActivityUsesReplay,
  resolvePlayRevealOutcome,
  subscribePlayEvents,
  subscribePlaySession,
  type PlaySessionDoc,
  type PlayStrokeBatch,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

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

type StoryConnectionPrimaryIntent = "open_chat" | "start_new" | "open_profile";

type StoryConnectionCopy = {
  title: string;
  body: string;
  hint: string;
  primaryIntent: StoryConnectionPrimaryIntent;
  primaryLabel: string;
};

function getStoryConnectionCopy(options: {
  revealOutcome: ReturnType<typeof resolvePlayRevealOutcome>;
  canOpenChat: boolean;
  hasAccount: boolean;
  chatLookupError: string | null;
  tt: (key: string, fallback: string, params?: Record<string, string>) => string;
}): StoryConnectionCopy {
  const { canOpenChat, chatLookupError, hasAccount, revealOutcome, tt } = options;

  if (revealOutcome === "open_open") {
    if (!hasAccount) {
      return {
        title: tt("playDetail.bridgeChatNeedsAccountTitle", "Связь уже открылась из этой истории"),
        body: tt(
          "playDetail.bridgeChatNeedsAccountBody",
          "После этой общей истории контакт уже открылся и живёт в разделе «Связи». Чтобы перейти в личный разговор, сначала нужен активный аккаунт."
        ),
        hint: tt(
          "playDetail.bridgeChatNeedsAccountHint",
          "Сама история остаётся здесь как общий дом: после входа можно будет вернуться сюда, открыть связь и перейти в разговор."
        ),
        primaryIntent: "open_profile",
        primaryLabel: tt("common.openProfile", "Открыть профиль"),
      };
    }

    return {
      title: tt("playDetail.bridgeChatReadyTitle", "Из этой истории уже можно вернуться в разговор"),
      body: chatLookupError
        ? tt(
            "playDetail.bridgeChatReadyLookupBody",
            "Контакт уже открылся после этой общей истории и живёт в «Связях». Если разговор не подтянулся сразу, попробуй открыть его ещё раз отсюда."
          )
        : tt(
            "playDetail.bridgeChatReadyBody",
            "Эта история уже стала частью открытой связи. Отсюда можно сразу перейти в личный разговор или сначала открыть саму связь."
          ),
      hint: tt(
        "playDetail.bridgeChatReadyHint",
        "Даже когда вы уйдёте в разговор, replay, общий итог и контекст этой сессии останутся здесь."
      ),
      primaryIntent: "open_chat",
      primaryLabel: canOpenChat
        ? tt("playDetail.openPrivateChat", "Открыть личный разговор")
        : tt("playDetail.checkChatAgain", "Проверить разговор ещё раз"),
    };
  }

  if (revealOutcome === "waiting") {
    return {
      title: tt("playDetail.bridgeWaitingTitle", "История уже сохранена, связь ещё решается"),
      body: tt(
        "playDetail.bridgeWaitingBody",
        "Общая история уже осталась здесь. Если второй человек тоже откроет контакт, личный разговор появится как её продолжение."
      ),
      hint: tt(
        "playDetail.bridgeWaitingHint",
        "Пока можно спокойно оставить эту историю в архиве и вернуться во Вместе за новым общим опытом."
      ),
      primaryIntent: "start_new",
      primaryLabel: tt("playDetail.startAnotherSession", "Начать ещё одну совместную сессию"),
    };
  }

  return {
    title: tt("playDetail.bridgeStoryOnlyTitle", "Эта история осталась вашим общим моментом"),
    body: tt(
      "playDetail.bridgeStoryOnlyBody",
      "Контакт не перешёл в личный разговор, но вся общая история остаётся здесь: с replay, контекстом и итогом между вами."
    ),
    hint: tt(
      "playDetail.bridgeStoryOnlyHint",
      "Если хочешь ещё один шанс на продолжение, лучшее следующее действие — новая совместная сессия во Вместе."
    ),
    primaryIntent: "start_new",
    primaryLabel: tt("playDetail.startAnotherSession", "Начать ещё одну совместную сессию"),
  };
}

export default function PlaySessionDetailScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlaySessionDetail">>();
  const route = useRoute<PlaySessionDetailRouteProp>();
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const sessionId = route.params.sessionId.trim();
  const replayFocus = route.params.focus === "replay";
  const uid = auth?.currentUser?.uid ?? "";

  const [session, setSession] = React.useState<PlaySessionDoc | null>(null);
  const [events, setEvents] = React.useState<PlayStrokeBatch[]>([]);
  const [threads, setThreads] = React.useState<DmThreadDoc[]>([]);
  const [loadingSession, setLoadingSession] = React.useState(true);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [loadingThreads, setLoadingThreads] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [threadLookupError, setThreadLookupError] = React.useState<string | null>(null);
  const [chatActionError, setChatActionError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const [replayOpen, setReplayOpen] = React.useState(replayFocus);
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
    setChatActionError(null);

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
                  "Не удалось проверить, готов ли разговор. Попробуй открыть страницу еще раз."
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
    if (!sessionId || loadingSession || !session) return;
    void markPlaySessionSeen(sessionId);
  }, [loadingSession, session, sessionId]);

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
  const showDailyPrompt = session?.activity === "daily_prompt";
  const activityHasReplay = playActivityUsesReplay(session?.activity ?? "draw");
  const sessionPrompt = React.useMemo(() => getPlaySessionPrompt(session), [session]);
  const sessionPromptDisplay =
    sessionPrompt?.text?.trim() || tt("playDetail.pendingPrompt", "Prompt is still loading");
  const combinedPalette = React.useMemo(() => getPlayColorMoodCombinedPalette(session), [session]);
  const ownPalette = React.useMemo(() => getPlayColorMoodChoices(session, uid), [session, uid]);
  const peerPalette = React.useMemo(
    () => getPlayColorMoodChoices(session, peer?.uid ?? ""),
    [peer?.uid, session]
  );
  const replayStrokes = React.useMemo(() => mapReplayStrokes(events), [events]);
  const hasReplay = replayStrokes.length > 0;
  const revealOutcome = React.useMemo(
    () => (session ? resolvePlayRevealOutcome(session) : "waiting"),
    [session]
  );
  const revealCopy = React.useMemo(() => getPlayRevealCopy(revealOutcome), [revealOutcome]);
  const replayCopy = React.useMemo(
    () => getPlayReplayCopy(session?.activity ?? "draw"),
    [session?.activity]
  );
  const metricLabel = React.useMemo(
    () => getPlayActivityMetricLabel(session?.activity ?? "draw", "detail"),
    [session?.activity]
  );
  const metricValue =
    session?.activity === "color_mood"
      ? combinedPalette.length || ownPalette.length || peerPalette.length
      : totalStrokeCount;
  const canOpenChat = revealOutcome === "open_open" && Boolean(db && session && uid && peer?.uid);
  const isLoading = loadingSession || loadingEvents || loadingThreads;
  const sortAt = session?.endedAt ?? session?.startedAt ?? session?.createdAt ?? 0;
  const summaryItems = React.useMemo(
    () => [
      { label: tt("playDetail.activity", "Режим"), value: getPlayActivityLabel(session?.activity ?? "draw", "history") },
      { label: tt("playDetail.date", "Дата"), value: formatDateTime(sortAt) },
      { label: metricLabel, value: String(metricValue) },
    ],
    [metricLabel, metricValue, session?.activity, sortAt, tt]
  );
  const connectionCopy = React.useMemo(
    () =>
      getStoryConnectionCopy({
        revealOutcome,
        canOpenChat,
        hasAccount: Boolean(uid),
        chatLookupError: threadLookupError,
        tt,
      }),
    [canOpenChat, revealOutcome, threadLookupError, tt, uid]
  );
  const storyHomeText = React.useMemo(() => {
    if (revealOutcome === "open_open") {
      return tt(
        "playDetail.heroHomeTextOpen",
        "Эта страница хранит общий результат, replay и путь обратно в личный разговор. Связь уже открыта, а сама история остаётся её спокойной опорой."
      );
    }

    if (revealOutcome === "waiting") {
      return tt(
        "playDetail.heroHomeTextWaiting",
        "Эта страница уже удерживает общий итог вашей сессии. Если открытие станет взаимным, личный разговор вырастет именно из этой истории."
      );
    }

    return tt(
      "playDetail.heroHomeTextStoryOnly",
      "Даже без личного разговора общий момент не пропадает: здесь остаются итог, replay и весь контекст того, что между вами уже произошло."
    );
  }, [revealOutcome, tt]);
  const showConnectionsButton = revealOutcome === "open_open";

  const openChat = React.useCallback(() => {
    if (!db || !session || !uid || !peer?.uid) return;
    if (openChatPromiseRef.current) {
      void openChatPromiseRef.current;
      return;
    }

    if (mountedRef.current) {
      setChatActionError(null);
    }

    const task = (async () => {
      if (mountedRef.current) {
        setOpeningChat(true);
      }

      const threadId =
        detailThread?.id ??
        (await ensureDmThread(db, uid, peer.uid, {
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
        }));

      if (!mountedRef.current) return;
      navigation.push(
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
        setChatActionError(null);
      }
    })().catch(() => {
      if (mountedRef.current) {
        setChatActionError(
          tt(
            "playDetail.openChatFailed",
            "Не удалось открыть личный разговор прямо сейчас. Попробуй ещё раз чуть позже."
          )
        );
      }
    }).finally(() => {
      openChatPromiseRef.current = null;
      if (mountedRef.current) {
        setOpeningChat(false);
      }
    });

    openChatPromiseRef.current = task;
    void task;
  }, [db, detailThread?.id, navigation, peer?.uid, peerName, session, sessionId, totalStrokeCount, tt, uid]);

  const startNewSession = React.useCallback(() => {
    navigation.navigate("PlayMatch", { activity: session?.activity ?? "draw" });
  }, [navigation, session?.activity]);

  const openReplay = React.useCallback(() => {
    setReplayOpen((prev) => !prev);
  }, []);

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
            body={tt(
              "playDetail.missingBody",
              "Не удалось открыть страницу истории без идентификатора совместной сессии."
            )}
            primaryAction={{
              label: tt("playDetail.goToHistory", "Вернуться к историям"),
              onPress: goToHistory,
            }}
            secondaryAction={{
              label: tt("playDetail.goToTogether", "Вернуться во Вместе"),
              onPress: goToTogether,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!db) {
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
            body={tt(
              "playDetail.offlineBody",
              "Мы не смогли подключить эту общую историю прямо сейчас. Вернись назад или попробуй ещё раз позже."
            )}
            primaryAction={{
              label: tt("playDetail.goToHistory", "Вернуться к историям"),
              onPress: goToHistory,
            }}
            secondaryAction={{
              label: tt("playDetail.goToTogether", "Вернуться во Вместе"),
              onPress: goToTogether,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (isLoading) {
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
            title={tt("playDetail.title", "Совместная история")}
            body={tt("playDetail.loading", "Собираем страницу вашей совместной истории…")}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadError) {
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
            body={loadError}
            primaryAction={{
              label: tt("common.retry", "Повторить"),
              onPress: () => setReloadKey((prev) => prev + 1),
            }}
            secondaryAction={{
              label: tt("playDetail.goToHistory", "Вернуться к историям"),
              onPress: goToHistory,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!session) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="albums-outline"
            title={tt("playDetail.notFoundTitle", "Эта история больше недоступна")}
            body={tt(
              "playDetail.notFoundBody",
              "Документ совместной сессии не найден. Можно вернуться к общим историям или начать новую сессию."
            )}
            primaryAction={{
              label: tt("playDetail.goToHistory", "Вернуться к историям"),
              onPress: goToHistory,
            }}
            secondaryAction={{
              label: tt("playDetail.goToTogether", "Вернуться во Вместе"),
              onPress: goToTogether,
            }}
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
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroHeaderText}>
              <Text style={styles.heroKicker}>
                {tt("playDetail.heroKicker", "Постоянный дом этой истории")}
              </Text>
              <Text style={styles.heroTitle}>{peerName}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                revealOutcome === "open_open"
                  ? styles.statusBadgePrimary
                  : revealOutcome === "waiting"
                    ? styles.statusBadgeNeutral
                    : styles.statusBadgeMuted,
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeText,
                  revealOutcome === "open_open"
                    ? styles.statusBadgeTextPrimary
                    : revealOutcome === "waiting"
                      ? styles.statusBadgeTextNeutral
                      : styles.statusBadgeTextMuted,
                ]}
              >
                {revealCopy.shortLabel}
              </Text>
            </View>
          </View>
          <Text style={styles.heroText}>
            {getPlayActivityStoryText(session.activity, sessionPrompt?.text)}
          </Text>
          <Text style={styles.heroSupportText}>{storyHomeText}</Text>
          {showDailyPrompt ? (
            <View style={styles.contextPill}>
              <Text style={styles.contextLabel}>
                {tt("playDetail.topicLabel", "Prompt")}
              </Text>
              <Text style={styles.contextText}>{sessionPromptDisplay}</Text>
            </View>
          ) : null}
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner", "Partner")}</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            {summaryItems.map((item) => (
              <View key={item.label} style={styles.metaItem}>
                <Text style={styles.metaLabel}>{item.label}</Text>
                <Text style={styles.metaValue}>{item.value}</Text>
              </View>
            ))}
          </View>
        </View>

        <PlayModeContextCard
          activity={session.activity}
          promptText={sessionPrompt?.text}
          combinedPalette={combinedPalette}
          ownPalette={ownPalette}
          peerPalette={peerPalette}
          peerTitle={tt("playDetail.peerPaletteTitle", "Other person's colors")}
          compact
          surface="detail"
        />

        {activityHasReplay ? (
          <View style={styles.replayBlock}>
            <View style={styles.replayHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.replayTitle}>{replayCopy.title}</Text>
                <Text style={styles.replayText}>{replayCopy.body}</Text>
              </View>
              <Pressable onPress={openReplay} style={styles.replayToggle}>
                <Text style={styles.replayToggleText}>
                  {replayOpen
                    ? tt("playDetail.hideReplay", "Скрыть replay")
                    : tt("playDetail.openReplay", "Показать replay")}
                </Text>
              </Pressable>
            </View>
            {showDailyPrompt ? (
              <View style={styles.contextPill}>
                <Text style={styles.contextLabel}>
                  {tt("playDetail.topicLabel", "Prompt")}
                </Text>
                <Text style={styles.contextText}>{sessionPromptDisplay}</Text>
              </View>
            ) : null}

            {replayOpen ? (
              hasReplay ? (
                <ReplayCanvasWebView
                  key={`${sessionId}_${replayStrokes.length}`}
                  strokes={replayStrokes}
                  autoplay
                  speed={1.25}
                  showControls
                />
              ) : (
                <View style={styles.emptyReplayCard}>
                  <Text style={styles.emptyReplayTitle}>{replayCopy.emptyTitle}</Text>
                  <Text style={styles.emptyReplayText}>{replayCopy.emptyBody}</Text>
                </View>
              )
            ) : null}
          </View>
        ) : null}

        <View style={styles.actionCard}>
          <Text style={styles.actionEyebrow}>
            {tt("playDetail.actionEyebrowCoreLoop", "Что эта история значит для связи сейчас")}
          </Text>
          <Text style={styles.actionTitle}>{connectionCopy.title}</Text>
          <Text style={styles.actionText}>{connectionCopy.body}</Text>
          {chatActionError ? <Text style={styles.actionErrorText}>{chatActionError}</Text> : null}
          <Pressable
            onPress={
              connectionCopy.primaryIntent === "open_chat"
                ? openChat
                : connectionCopy.primaryIntent === "open_profile"
                  ? () => navigation.navigate("Profile")
                  : startNewSession
            }
            style={styles.primaryButton}
            disabled={connectionCopy.primaryIntent === "open_chat" ? openingChat : false}
          >
            <Text style={styles.primaryButtonText}>
              {connectionCopy.primaryIntent === "open_chat" && openingChat
                ? tt("connections.openingChat", "Открываем разговор…")
                : connectionCopy.primaryLabel}
            </Text>
          </Pressable>
          <Text style={styles.actionHint}>{connectionCopy.hint}</Text>
          <View style={styles.actionRow}>
            <Pressable onPress={goToHistory} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {tt("playDetail.allStories", "Все общие истории")}
              </Text>
            </Pressable>
            {showConnectionsButton ? (
              <Pressable onPress={goToConnections} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>
                  {tt("playDetail.openConnection", "Открытая связь")}
                </Text>
              </Pressable>
            ) : (
              <Pressable onPress={goToTogether} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>
                  {tt("playDetail.goToTogether", "Вернуться во Вместе")}
                </Text>
              </Pressable>
            )}
          </View>
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
  heroCard: {
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(13, 18, 34, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  heroHeader: {
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
    letterSpacing: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "800",
  },
  heroText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  heroSupportText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
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
    minWidth: "46%",
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  metaLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  actionCard: {
    padding: 16,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(11, 16, 30, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  actionEyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.9,
    textTransform: "uppercase",
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
  actionHint: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionErrorText: {
    color: theme.colors.danger,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
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
  emptyReplayCard: {
    padding: 16,
    borderRadius: theme.shapes.cardInner,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 8,
  },
  emptyReplayTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  emptyReplayText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
