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
  type PlayStroke,
  type PlayStrokeBatch,
  type PlaySessionDoc,
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

export default function PlayCanvasScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const sessionId = String(route.params?.sessionId ?? "");
  const uid = auth?.currentUser?.uid ?? "";
  const [session, setSession] = React.useState<PlaySessionDoc | null>(null);
  const [events, setEvents] = React.useState<PlayStrokeBatch[]>([]);
  const [loadingSession, setLoadingSession] = React.useState(true);
  const [loadingEvents, setLoadingEvents] = React.useState(true);
  const [finishing, setFinishing] = React.useState(false);
  const mountedRef = React.useRef(true);
  const navigationHandledRef = React.useRef(false);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
  const allowExitRef = React.useRef(false);

  React.useEffect(() => {
    mountedRef.current = true;
    navigationHandledRef.current = false;
    allowExitRef.current = false;
    finishPromiseRef.current = null;
    setFinishing(false);
    setTick(Date.now());

    if (!db || !sessionId) {
      setSession(null);
      setEvents([]);
      setLoadingSession(false);
      setLoadingEvents(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoadingSession(true);
    setLoadingEvents(true);

    const unsubscribeSession = subscribePlaySession(db, sessionId, (next) => {
      if (!mountedRef.current) return;
      setSession(next);
      setLoadingSession(false);
    });
    const unsubscribeEvents = subscribePlayEvents(db, sessionId, (next) => {
      if (!mountedRef.current) return;
      setEvents(next);
      setLoadingEvents(false);
    });
    return () => {
      mountedRef.current = false;
      unsubscribeSession();
      unsubscribeEvents();
    };
  }, [sessionId]);

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

  const [tick, setTick] = React.useState(Date.now());

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
        "Если выйти сейчас, совместная сессия мягко завершится и откроется итоговый экран.",
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

  if (!sessionId) {
    return (
      <ScreenShell title="Общий холст" background="nightCity" showBack>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Сессия не найдена</Text>
          <Text style={styles.centerText}>
            Не удалось открыть общий холст без идентификатора сессии.
          </Text>
        </View>
      </ScreenShell>
    );
  }

  if (loadingSession || loadingEvents) {
    return (
      <ScreenShell title="Общий холст" background="nightCity" showBack>
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.centerText}>Подключаем общий холст…</Text>
        </View>
      </ScreenShell>
    );
  }

  if (!session) {
    return (
      <ScreenShell title="Общий холст" background="nightCity" showBack>
        <View style={styles.centerState}>
          <Text style={styles.centerTitle}>Сессия больше недоступна</Text>
          <Text style={styles.centerText}>
            Совместная сессия уже завершилась или была закрыта.
          </Text>
          <Pressable onPress={() => navigation.replace("Tabs")} style={styles.returnButton}>
            <Text style={styles.returnButtonText}>Вернуться во Вместе</Text>
          </Pressable>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Общий холст"
      background="nightCity"
      showBack
      onBack={() => {
        if (session.status !== "active") {
          allowExitRef.current = true;
          navigation.goBack();
          return;
        }
        Alert.alert(
          "Завершить сессию?",
          "Если выйти сейчас, совместная сессия мягко завершится и откроется итоговый экран.",
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
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.statsCard}>
          <View>
            <Text style={styles.statsLabel}>Напарник</Text>
            <Text style={styles.statsValue}>{partnerName}</Text>
          </View>
          <View style={styles.timerPill}>
            <Text style={styles.timerText}>{formatRemaining(liveRemaining)}</Text>
          </View>
        </View>

        <Text style={styles.helper}>
          У вас 7 минут. Сохраняем только завершенные штрихи, чтобы сессия была стабильной.
        </Text>

        <SharedCanvasWebView
          localUid={uid}
          strokes={allStrokes}
          disabled={session.status !== "active" || finishing}
          onLocalStrokeBatch={handleLocalBatch}
        />

        <View style={styles.footerRow}>
          <View style={styles.footerCard}>
            <Text style={styles.footerLabel}>Stroke batches</Text>
            <Text style={styles.footerValue}>{events.length}</Text>
          </View>
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
  content: {
    padding: 16,
    paddingBottom: 28,
    gap: 14,
  },
  statsCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
  },
  statsLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
    marginBottom: 4,
  },
  statsValue: {
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
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  centerTitle: {
    color: theme.colors.text,
    fontSize: 22,
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
  footerCard: {
    flex: 1,
    borderRadius: theme.shapes.cardInner,
    padding: 16,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  footerLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    marginBottom: 6,
  },
  footerValue: {
    color: theme.colors.text,
    fontSize: 24,
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
  returnButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: theme.colors.accent,
  },
  returnButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
});
