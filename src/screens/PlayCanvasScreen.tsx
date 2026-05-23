import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  type EventArg,
  useNavigation,
  useRoute,
} from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import SharedCanvasWebView, {
  type SharedCanvasStroke,
} from "@/components/play/SharedCanvasWebView";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayCanvasRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import * as togetherApi from "@/services/api/togetherApi";
import {
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import type {
  TogetherSessionResponse,
  TogetherSessionStatus,
} from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import {
  getTogetherPeer,
  getTogetherStrokes,
  rememberLocalTogetherStrokes,
  rememberTogetherEvent,
  rememberTogetherSession,
  replaceTogetherStrokesFromEvents,
  type TogetherEventDto,
} from "@/services/togetherCanvasState";
import {
  getTogetherPromptKey,
  localizeTogetherPrompt,
} from "@/services/togetherPromptLocalization";
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

function buildClientEventId(userId: string) {
  return `${userId || "local"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readTogetherEvent(payload: wsClient.RealtimeMessage): TogetherEventDto | null {
  if (payload.type !== "together.event") return null;
  const event = payload.event && typeof payload.event === "object" ? payload.event : null;
  if (!event) return null;
  return event as TogetherEventDto;
}

type TogetherSessionUpdatedMessage = {
  sessionId: string;
  session: TogetherSessionResponse;
  reason?: string;
  actorUserId?: string;
};

function readTogetherSessionUpdate(
  payload: wsClient.RealtimeMessage
): TogetherSessionUpdatedMessage | null {
  if (payload.type !== "together.session.updated") return null;
  const session = payload.session && typeof payload.session === "object" ? payload.session : null;
  if (!session || !("session" in session)) return null;

  return {
    sessionId: String(payload.sessionId ?? ""),
    session: session as TogetherSessionResponse,
    reason: typeof payload.reason === "string" ? payload.reason : undefined,
    actorUserId: typeof payload.actorUserId === "string" ? payload.actorUserId : undefined,
  };
}

function isTerminalClosedStatus(status?: TogetherSessionStatus | string | null) {
  return status === "abandoned" || status === "cancelled";
}

export default function PlayCanvasScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayCanvas">>();
  const route = useRoute<PlayCanvasRouteProp>();
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
  const [sessionResponse, setSessionResponse] = React.useState<TogetherSessionResponse | null>(null);
  const [strokes, setStrokes] = React.useState<SharedCanvasStroke[]>(() =>
    getTogetherStrokes(sessionId)
  );
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [finishing, setFinishing] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [strokeError, setStrokeError] = React.useState("");
  const [drawingStarted, setDrawingStarted] = React.useState(false);
  const [tick, setTick] = React.useState(Date.now());
  const [canvasRevision, setCanvasRevision] = React.useState(0);
  const [closedActorUserId, setClosedActorUserId] = React.useState<string | null>(null);
  const mountedRef = React.useRef(true);
  const navigationHandledRef = React.useRef(false);
  const allowExitRef = React.useRef(false);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
  const leavePromiseRef = React.useRef<Promise<void> | null>(null);

  const goToTogether = React.useCallback(() => {
    try {
      navigation.navigate("Tabs", { screen: "Together" });
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "PlayCanvasScreen",
        action: "exitTogetherSession",
        step: "navigationFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          sessionIdExists: Boolean(sessionId),
        },
      });
    }
  }, [navigation, sessionId]);

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

  const startNewSession = React.useCallback(() => {
    allowExitRef.current = true;
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  React.useEffect(() => {
    mountedRef.current = true;
    navigationHandledRef.current = false;
    allowExitRef.current = false;
    finishPromiseRef.current = null;
    leavePromiseRef.current = null;
    setLoading(true);
    setLoadError("");
    setFinishing(false);
    setLeaving(false);
    setStrokeError("");
    setDrawingStarted(false);
    setTick(Date.now());
    setCanvasRevision((value) => value + 1);
    setClosedActorUserId(null);
    setStrokes(getTogetherStrokes(sessionId));

    if (!uid || !sessionId) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    void togetherApi
      .getSession(sessionId)
      .then((response) => {
        if (!mountedRef.current) return;
        if (response.session.activity === "story_sparks") {
          allowExitRef.current = true;
          navigation.replace("PlayStorySparks", { sessionId });
          return;
        }
        if (response.session.activity !== "draw") {
          setLoadError(
            tt(
              "play.unsupportedOldSession",
              "Эта старая сессия больше недоступна в текущей версии."
            )
          );
          setLoading(false);
          return;
        }
        rememberTogetherSession(response);
        setSessionResponse(response);
        setLoading(false);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadError(
          tt(
            "play.canvas.connectError",
            "Не получилось подключить совместную сессию. Попробуй открыть её ещё раз."
          )
        );
        setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [sessionId, tt, uid]);

  const session = sessionResponse?.session ?? null;
  const participants = sessionResponse?.participants ?? [];
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const peerName = peer?.displayName?.trim() || tt("profile.amoriaUser", "Пользователь Amoria");
  const totalStrokeCount = strokes.length;
  const localizedPrompt = localizeTogetherPrompt(session, tt);
  const promptKey = getTogetherPromptKey(session);
  const promptHints = React.useMemo(() => {
    if (!promptKey) {
      return [
        tt("play.canvas.hint.shape", "форма"),
        tt("play.canvas.hint.place", "место"),
        tt("play.canvas.hint.mood", "настроение"),
      ];
    }

    return [0, 1, 2].map((index) =>
      tt(`play.promptHint.${promptKey}.${index}`, tt("play.canvas.hint.free", "идея"))
    );
  }, [promptKey, tt]);
  const createdAtMs = session?.createdAt ? Date.parse(session.createdAt) : Date.now();
  const drawRemaining = React.useMemo(() => {
    const elapsed = Math.floor((tick - createdAtMs) / 1000);
    return Math.max(DRAW_SESSION_DURATION_SEC - elapsed, 0);
  }, [createdAtMs, tick]);

  React.useEffect(() => {
    if (session?.status !== "active") return;
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.status]);

  const openResultScreen = React.useCallback(() => {
    if (!mountedRef.current || navigationHandledRef.current || !sessionId) return;
    navigationHandledRef.current = true;
    allowExitRef.current = true;
    navigation.replace("PlayResult", { sessionId });
  }, [navigation, sessionId]);

  const applySessionResponse = React.useCallback(
    (response: TogetherSessionResponse, actorUserId?: string) => {
      rememberTogetherSession(response);
      if (!mountedRef.current) return;
      setSessionResponse(response);
      if (actorUserId) {
        setClosedActorUserId(actorUserId);
      }

      if (response.session.status === "finished") {
        openResultScreen();
      } else if (isTerminalClosedStatus(response.session.status)) {
        setDrawingStarted(true);
        if (actorUserId && actorUserId === uid) {
          allowExitRef.current = true;
          goToTogether();
        }
      }
    },
    [goToTogether, openResultScreen, uid]
  );

  React.useEffect(() => {
    if (!uid || !sessionId) return;
    let alive = true;
    wsClient.connect();
    wsClient.subscribeTogetherSession(sessionId);
    const unsubscribe = wsClient.onMessage((payload) => {
      if (!alive) return;
      if (String(payload.sessionId ?? "") !== sessionId) return;
      const sessionUpdate = readTogetherSessionUpdate(payload);
      if (sessionUpdate) {
        applySessionResponse(sessionUpdate.session, sessionUpdate.actorUserId);
        return;
      }

      const event = readTogetherEvent(payload);
      if (!event) return;
      setStrokes(rememberTogetherEvent(sessionId, event));
    });

    return () => {
      alive = false;
      unsubscribe();
      wsClient.unsubscribeTogetherSession(sessionId);
    };
  }, [applySessionResponse, sessionId, uid]);

  React.useEffect(() => {
    if (!uid || !sessionId || session?.status !== "active" || !drawingStarted) return;

    let cancelled = false;
    const refreshBackendEvents = async () => {
      try {
        const response = await togetherApi.getSessionEvents(sessionId);
        if (cancelled || !mountedRef.current) return;
        setStrokes(replaceTogetherStrokesFromEvents(sessionId, response.items));
      } catch {
        // Stroke submission errors already surface through the active drawing path.
      }
    };

    const timer = setInterval(() => {
      void refreshBackendEvents();
    }, 8000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [drawingStarted, session?.status, sessionId, uid]);

  const completeSession = React.useCallback(async () => {
    if (!sessionId) {
      openResultScreen();
      return;
    }
    if (finishPromiseRef.current) {
      await finishPromiseRef.current;
      return;
    }

    const task = (async () => {
      if (mountedRef.current) setFinishing(true);
      if (session?.status === "active") {
        const response = await togetherApi.finish(sessionId);
        applySessionResponse(response, uid);
        return;
      }
      openResultScreen();
    })().finally(() => {
      finishPromiseRef.current = null;
      if (mountedRef.current) setFinishing(false);
    });

    finishPromiseRef.current = task;
    await task.catch(() => {
      if (!mountedRef.current) return;
      setStrokeError(
        tt(
          "play.canvas.finishFailed",
          "Не удалось завершить сессию. Проверь подключение и попробуй ещё раз."
        )
      );
    });
  }, [applySessionResponse, openResultScreen, session?.status, sessionId, tt, uid]);

  const leaveSessionAndExit = React.useCallback(async () => {
    if (!sessionId) {
      goToTogether();
      return;
    }
    if (leavePromiseRef.current) {
      await leavePromiseRef.current;
      return;
    }

    const task = (async () => {
      if (mountedRef.current) setLeaving(true);
      try {
        const response = await togetherApi.leave(sessionId);
        applySessionResponse(response, uid);
      } catch (error) {
        const safeError = sanitizeErrorForReport(error);
        reportClientError({
          screen: "PlayCanvasScreen",
          action: "exitTogetherSession",
          step: "leaveFailed",
          code: safeError.code,
          message: safeError.message,
          stack: safeError.stack,
          metadata: {
            sessionIdExists: Boolean(sessionId),
            status: session?.status ?? null,
          },
        });
        if (mountedRef.current) {
          Alert.alert(
            tt("play.togetherExit.leaveFailedTitle", "Выходим в меню"),
            tt(
              "play.togetherExit.leaveFailedBody",
              "Не удалось подтвердить выход на сервере. Мы вернём вас в основное меню, а сессию можно проверить позже."
            )
          );
        }
      }
      allowExitRef.current = true;
      goToTogether();
    })().finally(() => {
      leavePromiseRef.current = null;
      if (mountedRef.current) setLeaving(false);
    });

    leavePromiseRef.current = task;
    await task;
  }, [applySessionResponse, goToTogether, session?.status, sessionId, tt, uid]);

  React.useEffect(() => {
    if (!uid || !sessionId || session?.status !== "active" || finishing || leaving) return;

    let cancelled = false;
    const sendHeartbeat = async () => {
      try {
        const response = await togetherApi.heartbeat(sessionId);
        if (!cancelled) {
          applySessionResponse(response);
        }
      } catch {
        if (!cancelled && mountedRef.current) {
          setStrokeError(
            tt(
              "play.canvas.heartbeatFailed",
              "Связь с совместной сессией нестабильна. Новые штрихи могут не сохраниться."
            )
          );
        }
      }
    };

    const timer = setInterval(() => {
      void sendHeartbeat();
    }, 12000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [applySessionResponse, finishing, leaving, session?.status, sessionId, tt, uid]);

  React.useEffect(() => {
    if (!session) return;
    if (session.status === "finished") {
      openResultScreen();
    } else if (isTerminalClosedStatus(session.status)) {
      setDrawingStarted(true);
    }
  }, [openResultScreen, session]);

  React.useEffect(() => {
    if (session?.status !== "active") return;
    if (drawRemaining > 0) return;
    void completeSession();
  }, [completeSession, drawRemaining, session?.status]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener(
      "beforeRemove",
      (event: EventArg<"beforeRemove", true, undefined>) => {
        if (allowExitRef.current || navigationHandledRef.current) return;
        if (session?.status !== "active") return;

        event.preventDefault();
        Alert.alert(
          tt("play.canvas.leaveTitle", "Выйти из сессии?"),
          tt(
            "play.canvas.leaveBody",
            "Если выйти сейчас, совместная сессия завершится для обоих."
          ),
          [
            { text: tt("common.stay", "Остаться"), style: "cancel" },
            {
              text: tt("common.exit", "Выйти"),
              style: "destructive",
              onPress: () => {
                void leaveSessionAndExit();
              },
            },
          ]
        );
      }
    );

    return unsubscribe;
  }, [leaveSessionAndExit, navigation, session?.status, tt]);

  const handleCanvasBack = React.useCallback(() => {
    if (session?.status !== "active") {
      handleSafeBack();
      return;
    }
    Alert.alert(
      tt("play.canvas.leaveTitle", "Выйти из сессии?"),
      tt(
        "play.canvas.leaveBody",
        "Если выйти сейчас, совместная сессия завершится для обоих."
      ),
      [
        { text: tt("common.stay", "Остаться"), style: "cancel" },
        {
          text: tt("common.exit", "Выйти"),
          style: "destructive",
          onPress: () => {
            void leaveSessionAndExit();
          },
        },
      ]
    );
  }, [handleSafeBack, leaveSessionAndExit, session?.status, tt]);

  const handleLocalBatch = React.useCallback(
    async (localStrokes: SharedCanvasStroke[]) => {
      if (!uid || !sessionId || session?.status !== "active" || finishing || leaving) return;

      const clientEventId = buildClientEventId(uid);
      const payload = {
        uid,
        strokes: localStrokes.map((stroke) => ({
          id: stroke.id,
          color: stroke.color,
          width: stroke.width,
          points: stroke.points.map((point, index) => ({
            x: clampNormalizedCoordinate(point.x),
            y: clampNormalizedCoordinate(point.y),
            t: index,
          })),
        })),
      };

      setStrokeError("");
      try {
        const response = await togetherApi.sendEvent(sessionId, {
          clientEventId,
          type: "stroke_batch",
          payload,
        });
        if (!mountedRef.current) return;
        if (response.created) {
          setStrokes(rememberLocalTogetherStrokes(sessionId, uid, clientEventId, localStrokes));
        }
      } catch {
        if (!mountedRef.current) return;
        setStrokes(getTogetherStrokes(sessionId));
        setCanvasRevision((value) => value + 1);
        setStrokeError(
          tt(
            "play.canvas.strokeFailed",
            "Штрих не сохранился на сервере. Холст вернулся к последнему подтверждённому состоянию."
          )
        );
      }
    },
    [finishing, leaving, session?.status, sessionId, tt, uid]
  );

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

  if (!uid || !sessionId) {
    return (
      <ScreenShell
        title={tt("play.canvas.title", "Совместная сессия")}
        background="nightCity"
        showBack
        onBack={handleSafeBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("play.canvas.guardAuthTitle", "Не удалось открыть сессию")}
            body={tt("play.canvas.guardAuthBody", "Чтобы войти в совместный холст, нужен активный аккаунт.")}
            primaryAction={{ label: tt("common.openProfile", "Открыть профиль"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleSafeBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loading) {
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

  if (loadError || !session) {
    return (
      <ScreenShell
        title={tt("play.canvas.title", "Совместная сессия")}
        background="nightCity"
        showBack
        onBack={handleSafeBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("play.canvas.guardErrorTitle", "Подключение прервалось")}
            body={loadError || tt("play.canvas.guardNotFoundBody", "Сессия больше недоступна.")}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: retryCanvasEntry }}
            secondaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (isTerminalClosedStatus(session.status)) {
    const closedByPartner = Boolean(closedActorUserId && closedActorUserId !== uid);
    return (
      <ScreenShell
        title={tt("play.canvas.title", "Совместная сессия")}
        background="nightCity"
        showBack
        onBack={goToTogether}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="exit-outline"
            title={
              closedByPartner
                ? tt("play.canvas.partnerLeftTitle", "Партнёр вышел из сессии")
                : tt("play.canvas.sessionInterruptedTitle", "Сессия была прервана")
            }
            body={tt(
              "play.canvas.sessionInterruptedBody",
              "Совместная сессия завершена. Итог и чат по этой сессии недоступны."
            )}
            primaryAction={{
              label: tt("common.backToTogether", "Вернуться во Вместе"),
              onPress: goToTogether,
            }}
            secondaryAction={{
              label: tt("play.canvas.findNewPartner", "Найти нового партнёра"),
              onPress: startNewSession,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!drawingStarted && session.status === "active") {
    return (
      <ScreenShell
        title={tt("play.canvas.title", "Совместная сессия")}
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
            <Text style={styles.previewTitle}>{localizedPrompt}</Text>
            <Text style={styles.previewBody}>
              {tt(
                "play.canvas.previewBody",
                "Посмотрите на задание. Холст откроется чистым, а рисунок останется вашим общим ответом."
              )}
            </Text>
            <View style={styles.hintRow}>
              {promptHints.map((hint) => (
                <View key={hint} style={styles.hintChip}>
                  <Text style={styles.hintChipText}>{hint}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.sessionCard}>
            <Ionicons name="people-outline" size={22} color="#FFE0B8" />
            <View style={styles.sessionCardText}>
              <Text style={styles.sessionCardTitle}>
                {tt("play.canvas.partnerTitle", "Вы рисуете вместе")}
              </Text>
              <Text style={styles.sessionCardBody}>
                {tt("play.canvas.partnerBody", "Партнёр: {name}", { name: peerName })}
              </Text>
            </View>
          </View>

          {strokeError ? <Text style={styles.previewError}>{strokeError}</Text> : null}

          <Pressable
            style={styles.primaryButton}
            onPress={() => setDrawingStarted(true)}
          >
            <Text style={styles.primaryButtonText}>
              {tt("play.canvas.openCanvas", "Открыть холст")}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.exitButton, leaving ? styles.buttonDisabled : null]}
            onPress={() => void leaveSessionAndExit()}
            disabled={leaving}
            accessibilityRole="button"
          >
            <Text style={styles.exitButtonText}>
              {leaving
                ? tt("common.exiting", "Выходим…")
                : tt("common.backToMainTabs", "Вернуться в меню")}
            </Text>
          </Pressable>
        </ScrollView>
      </ScreenShell>
    );
  }

  const timerValue = formatRemaining(drawRemaining);
  const canvasDisabled = session.status !== "active" || finishing || leaving;

  return (
    <ScreenShell
      title={tt("play.canvas.title", "Совместная сессия")}
      background="nightCity"
      showBack
      onBack={handleCanvasBack}
    >
      <View style={styles.fullscreenWrap}>
        <View style={styles.fullscreenHeader}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerKicker}>
              {tt("play.canvas.challengeStripLabel", "Вызов")}
            </Text>
            <Text style={styles.headerTitle} numberOfLines={2}>
              {localizedPrompt}
            </Text>
            <Text style={styles.headerPeer} numberOfLines={1}>
              {participants.length > 1
                ? tt("play.canvas.partnerBody", "Партнёр: {name}", { name: peerName })
                : tt("play.canvas.waitingPeer", "Партнёр подключается")}
            </Text>
          </View>
          <View style={styles.timerPill}>
            <Text style={styles.timerLabel}>
              {tt("play.canvas.timerRemaining", "Осталось")}
            </Text>
            <Text style={styles.timerValue}>{timerValue}</Text>
          </View>
        </View>

        <SharedCanvasWebView
          key={`${sessionId}-${canvasRevision}`}
          localUid={uid}
          strokes={strokes}
          onLocalStrokeBatch={handleLocalBatch}
          disabled={canvasDisabled}
          disabledTitle={
            finishing || leaving
              ? tt("play.canvas.disabledFinishingTitle", "Завершаем сессию")
              : tt("play.canvas.disabledClosedTitle", "Холст закрыт")
          }
          disabledBody={
            finishing || leaving
              ? tt("play.canvas.disabledFinishingBody", "Сейчас сохраняем состояние совместной сессии.")
              : undefined
          }
          fullscreen
          toolLabels={canvasToolLabels}
        />

        <View style={styles.footerBar}>
          <View style={styles.footerTextWrap}>
            <Text style={styles.footerText}>
              {tt("play.canvas.strokeCount", "Штрихов: {count}", {
                count: String(totalStrokeCount),
              })}
            </Text>
            {strokeError ? <Text style={styles.footerError}>{strokeError}</Text> : null}
          </View>
          <View style={styles.footerActions}>
            <Pressable
              style={[styles.finishButton, finishing || leaving ? styles.buttonDisabled : null]}
              onPress={() => void completeSession()}
              disabled={finishing || leaving}
            >
              <Text style={styles.finishButtonText}>
                {finishing
                  ? tt("play.canvas.finishing", "Завершаем…")
                  : leaving
                    ? tt("common.exiting", "Выходим…")
                  : tt("common.finish", "Завершить")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.footerExitButton, finishing || leaving ? styles.buttonDisabled : null]}
              onPress={() => void leaveSessionAndExit()}
              disabled={finishing || leaving}
              accessibilityRole="button"
            >
              <Text style={styles.footerExitButtonText}>
                {tt("common.backToMainTabs", "Вернуться в меню")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
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
  scroll: {
    flex: 1,
  },
  previewContent: {
    padding: 18,
    paddingBottom: 36,
    gap: 16,
  },
  previewCard: {
    borderRadius: theme.shapes.card,
    padding: 20,
    gap: 10,
    backgroundColor: "rgba(10, 13, 26, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  previewEyebrow: {
    color: "#FFE0B8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  previewTitle: {
    color: theme.colors.text,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "800",
  },
  previewBody: {
    color: theme.colors.subtext,
    fontSize: 15,
    lineHeight: 21,
  },
  hintRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  hintChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "rgba(255, 224, 184, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 224, 184, 0.22)",
  },
  hintChipText: {
    color: "#FFE0B8",
    fontSize: 12,
    fontWeight: "800",
  },
  sessionCard: {
    flexDirection: "row",
    gap: 12,
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sessionCardText: {
    flex: 1,
    gap: 4,
  },
  sessionCardTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sessionCardBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  previewError: {
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 54,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "800",
  },
  exitButton: {
    minHeight: 52,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  exitButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  fullscreenWrap: {
    flex: 1,
    backgroundColor: "#080A12",
  },
  fullscreenHeader: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "rgba(8,10,18,0.94)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  headerTextWrap: {
    flex: 1,
  },
  headerKicker: {
    color: "#FFE0B8",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  headerPeer: {
    color: theme.colors.subtext,
    fontSize: 12,
    marginTop: 2,
  },
  timerPill: {
    minWidth: 82,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  timerLabel: {
    color: theme.colors.subtext,
    fontSize: 10,
    fontWeight: "700",
  },
  timerValue: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  footerBar: {
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    backgroundColor: "rgba(8,10,18,0.96)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
  },
  footerTextWrap: {
    flex: 1,
    gap: 3,
  },
  footerActions: {
    minWidth: 154,
    gap: 8,
  },
  footerText: {
    color: theme.colors.subtext,
    fontSize: 13,
    fontWeight: "700",
  },
  footerError: {
    color: "#FFB4B4",
    fontSize: 11,
    lineHeight: 15,
  },
  finishButton: {
    minHeight: 36,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  finishButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  footerExitButton: {
    minHeight: 36,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  footerExitButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
