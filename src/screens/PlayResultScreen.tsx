import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import {
  getPeerFromSession,
  submitRevealDecision,
  subscribePlayEvents,
  subscribePlaySession,
  type PlayRevealDecision,
  type PlaySessionDoc,
  type PlayStrokeBatch,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

export default function PlayResultScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const sessionId = String(route.params?.sessionId ?? "");
  const uid = auth?.currentUser?.uid ?? "";
  const [session, setSession] = React.useState<PlaySessionDoc | null>(null);
  const [events, setEvents] = React.useState<PlayStrokeBatch[]>([]);
  const [decision, setDecision] = React.useState<PlayRevealDecision | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const navigatedRef = React.useRef(false);

  React.useEffect(() => {
    if (!db || !sessionId) return;
    const unsubscribeSession = subscribePlaySession(db, sessionId, setSession);
    const unsubscribeEvents = subscribePlayEvents(db, sessionId, setEvents);
    return () => {
      unsubscribeSession();
      unsubscribeEvents();
    };
  }, [sessionId]);

  React.useEffect(() => {
    const ownDecision = session?.revealDecisions?.[uid];
    if (ownDecision && ownDecision !== decision) {
      setDecision(ownDecision);
    }
  }, [decision, session?.revealDecisions, uid]);

  const peer = React.useMemo(() => {
    if (!session) return null;
    return getPeerFromSession(session, uid);
  }, [session, uid]);

  const peerName = peer?.nickname ?? makeNickname(peer?.uid ?? "peer");
  const revealValues = session?.participantIds.map(
    (participantId) => session.revealDecisions?.[participantId]
  ) ?? [];
  const allDecisionsMade =
    revealValues.length > 0 && revealValues.every((value) => value === "open" || value === "skip");
  const allOpen =
    revealValues.length > 0 && revealValues.every((value) => value === "open");
  const anySkip = revealValues.some((value) => value === "skip");

  React.useEffect(() => {
    if (!session || !allDecisionsMade || navigatedRef.current) return;
    navigatedRef.current = true;
    if (allOpen && peer?.uid) {
      navigation.replace("DMChat", {
        peerId: peer.uid,
        peerName,
      });
      return;
    }
  }, [allDecisionsMade, allOpen, navigation, peer?.uid, peerName, session]);

  const handleDecision = React.useCallback(
    async (nextDecision: PlayRevealDecision) => {
      if (!db || !sessionId || !uid || submitting) return;
      setSubmitting(true);
      setDecision(nextDecision);
      try {
        await submitRevealDecision(db, sessionId, uid, nextDecision);
      } finally {
        setSubmitting(false);
      }
    },
    [sessionId, uid, submitting]
  );

  const showSoftEnding = allDecisionsMade && anySkip;
  const waitingForPeer = Boolean(decision) && !allDecisionsMade;

  return (
    <ScreenShell
      title="Итог сессии"
      background="nightCity"
      showBack
      onBack={() => navigation.navigate("Tabs")}
    >
      <View style={styles.container}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryKicker}>Готово</Text>
          <Text style={styles.summaryTitle}>Совместный рисунок завершен</Text>
          <Text style={styles.summaryText}>
            За эту сессию было отправлено {events.length} stroke batch.
          </Text>
          <Text style={styles.summaryPeer}>Напарник: {peerName}</Text>
        </View>

        {!decision ? (
          <View style={styles.actionCard}>
            <Text style={styles.actionTitle}>Что делаем дальше?</Text>
            <Text style={styles.actionText}>
              Если оба выберут открыть, запустим чат и раскроем профили.
            </Text>
            <Pressable
              disabled={submitting}
              onPress={() => void handleDecision("open")}
              style={[styles.primaryButton, submitting && styles.disabledButton]}
            >
              <Text style={styles.primaryText}>Открыть чат и профили</Text>
            </Pressable>
            <Pressable
              disabled={submitting}
              onPress={() => void handleDecision("skip")}
              style={[styles.secondaryButton, submitting && styles.disabledButton]}
            >
              <Text style={styles.secondaryText}>Пропустить</Text>
            </Pressable>
          </View>
        ) : null}

        {waitingForPeer ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Ждем второго участника</Text>
            <Text style={styles.statusText}>
              Твое решение сохранено. Как только напарник ответит, продолжим автоматически.
            </Text>
          </View>
        ) : null}

        {showSoftEnding ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Сессия завершена мягко</Text>
            <Text style={styles.statusText}>
              Кто-то выбрал пропустить раскрытие. Рисунок завершен без открытия чата.
            </Text>
            <Pressable
              onPress={() => navigation.navigate("Tabs")}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryText}>Назад</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    gap: 14,
  },
  summaryCard: {
    borderRadius: theme.shapes.card,
    padding: 20,
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  summaryKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.1,
    marginBottom: 8,
  },
  summaryTitle: {
    color: theme.colors.text,
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 10,
  },
  summaryText: {
    color: theme.colors.subtext,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 10,
  },
  summaryPeer: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "700",
  },
  actionCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(24, 24, 40, 0.88)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  actionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  actionText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingVertical: 15,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  secondaryText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  disabledButton: {
    opacity: 0.6,
  },
  statusCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: theme.colors.cardElevated,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 12,
  },
  statusTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  statusText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
