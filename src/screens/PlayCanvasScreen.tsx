import React from "react";
import {
  Alert,
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import SharedCanvasWebView, {
  type SharedCanvasStroke,
} from "@/components/play/SharedCanvasWebView";
import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import {
  appendStrokeBatch,
  finishPlaySession,
  subscribePlayEvents,
  subscribePlaySession,
  type PlaySessionDoc,
  type PlayStroke,
  type PlayStrokeBatch,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

const SESSION_DURATION_SEC = 420;

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
  title: string;
  body: string;
  primaryLabel: string;
  primaryAction: () => void;
  secondaryLabel?: string;
  secondaryAction?: () => void;
};

export default function PlayCanvasScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const sessionId = String(route.params?.sessionId ?? "").trim();
  const uid = auth?.currentUser?.uid ?? "";
  const [session, setSession] = React.useState<PlaySessionDoc | null>(null);
  const [events, setEvents] = React.useState<PlayStrokeBatch[]>([]);
  const [loadingSession, setLoadingSession] = React.useState(true);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [finishing, setFinishing] = React.useState(false);
  const [tick, setTick] = React.useState(Date.now());
  const mountedRef = React.useRef(true);
  const navigationHandledRef = React.useRef(false);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
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
    setSession(null);
    setEvents([]);
    setLoadingSession(true);
    setLoadingEvents(true);
    setLoadError("");
    setFinishing(false);
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
        setLoadError("Не получилось подключить совместную сессию. Попробуй открыть ее еще раз.");
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
        setLoadError("Мы не смогли загрузить общий холст целиком. Попробуй переподключиться.");
        setLoadingEvents(false);
      }
    );

    return () => {
      mountedRef.current = false;
      unsubscribeSession();
      unsubscribeEvents();
    };
  }, [sessionId, uid]);

  const allStrokes = React.useMemo(
    () => events.flatMap((batch) => mapBatchStroke(batch)),
    [events]
  );

  const totalStrokeCount = React.useMemo(
    () => events.reduce((sum, batch) => sum + batch.strokes.length, 0),
    [events]
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
    if (session.status === "finished" || session.status === "revealed") {
      openResultScreen();
    }
  }, [openResultScreen, session]);

  React.useEffect(() => {
    if (!session?.startedAt || session.status !== "active") return;
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [session?.startedAt, session?.status]);

  const liveRemaining = React.useMemo(() => {
    if (!session?.startedAt) return SESSION_DURATION_SEC;
    const elapsed = Math.floor((tick - session.startedAt) / 1000);
    return Math.max(SESSION_DURATION_SEC - elapsed, 0);
  }, [session?.startedAt, tick]);

  React.useEffect(() => {
    if (!session || session.status !== "active") return;
    if (liveRemaining > 0) return;
    void completeSession();
  }, [completeSession, liveRemaining, session]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: any) => {
      if (allowExitRef.current || navigationHandledRef.current) return;
      if (session?.status !== "active") return;

      event.preventDefault();
      Alert.alert(
        "Завершить сессию?",
        "Если выйти сейчас, мы мягко завершим общий рисунок и сразу откроем итог.",
        [
          { text: "Остаться", style: "cancel" },
          {
            text: "Завершить",
            style: "destructive",
            onPress: () => {
              void completeSession();
            },
          },
        ]
      );
    });

    return unsubscribe;
  }, [completeSession, navigation, session?.status]);

  const handleLocalBatch = React.useCallback(
    async (strokes: SharedCanvasStroke[]) => {
      if (!db || !uid || !sessionId || session?.status !== "active" || finishing) return;

      const payload: PlayStroke[] = strokes.map((stroke) => ({
        id: stroke.id,
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((point, index) => ({
          x: point.x,
          y: point.y,
          t: index,
        })),
      }));

      try {
        await appendStrokeBatch(db, sessionId, uid, payload);
      } catch {}
    },
    [db, finishing, session?.status, sessionId, uid]
  );

  const partnerId = React.useMemo(() => {
    return session?.participantIds.find((participantId) => participantId !== uid) ?? "";
  }, [session?.participantIds, uid]);

  const partnerName = session?.participantNicknames?.[partnerId] ?? makeNickname(partnerId || "peer");

  const sessionPhaseCopy = React.useMemo(() => {
    if (session?.status === "active") {
      return {
        eyebrow: "Сессия началась",
        title: "Вы уже в общем холсте",
        body: "Рисуйте вместе до конца таймера. Когда время закончится, вы увидите итог и решите, хотите ли продолжить общение.",
      };
    }

    return {
      eyebrow: "Подключаем сессию",
      title: "Сейчас все соберется",
      body: "Мы уже открыли холст и синхронизируем его для вас двоих.",
    };
  }, [session?.status]);

  const guardState = React.useMemo<GuardState | null>(() => {
    if (!uid) {
      return {
        title: "Не удалось открыть сессию",
        body: "Чтобы войти в совместный холст, нужен активный аккаунт.",
        primaryLabel: "Открыть профиль",
        primaryAction: () => navigation.navigate("Profile"),
        secondaryLabel: "Назад",
        secondaryAction: handleSafeBack,
      };
    }

    if (!db) {
      return {
        title: "Холст пока недоступен",
        body: "Мы не смогли подготовить подключение к сессии. Попробуй снова через пару секунд.",
        primaryLabel: "Попробовать снова",
        primaryAction: retryCanvasEntry,
        secondaryLabel: "Во Вместе",
        secondaryAction: goToTogether,
      };
    }

    if (!sessionId) {
      return {
        title: "Сессия не найдена",
        body: "Не получилось открыть совместный холст без контекста сессии. Вернись во Вместе и начни заново.",
        primaryLabel: "Во Вместе",
        primaryAction: goToTogether,
        secondaryLabel: "Назад",
        secondaryAction: handleSafeBack,
      };
    }

    if (loadError) {
      return {
        title: "Подключение прервалось",
        body: loadError,
        primaryLabel: "Попробовать снова",
        primaryAction: retryCanvasEntry,
        secondaryLabel: "Во Вместе",
        secondaryAction: goToTogether,
      };
    }

    if (!loadingSession && !loadingEvents && !session) {
      return {
        title: "Сессия больше недоступна",
        body: "Она уже завершилась или была закрыта. Можно спокойно вернуться и начать новую.",
        primaryLabel: "Во Вместе",
        primaryAction: goToTogether,
        secondaryLabel: "Назад",
        secondaryAction: handleSafeBack,
      };
    }

    return null;
  }, [goToTogether, handleSafeBack, loadError, loadingEvents, loadingSession, navigation, retryCanvasEntry, session, sessionId, uid]);

  if (guardState) {
    return (
      <ScreenShell title="Совместная сессия" background="nightCity" showBack onBack={handleSafeBack}>
        <View style={styles.centerState}>
          <View style={styles.guardCard}>
            <Text style={styles.centerTitle}>{guardState.title}</Text>
            <Text style={styles.centerText}>{guardState.body}</Text>
            <View style={styles.guardActions}>
              <Pressable onPress={guardState.primaryAction} style={styles.returnButton}>
                <Text style={styles.returnButtonText}>{guardState.primaryLabel}</Text>
              </Pressable>
              {guardState.secondaryLabel && guardState.secondaryAction ? (
                <Pressable onPress={guardState.secondaryAction} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{guardState.secondaryLabel}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </ScreenShell>
    );
  }

  if (loadingSession || loadingEvents) {
    return (
      <ScreenShell title="Совместная сессия" background="nightCity" showBack onBack={handleSafeBack}>
        <View style={styles.centerState}>
          <View style={styles.guardCard}>
            <ActivityIndicator color={theme.colors.accent} />
            <Text style={styles.centerTitle}>Подключаем общий холст</Text>
            <Text style={styles.centerText}>
              Сессия уже готовится. Еще пара секунд, и вы окажетесь в одном пространстве.
            </Text>
          </View>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Совместная сессия"
      background="nightCity"
      showBack
      onBack={() => {
        if (session?.status !== "active") {
          handleSafeBack();
          return;
        }
        Alert.alert(
          "Завершить сессию?",
          "Если выйти сейчас, мы мягко завершим общий рисунок и сразу откроем итог.",
          [
            { text: "Остаться", style: "cancel" },
            {
              text: "Завершить",
              style: "destructive",
              onPress: () => {
                void completeSession();
              },
            },
          ]
        );
      }}
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
              <Text style={styles.timerText}>{formatRemaining(liveRemaining)}</Text>
            </View>
          </View>

          <View style={styles.metaRow}>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Напарник</Text>
              <Text style={styles.metaValue}>{partnerName}</Text>
            </View>
            <View style={styles.metaCard}>
              <Text style={styles.metaLabel}>Общих штрихов</Text>
              <Text style={styles.metaValue}>{totalStrokeCount}</Text>
            </View>
          </View>
        </View>

        <SharedCanvasWebView
          localUid={uid}
          strokes={allStrokes}
          disabled={session?.status !== "active" || finishing}
          onLocalStrokeBatch={handleLocalBatch}
        />

        <View style={styles.footerRow}>
          <Text style={styles.helper}>
            У вас 7 минут на один общий рисунок. Когда время закончится, вы сразу увидите итог и
            решите, хотите ли открыть чат дальше.
          </Text>
          <Pressable
            disabled={finishing}
            onPress={() => void completeSession()}
            style={[styles.finishButton, finishing ? styles.finishButtonDisabled : null]}
          >
            <Text style={styles.finishText}>
              {finishing ? "Завершаем…" : "Завершить раньше"}
            </Text>
          </Pressable>
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
  metaRow: {
    flexDirection: "row",
    gap: 10,
  },
  metaCard: {
    flex: 1,
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 6,
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
    flex: 1,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  guardCard: {
    width: "100%",
    borderRadius: theme.shapes.card,
    padding: 22,
    backgroundColor: "rgba(17, 20, 36, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    gap: 12,
  },
  centerTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
    textAlign: "center",
  },
  centerText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  footerRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
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
  guardActions: {
    width: "100%",
    gap: 10,
    marginTop: 4,
  },
  returnButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: theme.colors.accent,
    alignItems: "center",
  },
  returnButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
});
