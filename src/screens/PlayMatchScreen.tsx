import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  cancelPlayRequest,
  enqueuePlayRequest,
  isPlayActivity,
  subscribeOwnQueueEntry,
  tryMatchWaitingPlayer,
  type PlayActivity,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

type MatchBlockReason =
  | "auth"
  | "firebase"
  | "activity"
  | "profile";

function resolveMatchBlockReason(params: any, uid: string): MatchBlockReason | null {
  if (!uid) return "auth";
  if (!isFirebaseConfigured() || !db) return "firebase";
  if (!isPlayActivity(params?.activity)) return "activity";
  if (!makeNickname(uid).trim()) return "profile";
  return null;
}

function getBlockedState(reason: MatchBlockReason) {
  switch (reason) {
    case "auth":
      return {
        title: "Сессию пока нельзя начать",
        body: "Сначала войди в аккаунт, чтобы мы могли запустить совместную сессию и сохранить ее историю.",
        primaryLabel: "Открыть профиль",
        secondaryLabel: "Назад",
      };
    case "firebase":
      return {
        title: "Together временно не готов",
        body: "Мы не смогли подготовить соединение для старта. Вернись назад или открой Together позже.",
        primaryLabel: "Во Вместе",
        secondaryLabel: "Назад",
      };
    case "profile":
      return {
        title: "Нужно чуть больше данных",
        body: "Перед стартом нам нужно подготовить твой профиль для совместной сессии. Открой профиль и проверь, что он сохранен.",
        primaryLabel: "Открыть профиль",
        secondaryLabel: "Назад",
      };
    default:
      return {
        title: "Старт не удалось подготовить",
        body: "Формат этой сессии не распознан. Вернись во Вместе и запусти ее заново.",
        primaryLabel: "Во Вместе",
        secondaryLabel: "Назад",
      };
  }
}

