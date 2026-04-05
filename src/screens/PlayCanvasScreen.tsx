import React from "react";
import {
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
  const finishGuardRef = React.useRef(false);

  React.useEffect(() => {
    if (!db || !sessionId) return;
    const unsubscribeSession = subscribePlaySession(db, sessionId, setSession);
    const unsubscribeEvents = subscribePlayEvents(db, sessionId, setEvents);
    return () => {
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

  const completeSession = React.useCallback(async () => {
    if (!db || !sessionId || finishGuardRef.current) return;
    finishGuardRef.current = true;
    try {
      await finishPlaySession(db, sessionId, totalStrokeCount);
    } catch {}
    navigation.replace("PlayResult", { sessionId });
  }, [navigation, sessionId, totalStrokeCount]);

  React.useEffect(() => {
    if (!session) return;
    if (
      (session.status === "finished" || session.status === "revealed") &&
      !finishGuardRef.current
    ) {
      finishGuardRef.current = true;
      navigation.replace("PlayResult", { sessionId });
    }
  }, [navigation, session, sessionId]);

  const remainingSec = React.useMemo(() => {
    if (!session?.startedAt) return SESSION_DURATION_SEC;
    const elapsed = Math.floor((Date.now() - session.startedAt) / 1000);
    return Math.max(SESSION_DURATION_SEC - elapsed, 0);
  }, [session?.startedAt]);

  const [tick, setTick] = React.useState(Date.now());

  React.useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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

  const handleLocalBatch = React.useCallback(
    async (strokes: SharedCanvasStroke[]) => {
      if (!db || !uid || !sessionId || session?.status !== "active") return;

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
    [session?.status, sessionId, uid]
  );

  const partnerId = React.useMemo(() => {
    return session?.participantIds.find((participantId) => participantId !== uid) ?? "";
  }, [session?.participantIds, uid]);

  const partnerName = session?.participantNicknames?.[partnerId] ?? makeNickname(partnerId || "peer");

  return (
    <ScreenShell
      title="Общий холст"
      background="nightCity"
      showBack
      onBack={() => navigation.goBack()}
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
          disabled={session?.status !== "active"}
          onLocalStrokeBatch={handleLocalBatch}
        />

        <View style={styles.footerRow}>
          <View style={styles.footerCard}>
            <Text style={styles.footerLabel}>Stroke batches</Text>
            <Text style={styles.footerValue}>{events.length}</Text>
          </View>
          <Pressable onPress={() => void completeSession()} style={styles.finishButton}>
            <Text style={styles.finishText}>Завершить раньше</Text>
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
  finishText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
});
