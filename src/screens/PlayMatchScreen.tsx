import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import {
  cancelPlayRequest,
  enqueuePlayRequest,
  getPlayMatchModeCopy,
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
        title: "Нужен вход в аккаунт",
        body: "Только после входа можно запустить совместную сессию и сохранить общую историю.",
        primaryLabel: "Открыть профиль",
        secondaryLabel: "Назад",
      };
    case "firebase":
      return {
        title: "Together временно недоступен",
        body: "Мы не смогли подготовить соединение для совместной сессии. Вернись в Together и попробуй еще раз.",
        primaryLabel: "Во Вместе",
        secondaryLabel: "Назад",
      };
    case "profile":
      return {
        title: "Проверь профиль перед стартом",
        body: "Перед запуском Together нужен сохранённый профиль, чтобы мы могли собрать пару и историю сессии.",
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

function getActivityIcon(activity: PlayActivity | null): keyof typeof Ionicons.glyphMap {
  switch (activity) {
    case "chain_draw":
      return "sync-outline";
    case "daily_prompt":
      return "sunny-outline";
    case "color_mood":
      return "color-palette-outline";
    case "draw":
    default:
      return "brush-outline";
  }
}

function getBlockedIcon(reason: MatchBlockReason | null): keyof typeof Ionicons.glyphMap {
  switch (reason) {
    case "auth":
    case "profile":
      return "person-circle-outline";
    case "firebase":
      return "cloud-offline-outline";
    default:
      return "alert-circle-outline";
  }
}

function getMatchStateMeta(
  busy: boolean,
  queueCancelled: boolean,
  statusTitle: string
) {
  if (busy) {
    return {
      label: "Ищем",
      hint: "Окно можно не закрывать: как только человек найдётся, следующий этап откроется сам.",
      tone: "live" as const,
    };
  }

  if (queueCancelled || statusTitle === "Поиск остановлен") {
    return {
      label: "Пауза",
      hint: "Поиск уже остановлен. Можно вернуться назад или запустить его снова чуть позже.",
      tone: "paused" as const,
    };
  }

  if (statusTitle === "Не получилось начать поиск") {
    return {
      label: "Повтор",
      hint: "Очередь не стартовала корректно. Повтори попытку или вернись в Together.",
      tone: "error" as const,
    };
  }

  if (statusTitle === "Напарник найден") {
    return {
      label: "Найден",
      hint: "Подключаем общий этап. Это займёт всего пару секунд.",
      tone: "ready" as const,
    };
  }

  return {
    label: "Старт",
    hint: "Сейчас подготовим очередь и сразу перейдём к совместному этапу, как только найдётся человек.",
    tone: "ready" as const,
  };
}

export default function PlayMatchScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const uid = auth?.currentUser?.uid ?? "";
  const activity = isPlayActivity(route.params?.activity)
    ? (route.params.activity as PlayActivity)
    : null;
  const modeCopy = React.useMemo(() => getPlayMatchModeCopy(activity), [activity]);
  const activityIcon = React.useMemo(() => getActivityIcon(activity), [activity]);
  const nickname = React.useMemo(() => makeNickname(uid), [uid]);
  const blockReason = resolveMatchBlockReason(route.params, uid);
  const blockedState = blockReason ? getBlockedState(blockReason) : null;
  const [busy, setBusy] = React.useState(false);
  const [queueCancelled, setQueueCancelled] = React.useState(false);
  const [statusTitle, setStatusTitle] = React.useState("Подготовим совместную сессию");
  const [statusText, setStatusText] = React.useState(modeCopy.preparingBody);
  const stateMeta = React.useMemo(
    () => getMatchStateMeta(busy, queueCancelled, statusTitle),
    [busy, queueCancelled, statusTitle]
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

  const retryMatch = React.useCallback(() => {
    allowLeaveRef.current = true;
    navigation.replace("PlayMatch", { activity: activity ?? "draw" });
  }, [activity, navigation]);

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
      navigation.replace(activity === "color_mood" ? "PlayColorMood" : "PlayCanvas", {
        sessionId: nextSessionId,
      });
    },
    [activity, navigation]
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
        modeCopy.delayedBody
      );
    }, 8000);

    return () => clearTimeout(timer);
  }, [busy, modeCopy.delayedBody, queueCancelled, setStatusSafe]);

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
      modeCopy.preparingBody
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
      modeCopy.searchingBody
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
          modeCopy.foundBody
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
            modeCopy.foundBody
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
  }, [
    activity,
    blockReason,
    cancelQueue,
    enterSession,
    modeCopy.foundBody,
    modeCopy.preparingBody,
    modeCopy.searchingBody,
    nickname,
    setBusySafe,
    setStatusSafe,
    uid,
  ]);

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
  }, [blockReason, openProfile, returnToTogether]);

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
        title="Together"
        background="togetherMain"
        overlayOpacity={0.24}
        blurRadius={0}
        showBack
        onBack={handleSecondaryBlockedAction}
      >
        <View style={styles.container}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <Text style={styles.kicker}>Together подготавливает старт</Text>
              <View style={[styles.stateChip, styles.stateChipPaused]}>
                <Text style={[styles.stateChipText, styles.stateChipTextPaused]}>
                  Нужно действие
                </Text>
              </View>
            </View>
            <View style={styles.modeChip}>
              <Text style={styles.modeChipText}>{modeCopy.eyebrow}</Text>
            </View>
            <Text style={styles.title}>{blockedState.title}</Text>
            <Text style={styles.body}>{blockedState.body}</Text>
          </View>

          <View style={styles.signalCard}>
            <View style={styles.signalHaloLarge} />
            <View style={styles.signalHaloSmall} />
            <View style={styles.signalCore}>
              <Ionicons
                name={getBlockedIcon(blockReason)}
                size={28}
                color="#FFFFFF"
              />
            </View>
            <Text style={styles.signalText}>
              Этот экран теперь остаётся частью основного потока Together, а не отдельным старым модулем.
            </Text>
          </View>

          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>Что нужно сделать</Text>
            <Text style={styles.caption}>{blockedState.body}</Text>
          </View>

          <View style={styles.blockedButtons}>
            <Pressable onPress={handlePrimaryBlockedAction} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{blockedState.primaryLabel}</Text>
            </Pressable>
            <Pressable onPress={handleSecondaryBlockedAction} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{blockedState.secondaryLabel}</Text>
            </Pressable>
          </View>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title="Together"
      background="togetherMain"
      overlayOpacity={0.24}
      blurRadius={0}
      showBack
      onBack={handleCancel}
    >
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.kicker}>Together подбирает пару</Text>
            <View
              style={[
                styles.stateChip,
                stateMeta.tone === "live"
                  ? styles.stateChipLive
                  : stateMeta.tone === "error"
                    ? styles.stateChipError
                    : stateMeta.tone === "paused"
                      ? styles.stateChipPaused
                      : styles.stateChipReady,
              ]}
            >
              <Text
                style={[
                  styles.stateChipText,
                  stateMeta.tone === "live"
                    ? styles.stateChipTextLive
                    : stateMeta.tone === "error"
                      ? styles.stateChipTextError
                      : stateMeta.tone === "paused"
                        ? styles.stateChipTextPaused
                        : styles.stateChipTextReady,
                ]}
              >
                {stateMeta.label}
              </Text>
            </View>
          </View>

          <View style={styles.modeChip}>
            <Text style={styles.modeChipText}>{modeCopy.eyebrow}</Text>
          </View>
          <Text style={styles.title}>{statusTitle}</Text>
          <Text style={styles.body}>{statusText}</Text>
        </View>

        <View style={styles.signalCard}>
          <View style={styles.signalHaloLarge} />
          <View style={styles.signalHaloSmall} />
          <View style={styles.signalCore}>
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons name={activityIcon} size={28} color="#FFFFFF" />
            )}
          </View>
          <Text style={styles.signalText}>{stateMeta.hint}</Text>
        </View>

        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Что будет дальше</Text>
          <Text style={styles.caption}>{modeCopy.caption}</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={handleCancel} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>
              {busy ? "Остановить поиск" : "Назад"}
            </Text>
          </Pressable>
          {!busy ? (
            <Pressable onPress={retryMatch} style={styles.ghostButton}>
              <Text style={styles.ghostButtonText}>Попробовать снова</Text>
            </Pressable>
          ) : null}
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
    paddingHorizontal: 18,
    paddingBottom: 24,
    gap: 14,
  },
  heroCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(12, 16, 31, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
  },
  heroTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  kicker: {
    flex: 1,
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  stateChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  stateChipLive: {
    backgroundColor: "rgba(255, 78, 138, 0.16)",
    borderColor: "rgba(255, 78, 138, 0.28)",
  },
  stateChipReady: {
    backgroundColor: "rgba(255, 122, 60, 0.14)",
    borderColor: "rgba(255, 122, 60, 0.24)",
  },
  stateChipPaused: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: theme.colors.borderSubtle,
  },
  stateChipError: {
    backgroundColor: "rgba(255, 77, 103, 0.14)",
    borderColor: "rgba(255, 77, 103, 0.24)",
  },
  stateChipText: {
    fontSize: 11,
    fontWeight: "800",
  },
  stateChipTextLive: {
    color: theme.colors.primary,
  },
  stateChipTextReady: {
    color: theme.colors.accent,
  },
  stateChipTextPaused: {
    color: theme.colors.text,
  },
  stateChipTextError: {
    color: theme.colors.danger,
  },
  modeChip: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  modeChipText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  signalCard: {
    width: "100%",
    maxWidth: 460,
    minHeight: 212,
    borderRadius: theme.shapes.card,
    paddingHorizontal: 20,
    paddingVertical: 22,
    backgroundColor: "rgba(10, 14, 28, 0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  signalHaloLarge: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  signalHaloSmall: {
    position: "absolute",
    width: 154,
    height: 154,
    borderRadius: 77,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.22)",
  },
  signalCore: {
    width: 98,
    height: 98,
    borderRadius: 49,
    backgroundColor: "rgba(255, 78, 138, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.primary,
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  signalText: {
    marginTop: 16,
    color: "rgba(255,255,255,0.88)",
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    maxWidth: 320,
  },
  noteCard: {
    width: "100%",
    maxWidth: 460,
    borderRadius: theme.shapes.card,
    padding: 16,
    backgroundColor: "rgba(17, 20, 36, 0.78)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 6,
  },
  noteTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  title: {
    color: theme.colors.text,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: "800",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  caption: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: "row",
    width: "100%",
    maxWidth: 460,
    justifyContent: "flex-start",
    gap: 10,
    flexWrap: "wrap",
  },
  blockedButtons: {
    width: "100%",
    maxWidth: 460,
    gap: 10,
  },
  primaryButton: {
    borderRadius: theme.shapes.pill,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 13,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.pill,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
  ghostButton: {
    borderRadius: theme.shapes.pill,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: theme.colors.accentSoft,
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostButtonText: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "700",
  },
});
