import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  type EventArg,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import SharedCanvasWebView, {
  type SharedCanvasStroke,
} from "@/components/play/SharedCanvasWebView";
import {
  getDrawExampleVisual,
  type DrawExampleVisual,
} from "@/assets/play/drawExamples";
import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayCanvasRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import {
  advanceChainDrawTurn,
  appendStrokeBatch,
  ensureChainDrawTurnState,
  finishPlaySession,
  getPlayCanvasModeCopy,
  getChainDrawTurnState,
  getPlayActivityLabel,
  getPlaySessionPrompt,
  subscribePlayEvents,
  subscribePlaySession,
  type PlaySessionDoc,
  type PlayStroke,
  type PlayStrokeBatch,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

const DRAW_SESSION_DURATION_SEC = 420;

function formatRemaining(totalSec: number) {
  const value = Math.max(totalSec, 0);
  const minutes = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function clampNormalizedCoordinate(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function mapBatchStroke(batch: PlayStrokeBatch): SharedCanvasStroke[] {
  return batch.strokes.map((stroke) => ({
    id: stroke.id,
    uid: batch.uid,
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => ({
      x: point.x,
      y: point.y,
    })),
  }));
}

type GuardState = {
  icon?: React.ComponentProps<typeof CoreStateCard>["icon"];
  title: string;
  body: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
};

export default function PlayCanvasScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayCanvas">>();
  const route = useRoute<PlayCanvasRouteProp>();
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
  const [loadingSession, setLoadingSession] = React.useState(true);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [finishing, setFinishing] = React.useState(false);
  const [passingTurn, setPassingTurn] = React.useState(false);
  const [drawingStarted, setDrawingStarted] = React.useState(false);
  const [tick, setTick] = React.useState(Date.now());
  const mountedRef = React.useRef(true);
  const navigationHandledRef = React.useRef(false);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
  const advanceTurnPromiseRef = React.useRef<Promise<void> | null>(null);
  const allowExitRef = React.useRef(false);

  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const handleSafeBack = React.useCallback(() => {
    allowExitRef.current = true;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    goToTogether();
  }, [goToTogether, navigation]);

  const retryCanvasEntry = React.useCallback(() => {
    if (!sessionId) {
      goToTogether();
      return;
    }
    allowExitRef.current = true;
    navigation.replace("PlayCanvas", { sessionId });
  }, [goToTogether, navigation, sessionId]);

  React.useEffect(() => {
    mountedRef.current = true;
    navigationHandledRef.current = false;
    allowExitRef.current = false;
    finishPromiseRef.current = null;
    advanceTurnPromiseRef.current = null;
    setSession(null);
    setEvents([]);
    setLoadingSession(true);
    setLoadingEvents(true);
    setLoadError("");
    setFinishing(false);
    setPassingTurn(false);
    setDrawingStarted(false);
    setTick(Date.now());

    if (!db || !uid || !sessionId) {
      setLoadingSession(false);
      setLoadingEvents(false);
      return () => {
        mountedRef.current = false;
      };
    }

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
            "play.canvas.connectError",
            "Не получилось подключить совместную сессию. Попробуй открыть ее еще раз."
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
            "play.canvas.eventsError",
            "Мы не смогли загрузить общий холст целиком. Попробуй переподключиться."
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
  }, [sessionId, tt, uid]);

  const allStrokes = React.useMemo(
    () => events.flatMap((batch) => mapBatchStroke(batch)),
    [events]
  );

  const totalStrokeCount = React.useMemo(
    () => events.reduce((sum, batch) => sum + batch.strokes.length, 0),
    [events]
  );

  const chainTurnState = React.useMemo(
    () => (session ? getChainDrawTurnState(session) : null),
    [session]
  );
  const isChainDraw = session?.activity === "chain_draw";
  const isMyTurn = !isChainDraw || chainTurnState?.currentTurnUid === uid;
  const activityLabel = React.useMemo(
    () => getPlayActivityLabel(session?.activity ?? "draw", "neutral"),
    [session?.activity]
  );
  const sessionPrompt = React.useMemo(() => getPlaySessionPrompt(session), [session]);
  const promptContext = sessionPrompt?.text?.trim() ?? "";
  const showPromptContext = Boolean(
    promptContext && (session?.activity === "draw" || session?.activity === "daily_prompt")
  );
  const sessionPromptDisplay =
    promptContext || tt("playDetail.pendingPrompt", "Тема уточняется");
  const challengeStripLabel = tt("play.canvas.challengeStripLabel", "Вызов");
  const isMainDrawSession = session?.activity === "draw";
  const showDrawPreview =
    isMainDrawSession && session?.status === "active" && !drawingStarted;
  const showFullscreenDraw =
    isMainDrawSession && session?.status === "active" && drawingStarted;
  const drawExampleVisuals = React.useMemo(() => {
    const exampleIds =
      sessionPrompt && "exampleVisuals" in sessionPrompt
        ? sessionPrompt.exampleVisuals ?? []
        : [];
    return exampleIds
      .map((exampleId) => getDrawExampleVisual(exampleId))
      .filter((visual): visual is DrawExampleVisual => Boolean(visual))
      .slice(0, 3);
  }, [sessionPrompt]);
  const canvasToolLabels = React.useMemo(
    () => ({
      colors: tt("play.canvas.toolColors", "Цвета"),
      brush: tt("play.canvas.toolBrush", "Толщина линии"),
      colorNames: [
        tt("play.canvas.toolColorRose", "Розовый"),
        tt("play.canvas.toolColorOrange", "Оранжевый"),
        tt("play.canvas.toolColorYellow", "Жёлтый"),
        tt("play.canvas.toolColorGreen", "Зелёный"),
        tt("play.canvas.toolColorBlue", "Голубой"),
        tt("play.canvas.toolColorViolet", "Фиолетовый"),
        tt("play.canvas.toolColorWhite", "Белый"),
        tt("play.canvas.toolColorDark", "Тёмный"),
      ],
      brushSizes: [
        tt("play.canvas.toolBrushSmall", "Тонко"),
        tt("play.canvas.toolBrushMedium", "Средне"),
        tt("play.canvas.toolBrushLarge", "Широко"),
      ],
    }),
    [tt]
  );

  const openResultScreen = React.useCallback(() => {
    if (!mountedRef.current || navigationHandledRef.current || !sessionId) return;
    navigationHandledRef.current = true;
    allowExitRef.current = true;
    navigation.replace("PlayResult", { sessionId });
  }, [navigation, sessionId]);

  const completeSession = React.useCallback(async () => {
    if (!db || !sessionId) {
      openResultScreen();
      return;
    }
    if (finishPromiseRef.current) {
      await finishPromiseRef.current;
      return;
    }

    const task = (async () => {
      if (mountedRef.current) {
        setFinishing(true);
      }

      if (session?.status === "active") {
        try {
          await finishPlaySession(db, sessionId, totalStrokeCount);
        } catch {}
      }

      openResultScreen();
    })().finally(() => {
      finishPromiseRef.current = null;
      if (mountedRef.current) {
        setFinishing(false);
      }
    });

    finishPromiseRef.current = task;
    try {
      await task;
    } catch {}
  }, [db, openResultScreen, session?.status, sessionId, totalStrokeCount]);

  React.useEffect(() => {
    if (!session) return;
    if (session.activity === "color_mood") {
      if (!mountedRef.current || navigationHandledRef.current || !sessionId) return;
      navigationHandledRef.current = true;
      allowExitRef.current = true;
      navigation.replace("PlayColorMood", { sessionId });
      return;
    }
    if (session.status === "finished" || session.status === "revealed") {
      openResultScreen();
    }
  }, [navigation, openResultScreen, session, sessionId]);

  React.useEffect(() => {
    if (session?.status !== "active") return;
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.status]);

  React.useEffect(() => {
    if (!db || !sessionId || session?.activity !== "chain_draw" || session.status !== "active") {
      return;
    }

    const needsTurnRepair =
      !session.turnOrder?.length ||
      !session.currentTurnUid ||
      session.turnIndex == null ||
      session.turnDurationSec == null ||
      session.maxTurns == null ||
      session.turnStartedAt == null;

    if (!needsTurnRepair) return;
    void ensureChainDrawTurnState(db, sessionId);
  }, [
    db,
    session?.activity,
    session?.currentTurnUid,
    session?.maxTurns,
    session?.status,
    session?.turnDurationSec,
    session?.turnIndex,
    session?.turnOrder,
    session?.turnStartedAt,
    sessionId,
  ]);

  const drawRemaining = React.useMemo(() => {
    if (!session?.startedAt) return DRAW_SESSION_DURATION_SEC;
    const elapsed = Math.floor((tick - session.startedAt) / 1000);
    return Math.max(DRAW_SESSION_DURATION_SEC - elapsed, 0);
  }, [session?.startedAt, tick]);

  const turnRemaining = React.useMemo(() => {
    if (!chainTurnState) return 0;
    const elapsed = Math.floor((tick - chainTurnState.turnStartedAt) / 1000);
    return Math.max(chainTurnState.turnDurationSec - elapsed, 0);
  }, [chainTurnState, tick]);

  const advanceTurn = React.useCallback(async () => {
    if (
      !db ||
      !sessionId ||
      !session ||
      session.activity !== "chain_draw" ||
      session.status !== "active" ||
      !chainTurnState
    ) {
      return;
    }

    if (advanceTurnPromiseRef.current) {
      await advanceTurnPromiseRef.current;
      return;
    }

    const task = (async () => {
      if (mountedRef.current) {
        setPassingTurn(true);
      }

      const result = await advanceChainDrawTurn(db, sessionId, {
        expectedTurnIndex: chainTurnState.turnIndex,
        expectedCurrentTurnUid: chainTurnState.currentTurnUid,
        resultStrokeCount: totalStrokeCount,
      });

      if (result.state === "finished") {
        openResultScreen();
      }
    })().finally(() => {
      advanceTurnPromiseRef.current = null;
      if (mountedRef.current) {
        setPassingTurn(false);
      }
    });

    advanceTurnPromiseRef.current = task;
    try {
      await task;
    } catch {}
  }, [chainTurnState, db, openResultScreen, session, sessionId, totalStrokeCount]);

  React.useEffect(() => {
    if (!session || session.status !== "active" || isChainDraw) return;
    if (drawRemaining > 0) return;
    void completeSession();
  }, [completeSession, drawRemaining, isChainDraw, session]);

  React.useEffect(() => {
    if (!chainTurnState || !session || session.status !== "active") return;
    if (turnRemaining > 0) return;
    void advanceTurn();
  }, [advanceTurn, chainTurnState, session, turnRemaining]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: EventArg<"beforeRemove", true, undefined>) => {
      if (allowExitRef.current || navigationHandledRef.current) return;
      if (session?.status !== "active") return;

      event.preventDefault();
      Alert.alert(
        tt("play.canvas.leaveTitle", "Завершить сессию?"),
        tt(
          "play.canvas.leaveBody",
          "Если выйти сейчас, мы мягко завершим общий рисунок и сразу откроем итог."
        ),
        [
          { text: tt("common.stay", "Остаться"), style: "cancel" },
          {
            text: tt("common.finish", "Завершить"),
            style: "destructive",
            onPress: () => {
              void completeSession();
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [completeSession, navigation, session?.status, tt]);

  const handleCanvasBack = React.useCallback(() => {
    if (session?.status !== "active") {
      handleSafeBack();
      return;
    }
    Alert.alert(
      tt("play.canvas.leaveTitle", "Завершить сессию?"),
      tt(
        "play.canvas.leaveBody",
        "Если выйти сейчас, мы мягко завершим общий рисунок и сразу откроем итог."
      ),
      [
        { text: tt("common.stay", "Остаться"), style: "cancel" },
        {
          text: tt("common.finish", "Завершить"),
          style: "destructive",
          onPress: () => {
            void completeSession();
          },
        },
      ]
    );
  }, [completeSession, handleSafeBack, session?.status, tt]);

  const handleLocalBatch = React.useCallback(
    async (strokes: SharedCanvasStroke[]) => {
      if (
        !db ||
        !uid ||
        !sessionId ||
        session?.status !== "active" ||
        finishing ||
        passingTurn ||
        (session?.activity === "chain_draw" && chainTurnState?.currentTurnUid !== uid)
      ) {
        return;
      }

      const payload: PlayStroke[] = strokes.map((stroke) => ({
        id: stroke.id,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((point, index) => ({
          x: clampNormalizedCoordinate(point.x),
          y: clampNormalizedCoordinate(point.y),
          t: index,
        })),
      }));

      try {
        await appendStrokeBatch(db, sessionId, uid, payload);
      } catch {}
    },
    [
      chainTurnState?.currentTurnUid,
      db,
      finishing,
      passingTurn,
      session?.activity,
      session?.status,
      sessionId,
      uid,
    ]
  );

  const partnerId = React.useMemo(() => {
    return session?.participantIds.find((participantId) => participantId !== uid) ?? "";
  }, [session?.participantIds, uid]);

  const partnerName =
    session?.participantNicknames?.[partnerId] ?? makeNickname(partnerId || "peer");
  const turnCounterLabel = chainTurnState
    ? `${Math.min(chainTurnState.turnIndex + 1, chainTurnState.maxTurns)} / ${chainTurnState.maxTurns}`
    : "";
  const currentTurnLabel = !chainTurnState
    ? ""
    : chainTurnState.currentTurnUid === uid
      ? tt("play.canvas.currentTurnMine", "Твой ход")
      : tt("play.canvas.currentTurnPartner", "Ход партнера");
  const currentTurnName = !chainTurnState
    ? ""
    : chainTurnState.currentTurnUid === uid
      ? tt("play.canvas.currentTurnMineLong", "Сейчас рисуешь ты")
      : tt("play.canvas.currentTurnPartnerLong", "Сейчас рисует {name}", {
          name: partnerName,
        });

  const sessionPhaseCopy = React.useMemo(
    () =>
      getPlayCanvasModeCopy({
        activity: session?.activity ?? "draw",
        status: session?.status,
        promptText: sessionPrompt?.text,
        isMyTurn,
        currentTurnName,
      }),
    [currentTurnName, isMyTurn, session?.activity, session?.status, sessionPrompt?.text]
  );

  const timerTitle = isChainDraw
    ? tt("play.canvas.timerTurn", "Время хода")
    : tt("play.canvas.timerRemaining", "Осталось");
  const timerValue = formatRemaining(isChainDraw ? turnRemaining : drawRemaining);
  const canvasDisabled = session?.status !== "active" || finishing || passingTurn || !isMyTurn;
  const canvasDisabledTitle =
    finishing
      ? tt("play.canvas.disabledFinishingTitle", "Завершаем сессию")
      : passingTurn
        ? tt("play.canvas.disabledPassingTitle", "Передаем ход")
        : isChainDraw && !isMyTurn
          ? tt("play.canvas.currentTurnPartner", "Ход партнера")
          : tt("play.canvas.disabledClosedTitle", "Холст закрыт");
  const canvasDisabledBody =
    finishing
      ? tt("play.canvas.disabledFinishingBody", "Сейчас откроем итог вашей совместной сессии.")
      : passingTurn
        ? tt("play.canvas.disabledPassingBody", "Холст синхронизируется и откроется на следующем ходу.")
        : isChainDraw && !isMyTurn
          ? tt(
              "play.canvas.disabledPartnerTurnBody",
              "{name} сейчас рисует. Холст откроется тебе на следующем ходе.",
              { name: partnerName }
            )
          : undefined;
  const helperText = sessionPhaseCopy.helperText;

  const guardState = React.useMemo<GuardState | null>(() => {
    if (!uid) {
      return {
        icon: "person-circle-outline",
        title: tt("play.canvas.guardAuthTitle", "Не удалось открыть сессию"),
        body: tt("play.canvas.guardAuthBody", "Чтобы войти в совместный холст, нужен активный аккаунт."),
        primaryLabel: tt("common.openProfile", "Открыть профиль"),
        primaryAction: () => navigation.navigate("Profile"),
        secondaryLabel: tt("common.back", "Назад"),
        secondaryAction: handleSafeBack,
      };
    }

    if (!db) {
      return {
        icon: "cloud-offline-outline",
        title: tt("play.canvas.guardOfflineTitle", "Холст пока недоступен"),
        body: tt(
          "play.canvas.guardOfflineBody",
          "Мы не смогли подготовить подключение к сессии. Вернись назад или открой Together заново позже."
        ),
        primaryLabel: tt("common.backToTogether", "Вернуться во Вместе"),
        primaryAction: goToTogether,
        secondaryLabel: tt("common.back", "Назад"),
        secondaryAction: handleSafeBack,
      };
    }

    if (!sessionId) {
      return {
        icon: "alert-circle-outline",
        title: tt("play.canvas.guardMissingTitle", "Сессия не найдена"),
        body: tt(
          "play.canvas.guardMissingBody",
          "Не получилось открыть совместный холст без контекста сессии. Вернись во Вместе и начни заново."
        ),
        primaryLabel: tt("common.backToTogether", "Вернуться во Вместе"),
        primaryAction: goToTogether,
        secondaryLabel: tt("common.back", "Назад"),
        secondaryAction: handleSafeBack,
      };
    }

    if (loadError) {
      return {
        icon: "cloud-offline-outline",
        title: tt("play.canvas.guardErrorTitle", "Подключение прервалось"),
        body: loadError,
        primaryLabel: tt("common.retry", "Повторить"),
        primaryAction: retryCanvasEntry,
        secondaryLabel: tt("common.backToTogether", "Вернуться во Вместе"),
        secondaryAction: goToTogether,
      };
    }

    if (!loadingSession && !loadingEvents && !session) {
      return {
        icon: "albums-outline",
        title: tt("play.canvas.guardNotFoundTitle", "Сессия больше недоступна"),
        body: tt(
          "play.canvas.guardNotFoundBody",
          "Она уже завершилась или была закрыта. Можно спокойно вернуться и начать новую."
        ),
        primaryLabel: tt("common.backToTogether", "Вернуться во Вместе"),
        primaryAction: goToTogether,
        secondaryLabel: tt("common.back", "Назад"),
        secondaryAction: handleSafeBack,
      };
    }

    return null;
  }, [goToTogether, handleSafeBack, loadError, loadingEvents, loadingSession, navigation, retryCanvasEntry, session, sessionId, tt, uid]);

  if (guardState) {
    return (
      <ScreenShell
        title={tt("play.canvas.title", "Совместная сессия")}
        background="nightCity"
        showBack
        onBack={handleSafeBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon={guardState.icon}
            title={guardState.title}
            body={guardState.body}
            primaryAction={{
              label: guardState.primaryLabel,
              onPress: guardState.primaryAction,
            }}
            secondaryAction={
              guardState.secondaryLabel && guardState.secondaryAction
                ? {
                    label: guardState.secondaryLabel,
                    onPress: guardState.secondaryAction,
                  }
                : undefined
            }
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadingSession || loadingEvents) {
    return (
      <ScreenShell
        title={tt("play.canvas.title", "Совместная сессия")}
        background="nightCity"
        showBack
        onBack={handleSafeBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="brush-outline"
            title={tt("play.canvas.loadingTitle", "Подключаем общий холст")}
            body={tt(
              "play.canvas.loadingBody",
              "Сессия уже готовится. Еще пара секунд, и вы окажетесь в одном пространстве."
            )}
          />
        </View>
      </ScreenShell>
    );
  }

  if (showDrawPreview) {
    return (
      <ScreenShell
        title={activityLabel}
        background="nightCity"
        showBack
        onBack={handleCanvasBack}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.previewContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.previewCard}>
            <Text style={styles.previewEyebrow}>
              {tt("play.canvas.previewEyebrow", "Вызов")}
            </Text>
            <Text style={styles.previewTitle}>{sessionPromptDisplay}</Text>
            <Text style={styles.previewBody}>
              {tt(
                "play.canvas.previewBody",
                "Посмотрите на задание и пару визуальных идей. Холст откроется чистым, а рисунок останется вашим общим ответом."
              )}
            </Text>
          </View>

          <View style={styles.previewExamplesCard}>
            <Text style={styles.previewSectionTitle}>
              {tt("play.canvas.previewExamplesTitle", "Идеи для рисунка")}
            </Text>
            {drawExampleVisuals.length ? (
              <View style={styles.exampleVisualGrid}>
                {drawExampleVisuals.map((visual) => (
                  <View key={visual.id} style={styles.exampleVisualCard}>
                    <View style={styles.exampleIconWrap}>
                      <Ionicons
                        name={visual.icon}
                        size={32}
                        color={theme.colors.text}
                      />
                      {visual.secondaryIcon ? (
                        <View style={styles.exampleSecondaryIcon}>
                          <Ionicons
                            name={visual.secondaryIcon}
                            size={16}
                            color={theme.colors.accent}
                          />
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.exampleVisualLabel} numberOfLines={2}>
                      {tt(visual.labelKey, visual.fallback)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.exampleFallback}>
                <Text style={styles.exampleFallbackTitle}>
                  {tt("play.canvas.previewFallbackTitle", "Идеи появятся здесь")}
                </Text>
                <Text style={styles.exampleFallbackBody}>
                  {tt(
                    "play.canvas.previewFallbackBody",
                    "Начните с формы, места, настроения или смешной детали. Этого достаточно для первого штриха."
                  )}
                </Text>
              </View>
            )}
            <Text style={styles.previewInspirationNote}>
              {tt(
                "play.canvas.previewInspirationNote",
                "Это только идеи. Рисуйте по-своему."
              )}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={() => setDrawingStarted(true)}
            style={styles.startDrawingButton}
          >
            <Text style={styles.startDrawingText}>
              {tt("play.canvas.startDrawing", "Начать рисовать")}
            </Text>
          </Pressable>
        </ScrollView>
      </ScreenShell>
    );
  }

  if (showFullscreenDraw) {
    return (
      <ScreenShell
        title={activityLabel}
        background="nightCity"
        showHeader={false}
      >
        <View style={styles.drawingRoot}>
          <View style={styles.drawingTopBar}>
            <View style={styles.drawingPromptContent}>
              <Text style={styles.drawingTopLabel}>{challengeStripLabel}</Text>
              <Text style={styles.drawingPromptText} numberOfLines={2}>
                {sessionPromptDisplay}
              </Text>
            </View>
            <View style={styles.drawingTimerPill}>
              <Text style={styles.drawingTimerLabel}>{timerTitle}</Text>
              <Text style={styles.drawingTimerText}>{timerValue}</Text>
            </View>
          </View>

          <SharedCanvasWebView
            localUid={uid}
            strokes={allStrokes}
            disabled={canvasDisabled}
            disabledTitle={canvasDisabledTitle}
            disabledBody={canvasDisabledBody}
            fullscreen
            toolLabels={canvasToolLabels}
            toolbarAccessory={
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDrawingStarted(false)}
                  style={styles.toolbarSecondaryButton}
                >
                  <Text style={styles.toolbarSecondaryText}>
                    {tt("play.canvas.backToIdeas", "Вернуться к идеям")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={finishing}
                  onPress={() => void completeSession()}
                  style={[
                    styles.toolbarFinishButton,
                    finishing ? styles.finishButtonDisabled : null,
                  ]}
                >
                  <Text style={styles.toolbarFinishText}>
                    {finishing
                      ? tt("play.canvas.finishing", "Завершаем…")
                      : tt("play.canvas.finishDrawing", "Завершить")}
                  </Text>
                </Pressable>
              </>
            }
            onLocalStrokeBatch={handleLocalBatch}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={session ? activityLabel : tt("play.canvas.title", "Совместная сессия")}
      background="nightCity"
      showBack
      onBack={handleCanvasBack}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroTextWrap}>
              <Text style={styles.heroEyebrow}>{sessionPhaseCopy.eyebrow}</Text>
              <Text style={styles.heroTitle}>{sessionPhaseCopy.title}</Text>
              <Text style={styles.heroBody}>{sessionPhaseCopy.body}</Text>
            </View>
            <View style={styles.timerPill}>
              <Text style={styles.timerLabel}>{timerTitle}</Text>
              <Text style={styles.timerText}>{timerValue}</Text>
            </View>
          </View>

          <View style={styles.metaGrid}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>{tt("playDetail.activity", "Режим")}</Text>
              <Text style={styles.metaValue}>{activityLabel}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner", "Партнёр")}</Text>
              <Text style={styles.metaValue}>{partnerName}</Text>
            </View>
            {isChainDraw ? (
              <>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{tt("play.canvas.metaCurrent", "Сейчас")}</Text>
                  <Text style={styles.metaValue}>{currentTurnLabel}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{tt("play.canvas.metaTurn", "Ход")}</Text>
                  <Text style={styles.metaValue}>{turnCounterLabel}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{tt("play.canvas.metaTotalStrokes", "Общих штрихов")}</Text>
                  <Text style={styles.metaValue}>{totalStrokeCount}</Text>
                </View>
              </>
            ) : showPromptContext ? (
              <>
                <View style={[styles.metaCard, styles.metaCardWide]}>
                  <Text style={styles.metaLabel}>
                    {tt("play.canvas.metaChallenge", "Творческий вызов")}
                  </Text>
                  <Text style={styles.metaValue}>{sessionPromptDisplay}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{tt("play.canvas.metaFormat", "Формат")}</Text>
                  <Text style={styles.metaValue}>
                    {tt("play.canvas.formatChallenge", "Один общий ответ")}
                  </Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{tt("play.canvas.metaTotalStrokes", "Общих штрихов")}</Text>
                  <Text style={styles.metaValue}>{totalStrokeCount}</Text>
                </View>
              </>
            ) : (
              <>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{tt("play.canvas.metaFormat", "Формат")}</Text>
                  <Text style={styles.metaValue}>{tt("play.canvas.formatFree", "Свободный ритм")}</Text>
                </View>
                <View style={styles.metaCard}>
                  <Text style={styles.metaLabel}>{tt("play.canvas.metaTotalStrokes", "Общих штрихов")}</Text>
                  <Text style={styles.metaValue}>{totalStrokeCount}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {showPromptContext ? (
          <View style={styles.challengeStrip}>
            <Text style={styles.challengeStripLabel}>{challengeStripLabel}</Text>
            <Text style={styles.challengeStripText}>{sessionPromptDisplay}</Text>
          </View>
        ) : null}

        <SharedCanvasWebView
          localUid={uid}
          strokes={allStrokes}
          disabled={canvasDisabled}
          disabledTitle={canvasDisabledTitle}
          disabledBody={canvasDisabledBody}
          toolLabels={canvasToolLabels}
          onLocalStrokeBatch={handleLocalBatch}
        />

        <View style={styles.footerRow}>
          <View style={styles.footerCopy}>
            <Text style={styles.helper}>{helperText}</Text>
            {!isChainDraw ? (
              <Text style={styles.finishHint}>
                {tt(
                  "play.canvas.finishHint",
                  "Если общий ответ уже сложился, можно завершить раньше и перейти к итогу."
                )}
              </Text>
            ) : null}
          </View>
          {isChainDraw ? (
            isMyTurn && session?.status === "active" ? (
              <Pressable
                disabled={passingTurn || finishing}
                onPress={() => void advanceTurn()}
                style={[
                  styles.finishButton,
                  (passingTurn || finishing) && styles.finishButtonDisabled,
                ]}
              >
                <Text style={styles.finishText}>
                  {passingTurn
                    ? tt("play.canvas.passing", "Передаем…")
                    : tt("play.canvas.passTurn", "Передать ход")}
                </Text>
              </Pressable>
            ) : null
          ) : (
            <Pressable
              disabled={finishing}
              onPress={() => void completeSession()}
              style={[styles.finishButton, finishing ? styles.finishButtonDisabled : null]}
            >
              <Text style={styles.finishText}>
                {finishing
                  ? tt("play.canvas.finishing", "Завершаем…")
                  : tt("play.canvas.finishEarly", "Завершить и показать итог")}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  previewContent: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  previewCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(17, 20, 36, 0.92)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  previewEyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  previewTitle: {
    color: theme.colors.text,
    fontSize: 23,
    lineHeight: 28,
    fontWeight: "900",
  },
  previewBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  previewExamplesCard: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(8, 12, 24, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    gap: 12,
  },
  previewSectionTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  exampleVisualGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  exampleVisualCard: {
    flex: 1,
    minWidth: "30%",
    minHeight: 92,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 7,
  },
  exampleIconWrap: {
    width: 48,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  exampleSecondaryIcon: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.16)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.28)",
  },
  exampleVisualLabel: {
    minHeight: 30,
    color: theme.colors.subtext,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  exampleFallback: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 6,
  },
  exampleFallbackTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  exampleFallbackBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  previewInspirationNote: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  startDrawingButton: {
    minHeight: 52,
    borderRadius: theme.shapes.cardInner,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    paddingVertical: 15,
    backgroundColor: theme.colors.primary,
  },
  startDrawingText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    textAlign: "center",
  },
  drawingRoot: {
    flex: 1,
    gap: 6,
  },
  drawingTopBar: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: "rgba(7, 11, 21, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  drawingPromptContent: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  drawingTopLabel: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  drawingPromptText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  drawingTimerPill: {
    minWidth: 78,
    alignItems: "center",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: theme.colors.accentSoft,
  },
  drawingTimerLabel: {
    color: theme.colors.muted,
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  drawingTimerText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "900",
  },
  toolbarSecondaryButton: {
    flexGrow: 1,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.09)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  toolbarSecondaryText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  toolbarFinishButton: {
    flexGrow: 2,
    minHeight: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: theme.colors.primary,
  },
  toolbarFinishText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    textAlign: "center",
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(17, 20, 36, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 14,
  },
  heroHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  heroTextWrap: {
    flex: 1,
    gap: 8,
  },
  heroEyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  metaCard: {
    minWidth: "47%",
    flexGrow: 1,
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 6,
  },
  metaCardWide: {
    minWidth: "100%",
  },
  metaLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  timerPill: {
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 2,
    minWidth: 92,
    alignItems: "center",
  },
  timerLabel: {
    color: theme.colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  timerText: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  helper: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  finishHint: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 17,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  footerRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
  },
  footerCopy: {
    flex: 1,
    minWidth: 220,
    gap: 4,
  },
  challengeStrip: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: "rgba(255, 122, 60, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.24)",
    gap: 4,
  },
  challengeStripLabel: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  challengeStripText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "800",
  },
  finishButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: theme.colors.primary,
  },
  finishButtonDisabled: {
    opacity: 0.7,
  },
  finishText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
