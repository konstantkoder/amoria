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
import type { TogetherParticipantDto, TogetherSessionResponse } from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import {
  getTogetherPeer,
  getTogetherStrokes,
  rememberLocalTogetherStrokes,
  rememberTogetherEvent,
  rememberTogetherSession,
  type TogetherEventDto,
} from "@/services/togetherCanvasState";
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
  const [drawingStarted, setDrawingStarted] = React.useState(false);
  const [tick, setTick] = React.useState(Date.now());
  const mountedRef = React.useRef(true);
  const navigationHandledRef = React.useRef(false);
  const allowExitRef = React.useRef(false);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);

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
    setLoading(true);
    setLoadError("");
    setFinishing(false);
    setDrawingStarted(false);
    setTick(Date.now());
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

  React.useEffect(() => {
    if (!uid || !sessionId) return;
    let alive = true;
    wsClient.connect();
    wsClient.subscribeTogetherSession(sessionId);
    const unsubscribe = wsClient.onMessage((payload) => {
      if (!alive) return;
      if (String(payload.sessionId ?? "") !== sessionId) return;
      const event = readTogetherEvent(payload);
      if (!event) return;
      setStrokes(rememberTogetherEvent(sessionId, event));
    });

    return () => {
      alive = false;
      unsubscribe();
      wsClient.unsubscribeTogetherSession(sessionId);
    };
  }, [sessionId, uid]);

  const session = sessionResponse?.session ?? null;
  const participants = sessionResponse?.participants ?? [];
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const peerName = peer?.displayName?.trim() || tt("profile.amoriaUser", "Пользователь Amoria");
  const totalStrokeCount = strokes.length;
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
        await togetherApi.finish(sessionId).catch(() => undefined);
      }
      openResultScreen();
    })().finally(() => {
      finishPromiseRef.current = null;
      if (mountedRef.current) setFinishing(false);
    });

    finishPromiseRef.current = task;
    await task.catch(() => undefined);
  }, [openResultScreen, session?.status, sessionId]);

  React.useEffect(() => {
    if (!session) return;
    if (session.status === "finished") {
      openResultScreen();
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
      }
    );

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
    async (localStrokes: SharedCanvasStroke[]) => {
      if (!uid || !sessionId || session?.status !== "active" || finishing) return;

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

      setStrokes(rememberLocalTogetherStrokes(sessionId, uid, clientEventId, localStrokes));
      try {
        await togetherApi.sendEvent(sessionId, {
          clientEventId,
          type: "stroke_batch",
          payload,
        });
      } catch {}
    },
    [finishing, session?.status, sessionId, uid]
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
            <Text style={styles.previewTitle}>{session.promptText}</Text>
            <Text style={styles.previewBody}>
              {tt(
                "play.canvas.previewBody",
                "Посмотрите на задание. Холст откроется чистым, а рисунок останется вашим общим ответом."
              )}
            </Text>
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

          <Pressable
            style={styles.primaryButton}
            onPress={() => setDrawingStarted(true)}
          >
            <Text style={styles.primaryButtonText}>
              {tt("play.canvas.openCanvas", "Открыть холст")}
            </Text>
          </Pressable>
        </ScrollView>
      </ScreenShell>
    );
  }

  const timerValue = formatRemaining(drawRemaining);
  const canvasDisabled = session.status !== "active" || finishing;

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
              {session.promptText}
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
          localUid={uid}
          strokes={strokes}
          onLocalStrokeBatch={handleLocalBatch}
          disabled={canvasDisabled}
          disabledTitle={
            finishing
              ? tt("play.canvas.disabledFinishingTitle", "Завершаем сессию")
              : tt("play.canvas.disabledClosedTitle", "Холст закрыт")
          }
          disabledBody={
            finishing
              ? tt("play.canvas.disabledFinishingBody", "Сейчас откроем итог вашей совместной сессии.")
              : undefined
          }
          fullscreen
          toolLabels={canvasToolLabels}
        />

        <View style={styles.footerBar}>
          <Text style={styles.footerText}>
            {tt("play.canvas.strokeCount", "Штрихов: {count}", {
              count: String(totalStrokeCount),
            })}
          </Text>
          <Pressable
            style={[styles.finishButton, finishing ? styles.buttonDisabled : null]}
            onPress={() => void completeSession()}
            disabled={finishing}
          >
            <Text style={styles.finishButtonText}>
              {finishing
                ? tt("play.canvas.finishing", "Завершаем…")
                : tt("common.finish", "Завершить")}
            </Text>
          </Pressable>
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
  footerText: {
    color: theme.colors.subtext,
    fontSize: 13,
    fontWeight: "700",
  },
  finishButton: {
    minHeight: 40,
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  finishButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