export default function PlayMatchScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const uid = auth?.currentUser?.uid ?? "";
  const activity = isPlayActivity(route.params?.activity)
    ? (route.params.activity as PlayActivity)
    : null;
  const nickname = React.useMemo(() => makeNickname(uid), [uid]);
  const blockReason = resolveMatchBlockReason(route.params, uid);
  const blockedState = blockReason ? getBlockedState(blockReason) : null;
  const [busy, setBusy] = React.useState(false);
  const [queueCancelled, setQueueCancelled] = React.useState(false);
  const [statusTitle, setStatusTitle] = React.useState("Подготовим совместную сессию");
  const [statusText, setStatusText] = React.useState(
    "Сейчас поставим тебя в очередь и попробуем быстро найти человека, который тоже готов начать."
  );
  const mountedRef = React.useRef(true);
  const matchedSessionRef = React.useRef("");
  const cancelledRef = React.useRef(false);
  const cancellingPromiseRef = React.useRef<Promise<void> | null>(null);
  const allowLeaveRef = React.useRef(false);

  const returnToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const openProfile = React.useCallback(() => {
    navigation.navigate("Profile");
  }, [navigation]);

  const setBusySafe = React.useCallback((value: boolean) => {
    if (!mountedRef.current) return;
    setBusy(value);
  }, []);

  const setStatusSafe = React.useCallback((nextTitle: string, nextBody: string) => {
    if (!mountedRef.current) return;
    setStatusTitle(nextTitle);
    setStatusText(nextBody);
  }, []);

  const cancelQueue = React.useCallback(async () => {
    if (!db || !uid || matchedSessionRef.current) return;
    if (cancellingPromiseRef.current) {
      await cancellingPromiseRef.current;
      return;
    }

    const task = cancelPlayRequest(db, uid).catch(() => {});
    cancellingPromiseRef.current = task;
    await task;
    cancellingPromiseRef.current = null;
  }, [uid]);

  const enterSession = React.useCallback(
    (nextSessionId: string) => {
      if (!nextSessionId || matchedSessionRef.current || !mountedRef.current) return;
      matchedSessionRef.current = nextSessionId;
      allowLeaveRef.current = true;
      navigation.replace("PlayCanvas", { sessionId: nextSessionId });
    },
    [navigation]
  );

  const handleCancel = React.useCallback(async () => {
    if (allowLeaveRef.current) return;

    allowLeaveRef.current = true;
    cancelledRef.current = true;
    setQueueCancelled(true);
    setStatusSafe(
      "Поиск остановлен",
      "Очередь уже очищена. Можно спокойно вернуться назад и попробовать снова, когда будешь готов."
    );
    await cancelQueue();

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    returnToTogether();
  }, [cancelQueue, navigation, returnToTogether, setStatusSafe]);

  React.useEffect(() => {
    if (!busy || queueCancelled) return;

    const timer = setTimeout(() => {
      setStatusSafe(
        "Все еще ищем человека",
        "Обычно это происходит быстро, но иногда поиск занимает чуть больше времени. Оставайся здесь или вернись и попробуй снова позже."
      );
    }, 8000);

    return () => clearTimeout(timer);
  }, [busy, queueCancelled, setStatusSafe]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: any) => {
      if (allowLeaveRef.current || matchedSessionRef.current || blockReason) return;
      event.preventDefault();
      void handleCancel();
    });

    return unsubscribe;
  }, [blockReason, handleCancel, navigation]);

  React.useEffect(() => {
    mountedRef.current = true;
    cancelledRef.current = false;
    matchedSessionRef.current = "";
    allowLeaveRef.current = false;
    setQueueCancelled(false);
    setStatusSafe(
      "Подготовим совместную сессию",
      "Сейчас поставим тебя в очередь и попробуем быстро найти человека, который тоже готов начать."
    );

    if (blockReason || !activity) {
      setBusySafe(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setBusySafe(true);
    setStatusSafe(
      "Ищем человека",
      "Как только найдем второго участника, сразу откроем общий холст на двоих."
    );

    const unsubscribe = subscribeOwnQueueEntry(db!, uid, (entry) => {
      if (entry?.status === "cancelled" && !matchedSessionRef.current) {
        setQueueCancelled(true);
        setStatusSafe(
          "Поиск остановлен",
          "Очередь больше не активна. Можно спокойно вернуться и запустить новую совместную сессию."
        );
        setBusySafe(false);
        return;
      }

      if (entry?.sessionId) {
        setStatusSafe(
          "Напарник найден",
          "Подключаем вас к общему холсту. Это займет пару секунд."
        );
        enterSession(entry.sessionId);
      }
    });

    void (async () => {
      try {
        await enqueuePlayRequest(db!, uid, activity, nickname);
        if (!mountedRef.current || cancelledRef.current || matchedSessionRef.current) {
          await cancelQueue();
          return;
        }

        const result = await tryMatchWaitingPlayer(db!, uid, nickname, activity);
        if (!mountedRef.current || cancelledRef.current) {
          if (!result.sessionId) {
            await cancelQueue();
          }
          return;
        }

        if (result.sessionId) {
          setStatusSafe(
            "Напарник найден",
            "Подключаем вас к общему холсту. Это займет пару секунд."
          );
          enterSession(result.sessionId);
        }
      } catch {
        if (!mountedRef.current || cancelledRef.current) return;
        setBusySafe(false);
        setStatusSafe(
          "Не получилось начать поиск",
          "Мы не смогли подготовить очередь прямо сейчас. Попробуй снова через пару секунд или вернись назад."
        );
      } finally {
        setBusySafe(false);
      }
    })();

    return () => {
      mountedRef.current = false;
      cancelledRef.current = true;
      unsubscribe();
      void cancelQueue();
    };
  }, [activity, blockReason, cancelQueue, enterSession, nickname, setBusySafe, setStatusSafe, uid]);

  const handlePrimaryBlockedAction = React.useCallback(() => {
    if (!blockReason) return;
    if (blockReason === "auth" || blockReason === "profile") {
      openProfile();
      return;
    }
    if (blockReason === "firebase") {
      returnToTogether();
      return;
    }
    returnToTogether();
  }, [blockReason, navigation, openProfile, returnToTogether]);

  const handleSecondaryBlockedAction = React.useCallback(() => {
    allowLeaveRef.current = true;
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    returnToTogether();
  }, [navigation, returnToTogether]);

  if (blockedState) {
    return (
      <ScreenShell
        title="Старт Together"
        background="nightCity"
        showBack
        onBack={handleSecondaryBlockedAction}
      >
        <View style={styles.container}>
          <View style={styles.statusCard}>
            <View style={styles.centerGlow}>
              <Text style={styles.centerText}>вместе</Text>
            </View>
            <Text style={styles.title}>{blockedState.title}</Text>
            <Text style={styles.body}>{blockedState.body}</Text>
            <View style={styles.blockedButtons}>
              <Pressable onPress={handlePrimaryBlockedAction} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{blockedState.primaryLabel}</Text>
              </Pressable>
              <Pressable onPress={handleSecondaryBlockedAction} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{blockedState.secondaryLabel}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Старт Together"
      background="nightCity"
      showBack
      onBack={handleCancel}
    >
      <View style={styles.container}>
        <View style={styles.orbitWrap}>
          <View style={styles.orbitLarge} />
          <View style={styles.orbitSmall} />
          <View style={styles.centerGlow}>
            {busy ? (
              <ActivityIndicator color={theme.colors.accent} />
            ) : (
              <Text style={styles.centerText}>вместе</Text>
            )}
          </View>
        </View>

        <View style={styles.statusCard}>
          <Text style={styles.eyebrow}>7 минут на двоих</Text>
          <Text style={styles.title}>{statusTitle}</Text>
          <Text style={styles.body}>{statusText}</Text>
          <Text style={styles.caption}>
            Сначала пройдет общий опыт. После него чат откроется только если вы оба этого захотите.
          </Text>

          <View style={styles.actionRow}>
            <Pressable onPress={handleCancel} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Отменить</Text>
            </Pressable>
            {!busy ? (
              <Pressable
                onPress={() => {
                  allowLeaveRef.current = true;
                  navigation.replace("PlayMatch", { activity: "draw" });
                }}
                style={styles.ghostButton}
              >
                <Text style={styles.ghostButtonText}>Попробовать снова</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  orbitWrap: {
    width: 240,
    height: 240,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  orbitLarge: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  orbitSmall: {
    position: "absolute",
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
  },
  centerGlow: {
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: theme.colors.cardElevated,
    borderWidth: 1,
    borderColor: "rgba(255, 78, 138, 0.28)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  centerText: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 0.6,
  },
  statusCard: {
    width: "100%",
    borderRadius: theme.shapes.card,
    padding: 22,
    backgroundColor: "rgba(17, 20, 36, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    gap: 10,
  },
  eyebrow: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text,
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  caption: {
    color: theme.colors.muted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 10,
    marginTop: 8,
    flexWrap: "wrap",
  },
  blockedButtons: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
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
    fontSize: 15,
    fontWeight: "700",
  },
  ghostButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.28)",
  },
  ghostButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
