import React from "react";
import {
  Alert,
  AppState,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  type EventArg,
  useIsFocused,
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
  TurnBasedMomentDto,
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
import { shouldRenewPartnerLease } from "@/services/togetherTurnBasedFlow";
import { theme } from "@/theme";
import { getTogetherPromptArt } from "@/assets/together/promptArt";

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
  const { t, locale } = useLocale();
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const tt = React.useCallback(
    (key: string, params?: Record<string, string>) => t(key, params),
    [t]
  );

  const sessionId = route.params.sessionId.trim();
  const isTurnBased = route.params.mode === "turn_based";
  const momentId = route.params.momentId;
  const isFocused = useIsFocused();
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
  const [focusMode, setFocusMode] = React.useState(false);
  const [toolPaletteVisible, setToolPaletteVisible] = React.useState(false);
  const [tick, setTick] = React.useState(Date.now());
  const [canvasRevision, setCanvasRevision] = React.useState(0);
  const [closedActorUserId, setClosedActorUserId] = React.useState<string | null>(null);
  const [canvasLoadFailed, setCanvasLoadFailed] = React.useState(false);
  const [turnBasedMoment, setTurnBasedMoment] = React.useState<TurnBasedMomentDto | null>(null);
  const [appActive, setAppActive] = React.useState(AppState.currentState === "active");
  const mountedRef = React.useRef(true);
  const navigationHandledRef = React.useRef(false);
  const allowExitRef = React.useRef(false);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
  const leavePromiseRef = React.useRef<Promise<void> | null>(null);
  const reportedCanvasFailuresRef = React.useRef<Set<string>>(new Set());
  const heartbeatFailureCountRef = React.useRef(0);
  const reportedUnexpectedTerminalRef = React.useRef(false);

  const reportUnexpectedTerminal = React.useCallback((
    response: TogetherSessionResponse,
    actorUserId?: string
  ) => {
    if (
      reportedUnexpectedTerminalRef.current ||
      allowExitRef.current ||
      actorUserId === uid
    ) {
      return;
    }
    reportedUnexpectedTerminalRef.current = true;
    reportClientError({
      screen: "PlayCanvasScreen",
      action: "observeTogetherInterruption",
      step: "unexpectedTerminalSession",
      message: "Together draw session became terminal before completion",
      metadata: {
        sessionIdPresent: Boolean(sessionId),
        activity: response.session.activity,
        status: response.session.status,
        appState: AppState.currentState,
        websocketState: wsClient.getConnectionState(),
        actorUserIdPresent: Boolean(actorUserId),
        localActor: actorUserId === uid,
      },
    });
  }, [sessionId, uid]);

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

  const enterFocusMode = React.useCallback(() => {
    setFocusMode(true);
    setToolPaletteVisible(false);
  }, []);

  const exitFocusMode = React.useCallback(() => {
    setFocusMode(false);
    setToolPaletteVisible(false);
  }, []);

  const toggleToolPalette = React.useCallback(() => {
    setToolPaletteVisible((value) => !value);
  }, []);

  const reportCanvasFailure = React.useCallback((
    step: string,
    message: string,
    error?: unknown,
    extraMetadata: Record<string, unknown> = {}
  ) => {
    const reportKey = `${step}:${message}`;
    if (reportedCanvasFailuresRef.current.has(reportKey)) return;
    reportedCanvasFailuresRef.current.add(reportKey);

    const safeError = error ? sanitizeErrorForReport(error) : null;
    reportClientError({
      screen: "PlayCanvasScreen",
      action: "drawTogether",
      step,
      code: safeError?.code,
      message: safeError?.message ?? message,
      stack: safeError?.stack,
      metadata: {
        momentId: isTurnBased ? momentId ?? null : null,
        sessionId,
        stage: turnBasedMoment?.stage ?? "draw",
        status: turnBasedMoment?.status ?? sessionResponse?.session.status ?? null,
        action: turnBasedMoment?.action ?? "draw",
        role: turnBasedMoment?.role ?? null,
        isMyTurn: turnBasedMoment?.isMyTurn ?? null,
        ...extraMetadata,
      },
    });
  }, [isTurnBased, momentId, sessionId, sessionResponse?.session.status, turnBasedMoment]);

  const retryCanvasEntry = React.useCallback(() => {
    if (!sessionId) {
      goToTogether();
      return;
    }
    allowExitRef.current = true;
    navigation.replace("PlayCanvas", {
      sessionId,
      ...(isTurnBased ? { mode: "turn_based", momentId } : {}),
    });
  }, [goToTogether, isTurnBased, momentId, navigation, sessionId]);

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
    heartbeatFailureCountRef.current = 0;
    reportedUnexpectedTerminalRef.current = false;
    setLoading(true);
    setLoadError("");
    setFinishing(false);
    setLeaving(false);
    setStrokeError("");
    setDrawingStarted(false);
    setFocusMode(false);
    setToolPaletteVisible(false);
    setTick(Date.now());
    setCanvasRevision((value) => value + 1);
    setClosedActorUserId(null);
    setCanvasLoadFailed(false);
    reportedCanvasFailuresRef.current.clear();
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
          navigation.replace("PlayStorySparks", {
            sessionId,
            ...(isTurnBased ? { mode: "turn_based", momentId } : {}),
          });
          return;
        }
        if (response.session.activity !== "draw") {
          setLoadError(
            tt(
              "play.unsupportedOldSession"
            )
          );
          setLoading(false);
          return;
        }
        rememberTogetherSession(response);
        setSessionResponse(response);
        setLoading(false);
      })
      .catch((error) => {
        if (!mountedRef.current) return;
        reportCanvasFailure("sessionLoadFailed", "Failed to load Together draw session", error);
        setLoadError(
          tt(
            "play.canvas.connectError"
          )
        );
        setLoading(false);
      });

    if (isTurnBased && momentId) {
      void togetherApi.getTurnBasedMoment(momentId)
        .then((response) => {
          if (mountedRef.current) setTurnBasedMoment(response.moment);
        })
        .catch(() => undefined);
    }

    return () => {
      mountedRef.current = false;
    };
  }, [isTurnBased, momentId, navigation, sessionId, tt, uid]);

  const session = sessionResponse?.session ?? null;
  const participants = sessionResponse?.participants ?? [];
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const identityRevealed =
    !isTurnBased || Boolean(turnBasedMoment?.identityRevealed && sessionResponse?.identityRevealed);
  const peerName = identityRevealed
    ? peer?.displayName?.trim() || tt("profile.amoriaUser")
    : tt("together.turnBased.anonymousPeer");
  const totalStrokeCount = strokes.length;
  const localizedPrompt = localizeTogetherPrompt(session, tt);
  const promptKey = getTogetherPromptKey(session);
  const promptArt = getTogetherPromptArt(promptKey);
  const promptHints = React.useMemo(() => {
    if (!promptKey) {
      return [
        tt("play.canvas.hint.shape"),
        tt("play.canvas.hint.place"),
        tt("play.canvas.hint.mood"),
      ];
    }

    return [0, 1, 2].map((index) => {
      const key = `play.promptHint.${promptKey}.${index}`;
      const localized = tt(key);
      return localized === key ? tt("play.canvas.hint.free") : localized;
    });
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
    navigation.replace("PlayResult", {
      sessionId,
      ...(isTurnBased ? { mode: "turn_based", momentId } : {}),
    });
  }, [isTurnBased, momentId, navigation, sessionId]);

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
        reportUnexpectedTerminal(response, actorUserId);
        setDrawingStarted(true);
        if (actorUserId && actorUserId === uid) {
          allowExitRef.current = true;
          goToTogether();
        }
      }
    },
    [goToTogether, openResultScreen, reportUnexpectedTerminal, uid]
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
      } catch (error) {
        reportCanvasFailure("peerEventHydrateFailed", "Failed to hydrate Together draw events", error);
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
  }, [drawingStarted, reportCanvasFailure, session?.status, sessionId, uid]);

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
      if (isTurnBased && momentId) {
        const response = await togetherApi.submitTurnBasedDraw(
          momentId,
          `draw-submit-${Date.now()}`
        );
        allowExitRef.current = true;
        if (response.moment?.action === "review_draw") {
          navigation.replace("PlayResult", {
            sessionId,
            mode: "turn_based",
            momentId,
          });
        } else {
          navigation.navigate("Tabs", { screen: "Together" });
        }
        return;
      }
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
    await task.catch((error) => {
      if (!mountedRef.current) return;
      reportCanvasFailure("finishSessionFailed", "Failed to finish Together draw session", error);
      setStrokeError(
        tt(
          "play.canvas.finishFailed"
        )
      );
    });
  }, [applySessionResponse, isTurnBased, momentId, navigation, openResultScreen, reportCanvasFailure, session?.status, sessionId, tt, uid]);

  const leaveSessionAndExit = React.useCallback(async () => {
    if (!sessionId) {
      goToTogether();
      return;
    }
    if (isTurnBased) {
      allowExitRef.current = true;
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
            tt("play.togetherExit.leaveFailedTitle"),
            tt(
              "play.togetherExit.leaveFailedBody"
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
  }, [applySessionResponse, goToTogether, isTurnBased, session?.status, sessionId, tt, uid]);

  React.useEffect(() => {
    if (isTurnBased || !uid || !sessionId || session?.status !== "active" || finishing || leaving) return;

    let cancelled = false;
    const sendHeartbeat = async () => {
      try {
        const response = await togetherApi.heartbeat(sessionId);
        heartbeatFailureCountRef.current = 0;
        if (!cancelled) {
          applySessionResponse(response);
        }
      } catch (error) {
        heartbeatFailureCountRef.current += 1;
        if (heartbeatFailureCountRef.current >= 2) {
          reportCanvasFailure("heartbeatFailed", "Together draw heartbeat failed repeatedly", error, {
            heartbeatFailureCount: heartbeatFailureCountRef.current,
          });
        }
        if (!cancelled && mountedRef.current) {
          setStrokeError(
            tt(
              "play.canvas.heartbeatFailed"
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
  }, [applySessionResponse, finishing, isTurnBased, leaving, reportCanvasFailure, session?.status, sessionId, tt, uid]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppActive(nextState === "active");
    });
    return () => subscription.remove();
  }, []);

  React.useEffect(() => {
    if (!isTurnBased || !momentId || session?.status !== "active" || !shouldRenewPartnerLease({
      moment:turnBasedMoment,focused:isFocused,appActive,
    })) return;
    const renew = () => { void togetherApi.renewTurnBasedLease(momentId).catch(() => undefined); };
    renew();
    const timer = setInterval(renew, 60_000);
    return () => clearInterval(timer);
  }, [appActive, isFocused, isTurnBased, momentId, session?.status, turnBasedMoment?.role, turnBasedMoment?.status]);

  React.useEffect(() => {
    if (!session) return;
    if (session.status === "finished") {
      openResultScreen();
    } else if (isTerminalClosedStatus(session.status)) {
      if (sessionResponse) {
        reportUnexpectedTerminal(sessionResponse);
      }
      setDrawingStarted(true);
    }
  }, [openResultScreen, reportUnexpectedTerminal, session, sessionResponse]);

  React.useEffect(() => {
    if (isTurnBased || session?.status !== "active") return;
    if (drawRemaining > 0) return;
    void completeSession();
  }, [completeSession, drawRemaining, isTurnBased, session?.status]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener(
      "beforeRemove",
      (event: EventArg<"beforeRemove", true, undefined>) => {
        if (allowExitRef.current || navigationHandledRef.current) return;
        if (session?.status !== "active") return;
        if (isTurnBased) {
          event.preventDefault();
          void leaveSessionAndExit();
          return;
        }
        if (toolPaletteVisible) {
          event.preventDefault();
          setToolPaletteVisible(false);
          return;
        }
        if (focusMode) {
          event.preventDefault();
          exitFocusMode();
          return;
        }

        event.preventDefault();
        Alert.alert(
          tt("play.canvas.leaveTitle"),
          tt(
            "play.canvas.leaveBody"
          ),
          [
            { text: tt("common.stay"), style: "cancel" },
            {
              text: tt("common.exit"),
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
  }, [exitFocusMode, focusMode, isTurnBased, leaveSessionAndExit, navigation, session?.status, toolPaletteVisible, tt]);

  const handleCanvasBack = React.useCallback(() => {
    if (toolPaletteVisible) {
      setToolPaletteVisible(false);
      return;
    }
    if (focusMode) {
      exitFocusMode();
      return;
    }
    if (session?.status !== "active") {
      handleSafeBack();
      return;
    }
    if (isTurnBased) {
      void leaveSessionAndExit();
      return;
    }
    Alert.alert(
      tt("play.canvas.leaveTitle"),
      tt(
        "play.canvas.leaveBody"
      ),
      [
        { text: tt("common.stay"), style: "cancel" },
        {
          text: tt("common.exit"),
          style: "destructive",
          onPress: () => {
            void leaveSessionAndExit();
          },
        },
      ]
    );
  }, [exitFocusMode, focusMode, handleSafeBack, isTurnBased, leaveSessionAndExit, session?.status, toolPaletteVisible, tt]);

  const handleLocalBatch = React.useCallback(
    async (localStrokes: SharedCanvasStroke[]) => {
      if (!uid || !sessionId || session?.status !== "active" || finishing || leaving) return;

      const clientEventId = buildClientEventId(uid);
      const payload = {
        uid,
        strokes: localStrokes.map((stroke) => ({
          id: stroke.id,
          tool: stroke.tool ?? "draw",
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
      } catch (error) {
        if (!mountedRef.current) return;
        const includesEraser = localStrokes.some((stroke) => stroke.tool === "erase");
        reportCanvasFailure(
          includesEraser ? "sendEraserStrokeFailed" : "sendStrokeFailed",
          includesEraser
            ? "Failed to send Together draw eraser stroke"
            : "Failed to send Together draw stroke batch",
          error,
          {
            batchStrokeCount: localStrokes.length,
            tool: includesEraser ? "erase" : "draw",
          }
        );
        setStrokes(getTogetherStrokes(sessionId));
        setCanvasRevision((value) => value + 1);
        setStrokeError(
          tt(
            "play.canvas.strokeFailed"
          )
        );
      }
    },
    [finishing, leaving, reportCanvasFailure, session?.status, sessionId, tt, uid]
  );

  const canvasToolLabels = React.useMemo(
    () => ({
      tools: tt("play.canvas.toolTools"),
      brushTool: tt("play.canvas.toolBrushTool"),
      eraserTool: tt("play.canvas.toolEraserTool"),
      toolsHint: tt(
        "play.canvas.toolsHint"
      ),
      colors: tt("play.canvas.toolColors"),
      brush: tt("play.canvas.toolBrush"),
      eraser: tt("play.canvas.toolEraser"),
      zoom: tt("play.canvas.toolZoom"),
      zoomIn: tt("play.canvas.zoomIn"),
      zoomOut: tt("play.canvas.zoomOut"),
      colorNames: [
        tt("play.canvas.toolColorRose"),
        tt("play.canvas.toolColorOrange"),
        tt("play.canvas.toolColorYellow"),
        tt("play.canvas.toolColorGreen"),
        tt("play.canvas.toolColorBlue"),
        tt("play.canvas.toolColorViolet"),
        tt("play.canvas.toolColorWhite"),
        tt("play.canvas.toolColorDark"),
      ],
      brushSizes: [
        tt("play.canvas.toolBrushSmall"),
        tt("play.canvas.toolBrushMedium"),
        tt("play.canvas.toolBrushLarge"),
      ],
      eraserSizes: [
        tt("play.canvas.toolEraserSmall"),
        tt("play.canvas.toolEraserMedium"),
        tt("play.canvas.toolEraserLarge"),
      ],
      toolsShort: tt("play.canvas.toolsShort"),
      hideToolsShort: tt("play.canvas.hideToolsShort"),
      exitFullscreenShort: tt("play.canvas.exitFullscreenShort"),
      menuShort: tt("play.canvas.menuShort"),
    }),
    [tt]
  );

  if (!uid || !sessionId) {
    return (
      <ScreenShell
        title={tt("play.canvas.title")}
        background="togetherObservatoryV6"
        showBack
        onBack={handleSafeBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("play.canvas.guardAuthTitle")}
            body={tt("play.canvas.guardAuthBody")}
            primaryAction={{ label: tt("common.openProfile"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: tt("common.back"), onPress: handleSafeBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loading) {
    return (
      <ScreenShell
        title={tt("play.canvas.title")}
        background="togetherObservatoryV6"
        showBack
        onBack={handleSafeBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="brush-outline"
            title={tt("play.canvas.loadingTitle")}
            body={tt(
              "play.canvas.loadingBody"
            )}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadError || !session) {
    return (
      <ScreenShell
        title={tt("play.canvas.title")}
        background="togetherObservatoryV6"
        showBack
        onBack={handleSafeBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("play.canvas.guardErrorTitle")}
            body={loadError || tt("play.canvas.guardNotFoundBody")}
            primaryAction={{ label: tt("common.retry"), onPress: retryCanvasEntry }}
            secondaryAction={{ label: tt("common.backToTogether"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (isTerminalClosedStatus(session.status)) {
    const closedByPartner = Boolean(closedActorUserId && closedActorUserId !== uid);
    return (
      <ScreenShell
        title={tt("play.canvas.title")}
        background="togetherObservatoryV6"
        showBack
        onBack={goToTogether}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="exit-outline"
            title={
              closedByPartner
                ? tt("play.canvas.partnerLeftTitle")
                : tt("play.canvas.sessionInterruptedTitle")
            }
            body={tt(
              "play.canvas.sessionInterruptedBody"
            )}
            primaryAction={{
              label: tt("common.backToTogether"),
              onPress: goToTogether,
            }}
            secondaryAction={{
              label: tt("play.canvas.findNewPartner"),
              onPress: startNewSession,
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (canvasLoadFailed) {
    return (
      <ScreenShell
        title={tt("play.canvas.title")}
        background="togetherObservatoryV6"
        showBack
        onBack={() => void leaveSessionAndExit()}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="warning-outline"
            title={tt("play.canvas.webviewFailedTitle")}
            body={tt(
              "play.canvas.webviewFailedBody"
            )}
            primaryAction={{
              label: tt("common.backToMainTabs"),
              onPress: () => void leaveSessionAndExit(),
            }}
            secondaryAction={{
              label: tt("play.canvas.retryLater"),
              onPress: () => void leaveSessionAndExit(),
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!drawingStarted && session.status === "active") {
    return (
      <ScreenShell
        title={tt("play.canvas.title")}
        background="togetherObservatoryV6"
        showBack
        onBack={handleCanvasBack}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.previewContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.previewCard}>
            <View style={styles.promptImageWrap}>
              <Image
                source={promptArt}
                style={styles.promptImage}
                resizeMode="cover"
                accessible={false}
              />
            </View>
            <View style={styles.previewCopy}>
              <Text style={styles.previewEyebrow}>
                {tt("play.canvas.previewEyebrow")}
              </Text>
              <Text style={styles.previewTitle} numberOfLines={4}>
                {localizedPrompt}
              </Text>
              <Text style={styles.previewBody}>
                {tt(
                  "play.canvas.previewBody"
                )}
              </Text>
              <View style={styles.hintRow}>
                {promptHints.map((hint) => (
                  <View key={hint} style={styles.hintChip}>
                    <Text style={styles.hintChipText} numberOfLines={2}>{hint}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.sessionCard}>
            <Ionicons name="people-outline" size={22} color="#FFE0B8" />
            <View style={styles.sessionCardText}>
              <Text style={styles.sessionCardTitle}>
                {tt("play.canvas.partnerTitle")}
              </Text>
              <Text style={styles.sessionCardBody}>
                {tt("play.canvas.partnerBody", { name: peerName })}
              </Text>
            </View>
          </View>

          {strokeError ? <Text style={styles.previewError}>{strokeError}</Text> : null}

          <Pressable
            style={styles.primaryButton}
            onPress={() => setDrawingStarted(true)}
          >
            <Text style={styles.primaryButtonText}>
              {tt("play.canvas.openCanvas")}
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
                ? tt("common.exiting")
                : tt("common.backToMainTabs")}
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
      title={tt("play.canvas.title")}
      background="togetherObservatoryV6"
      showHeader={!focusMode}
      showBack
      onBack={handleCanvasBack}
    >
      <View style={styles.fullscreenWrap}>
        {focusMode ? (
          <View style={styles.focusTopBar}>
            <View style={styles.focusTimerPill}>
              <Text style={styles.timerLabel}>
                {tt("play.canvas.timerRemaining")}
              </Text>
              <Text style={styles.timerValue}>{timerValue}</Text>
            </View>
            <ScrollView
              horizontal
              style={styles.focusActionsScroll}
              contentContainerStyle={styles.focusActions}
              showsHorizontalScrollIndicator={false}
              bounces={false}
            >
              <Pressable
                style={[styles.focusToolButton, toolPaletteVisible ? styles.focusToolButtonActive : null]}
                onPress={toggleToolPalette}
                accessibilityRole="button"
                accessibilityLabel={
                  toolPaletteVisible
                    ? tt("play.canvas.hideTools")
                    : tt("play.canvas.showTools")
                }
              >
                <Ionicons
                  name={toolPaletteVisible ? "chevron-down-outline" : "color-palette-outline"}
                  size={15}
                  color={theme.colors.text}
                />
                <Text style={styles.focusToolText} numberOfLines={1}>
                  {toolPaletteVisible
                    ? tt("play.canvas.hideToolsShort")
                    : tt("play.canvas.toolsShort")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.focusActionButton}
                onPress={exitFocusMode}
                accessibilityRole="button"
                accessibilityLabel={tt("play.canvas.exitFullscreen")}
              >
                <Ionicons name="contract-outline" size={15} color="#FFFFFF" />
                <Text style={styles.focusActionText} numberOfLines={1}>
                  {tt("play.canvas.exitFullscreenShort")}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.focusLeaveButton, finishing || leaving ? styles.buttonDisabled : null]}
                onPress={() => void leaveSessionAndExit()}
                disabled={finishing || leaving}
                accessibilityRole="button"
                accessibilityLabel={tt("common.backToMainTabs")}
              >
                <Ionicons name="menu-outline" size={15} color={theme.colors.text} />
                <Text style={styles.focusLeaveText} numberOfLines={1}>
                  {leaving ? tt("common.exiting") : tt("play.canvas.menuShort")}
                </Text>
              </Pressable>
            </ScrollView>
          </View>
        ) : (
          <View style={styles.fullscreenHeader}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerKicker}>
                {tt("play.canvas.challengeStripLabel")}
              </Text>
              <Text style={styles.headerTitle} numberOfLines={2}>
                {localizedPrompt}
              </Text>
              <Text style={styles.headerPeer} numberOfLines={1}>
                {participants.length > 1
                  ? tt("play.canvas.partnerBody", { name: peerName })
                  : tt("play.canvas.waitingPeer")}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <View style={styles.timerPill}>
                <Text style={styles.timerLabel}>
                  {tt("play.canvas.timerRemaining")}
                </Text>
                <Text style={styles.timerValue}>{timerValue}</Text>
              </View>
              <Pressable
                style={[styles.fullscreenButton, toolPaletteVisible ? styles.fullscreenButtonActive : null]}
                onPress={toggleToolPalette}
                accessibilityRole="button"
                accessibilityLabel={
                  toolPaletteVisible
                    ? tt("play.canvas.hideTools")
                    : tt("play.canvas.showTools")
                }
              >
                <Text style={styles.fullscreenButtonText}>
                  {toolPaletteVisible
                    ? tt("play.canvas.hideTools")
                    : tt("play.canvas.tools")}
                </Text>
              </Pressable>
              <Pressable
                style={styles.fullscreenButton}
                onPress={enterFocusMode}
                accessibilityRole="button"
              >
                <Text style={styles.fullscreenButtonText}>
                  {tt("play.canvas.fullscreen")}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {!focusMode ? (
          <View style={styles.referenceStrip}>
            <Image
              source={promptArt}
              style={styles.referenceThumbnail}
              resizeMode="cover"
              accessible={false}
            />
            <Text style={styles.referenceText} numberOfLines={2}>
              {localizedPrompt}
            </Text>
          </View>
        ) : null}

        <SharedCanvasWebView
          key={`${sessionId}-${canvasRevision}`}
          localUid={uid}
          strokes={strokes}
          onLocalStrokeBatch={handleLocalBatch}
          onLoadError={(message) => {
            setCanvasLoadFailed(true);
            reportCanvasFailure("canvasWebViewLoadFailed", message);
          }}
          onMessageParseError={(message, metadata) => {
            reportCanvasFailure("canvasWebViewMessageParseFailed", message, undefined, metadata);
          }}
          onCanvasControlError={(step, message, error, metadata) => {
            reportCanvasFailure(step, message, error, metadata);
          }}
          disabled={canvasDisabled}
          disabledTitle={
            finishing || leaving
              ? tt("play.canvas.disabledFinishingTitle")
              : tt("play.canvas.disabledClosedTitle")
          }
          disabledBody={
            finishing || leaving
              ? tt("play.canvas.disabledFinishingBody")
              : undefined
          }
          fullscreen
          toolbarVisible={toolPaletteVisible}
          toolLabels={canvasToolLabels}
        />

        {!focusMode ? (
        <View style={styles.footerBar}>
          <View style={styles.footerTextWrap}>
            <Text style={styles.footerText}>
              {tt("play.canvas.strokeCount", {
                count: numberFormatter.format(totalStrokeCount),
              })}
            </Text>
            <Text style={styles.footerHint}>
              {tt("play.canvas.toolsHint")}
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
                  ? tt("play.canvas.finishing")
                  : leaving
                    ? tt("common.exiting")
                  : isTurnBased && turnBasedMoment?.role === "starter"
                    ? tt("play.canvas.turnBasedStarterSubmit")
                    : isTurnBased && turnBasedMoment?.role === "partner"
                      ? tt("play.canvas.turnBasedPartnerSubmit")
                      : tt("common.finish")}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.footerExitButton, finishing || leaving ? styles.buttonDisabled : null]}
              onPress={() => void leaveSessionAndExit()}
              disabled={finishing || leaving}
              accessibilityRole="button"
            >
              <Text style={styles.footerExitButtonText}>
                {tt("common.backToMainTabs")}
              </Text>
            </Pressable>
          </View>
        </View>
        ) : null}
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
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    gap: 16,
  },
  previewCard: {
    overflow: "hidden",
    backgroundColor: "transparent",
    borderWidth: 0,
  },
  promptImageWrap: {
    width: "100%",
    minHeight: 176,
    maxHeight: 220,
    aspectRatio: 1.5,
  },
  promptImage: {
    width: "100%",
    height: "100%",
  },
  previewCopy: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 18,
    gap: 10,
  },
  previewEyebrow: {
    color: "#E6B976",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  previewTitle: {
    color: theme.colors.text,
    fontFamily: "serif",
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "600",
  },
  previewBody: {
    color: theme.colors.subtext,
    fontSize: 14,
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
    minHeight: 34,
    justifyContent: "center",
    backgroundColor: "rgba(230,185,118,0.11)",
    borderWidth: 1,
    borderColor: "rgba(230,185,118,0.22)",
  },
  hintChipText: {
    color: "#F3C98B",
    fontSize: 12,
    fontWeight: "800",
  },
  sessionCard: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
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
    minHeight: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryActionBg,
    borderWidth: 1,
    borderColor: theme.colors.primaryActionBorder,
  },
  primaryButtonText: {
    color: theme.colors.primaryActionText,
    fontSize: 16,
    fontWeight: "700",
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
  referenceStrip: {
    height: 62,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 6,
    borderRadius: 18,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(5,8,22,0.22)",
    borderWidth: 1,
    borderColor: "rgba(230,185,118,0.18)",
  },
  referenceThumbnail: {
    width: 72,
    height: 48,
    borderRadius: 12,
  },
  referenceText: {
    flex: 1,
    color: theme.colors.textWarm,
    fontSize: 13,
    lineHeight: 18,
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
  headerActions: {
    alignItems: "stretch",
    gap: 7,
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
  fullscreenButton: {
    minHeight: 34,
    borderRadius: 12,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  fullscreenButtonActive: {
    backgroundColor: "rgba(255, 224, 184, 0.14)",
    borderColor: "rgba(255, 224, 184, 0.34)",
  },
  fullscreenButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  focusTopBar: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(8,10,18,0.98)",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  focusTimerPill: {
    minWidth: 70,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 5,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  focusActionsScroll: {
    flex: 1,
  },
  focusActions: {
    flexGrow: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 6,
    paddingLeft: 2,
  },
  focusToolButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  focusToolButtonActive: {
    backgroundColor: "rgba(255, 224, 184, 0.14)",
    borderColor: "rgba(255, 224, 184, 0.34)",
  },
  focusToolText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  focusActionButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: theme.colors.primaryActionBg,
    borderWidth: 1,
    borderColor: theme.colors.primaryActionBorder,
  },
  focusActionText: {
    color: theme.colors.primaryActionText,
    fontSize: 11,
    fontWeight: "800",
  },
  focusLeaveButton: {
    minHeight: 34,
    borderRadius: 10,
    paddingHorizontal: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  focusLeaveText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
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
  footerHint: {
    color: "#FFE0B8",
    fontSize: 11,
    lineHeight: 15,
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
    backgroundColor: theme.colors.primaryActionBg,
    borderWidth: 1,
    borderColor: theme.colors.primaryActionBorder,
  },
  finishButtonText: {
    color: theme.colors.primaryActionText,
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
