import React from "react";
import {
  ActivityIndicator,
  Pressable,
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

import ScreenShell from "@/components/ScreenShell";
import { auth, db, isFirebaseConfigured } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayMatchRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import {
  cancelPlayRequest,
  enqueuePlayRequest,
  expirePlayRequest,
  getPlayMatchModeCopy,
  isReleasePlayActivity,
  PLAY_QUEUE_TTL_MS,
  subscribeOwnQueueEntry,
  tryMatchWaitingPlayer,
  type ReleasePlayActivity,
} from "@/services/playSessions";
import { getUserProfile } from "@/services/user";
import { theme } from "@/theme";
import {
  getFirestoreErrorCode,
  getFirestoreErrorMessage,
  isFirestoreMissingIndexError,
  logFirestoreMissingIndexError,
} from "@/utils/firestoreErrors";

type MatchBlockReason =
  | "auth"
  | "firebase"
  | "activity"
  | "profile";

type MatchStatusKey =
  | "preparing"
  | "searching"
  | "delayed"
  | "found"
  | "cancelled"
  | "expired"
  | "error";

type TranslateFn = (key: string, fallback: string, params?: Record<string, string>) => string;

const PLAY_QUEUE_RETRY_INTERVAL_MS = 3000;
const PLAY_QUEUE_DELAYED_MS = 9000;

function resolveMatchBlockReason(
  activity: ReleasePlayActivity | null,
  uid: string,
  profileLoaded: boolean,
  displayName: string
): MatchBlockReason | null {
  if (!uid) return "auth";
  if (!isFirebaseConfigured() || !db) return "firebase";
  if (!activity) return "activity";
  if (!profileLoaded || !displayName.trim()) return "profile";
  return null;
}

function getBlockedState(reason: MatchBlockReason, tt: TranslateFn) {
  switch (reason) {
    case "auth":
      return {
        title: tt("play.match.blocked.authTitle", "Нужен вход в аккаунт"),
        body: tt(
          "play.match.authRequired",
          "Нужно войти, чтобы начать общий рисунок."
        ),
        primaryLabel: tt("common.back", "Назад"),
        secondaryLabel: tt("common.backToTogether", "Вернуться во Вместе"),
      };
    case "firebase":
      return {
        title: tt("play.match.blocked.firebaseTitle", "Together временно недоступен"),
        body: tt(
          "play.match.blocked.firebaseBody",
          "Мы не смогли подготовить соединение для совместной сессии. Вернись в Together и попробуй еще раз."
        ),
        primaryLabel: tt("common.backToTogether", "Вернуться во Вместе"),
        secondaryLabel: tt("common.back", "Назад"),
      };
    case "profile":
      return {
        title: tt("play.match.blocked.profileTitle", "Проверь профиль перед стартом"),
        body: tt(
          "play.match.blocked.profileBody",
          "Перед запуском Together нужен сохранённый профиль, чтобы мы могли собрать пару и историю сессии."
        ),
        primaryLabel: tt("common.openProfile", "Открыть профиль"),
        secondaryLabel: tt("common.back", "Назад"),
      };
    default:
      return {
        title: tt("play.match.blocked.activityTitle", "Старт не удалось подготовить"),
        body: tt(
          "play.match.invalidActivity",
          "Формат этой сессии не распознан. Вернись во Вместе и запусти ее заново."
        ),
        primaryLabel: tt("common.backToTogether", "Вернуться во Вместе"),
        secondaryLabel: tt("common.back", "Назад"),
      };
  }
}

function getActivityIcon(activity: ReleasePlayActivity | null): keyof typeof Ionicons.glyphMap {
  switch (activity) {
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
  statusKey: MatchStatusKey,
  tt: TranslateFn
) {
  if (statusKey === "searching" || statusKey === "delayed") {
    return {
      label: tt("play.match.state.searchingLabel", "Ищем"),
      hint:
        statusKey === "delayed"
          ? tt(
              "play.match.stillSearching",
              "Пока никого нет, но поиск продолжается."
            )
          : tt(
              "play.match.searchCanStayOpen",
              "Ты в очереди. Можно не нажимать заново."
            ),
      tone: "live" as const,
    };
  }

  if (statusKey === "expired") {
    return {
      label: tt("play.match.state.retryLabel", "Повтор"),
      hint: tt(
        "play.match.notFoundTryAgain",
        "Пока никого не нашли. Попробуйте снова."
      ),
      tone: "paused" as const,
    };
  }

  if (statusKey === "cancelled") {
    return {
      label: tt("play.match.state.pausedLabel", "Пауза"),
      hint: tt(
        "play.match.state.pausedHint",
        "Поиск уже остановлен. Можно вернуться назад или запустить его снова чуть позже."
      ),
      tone: "paused" as const,
    };
  }

  if (statusKey === "error") {
    return {
      label: tt("play.match.state.retryLabel", "Повтор"),
      hint: tt(
        "play.match.state.retryHint",
        "Проверь интернет и попробуй ещё раз или вернись в Together."
      ),
      tone: "error" as const,
    };
  }

  if (statusKey === "found") {
    return {
      label: tt("play.match.state.foundLabel", "Найден"),
      hint: tt(
        "play.match.state.foundHint",
        "Подключаем общий этап. Это займёт всего пару секунд."
      ),
      tone: "ready" as const,
    };
  }

  return {
    label: tt("play.match.state.startLabel", "Старт"),
    hint: tt(
      "play.match.state.startHint",
      "Сейчас подготовим очередь и сразу перейдём к совместному этапу, как только найдётся человек."
    ),
    tone: "ready" as const,
  };
}

function getPlayQueueErrorKey(error: unknown) {
  if (isFirestoreMissingIndexError(error)) return "play.match.queueSetupError";

  const code = getFirestoreErrorCode(error);
  if (code === "auth/no-current-user") return "play.match.authRequired";
  if (code === "permission-denied") return "play.match.queuePermissionError";
  if (
    code === "unavailable" ||
    code === "auth/network-request-failed" ||
    code === "network-request-failed" ||
    code.toLowerCase().includes("network")
  ) {
    return "play.match.queueNetworkError";
  }
  return "play.match.queueSetupError";
}

function getPlayQueueErrorFallback(errorKey: string) {
  switch (errorKey) {
    case "play.match.queueSetupError":
      return "Сервис временно настраивается. Попробуйте позже.";
    case "play.match.authRequired":
      return "Нужно войти, чтобы начать общий рисунок.";
    case "play.match.queuePermissionError":
      return "Не получилось получить доступ к очереди. Попробуй войти снова или повторить позже.";
    case "play.match.queueNetworkError":
      return "Проверь подключение к интернету и попробуй ещё раз.";
    case "play.match.queueExpired":
      return "Пока никого не нашли. Попробуйте снова.";
    default:
      return "Не получилось начать общий рисунок. Проверьте интернет и попробуйте ещё раз.";
  }
}

function logPlayQueueError(error: unknown) {
  if (isFirestoreMissingIndexError(error)) {
    logFirestoreMissingIndexError("PlayMatch playQueue", error);
    return;
  }

  console.error("PlayMatch enqueue error", {
    code: getFirestoreErrorCode(error),
    message: getFirestoreErrorMessage(error),
  });
}

export default function PlayMatchScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayMatch">>();
  const route = useRoute<PlayMatchRouteProp>();
  const { t } = useLocale();
  const tt = React.useCallback<TranslateFn>(
    (key, fallback, params) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const currentUser = auth?.currentUser ?? null;
  const uid = currentUser?.uid ?? "";
  const routeActivity = route.params?.activity;
  const activity = isReleasePlayActivity(routeActivity)
    ? routeActivity
    : null;
  const modeCopy = React.useMemo(() => getPlayMatchModeCopy(activity), [activity]);
  const activityIcon = React.useMemo(() => getActivityIcon(activity), [activity]);
  const [profileDisplayName, setProfileDisplayName] = React.useState("");
  const [profileLoaded, setProfileLoaded] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    setProfileLoaded(false);
    setProfileDisplayName("");
    if (!uid) {
      setProfileLoaded(true);
      return () => {
        alive = false;
      };
    }

    void getUserProfile()
      .then((profile) => {
        if (!alive) return;
        setProfileDisplayName(profile.displayName?.trim() ?? "");
      })
      .catch(() => {
        if (!alive) return;
        setProfileDisplayName("");
      })
      .finally(() => {
        if (!alive) return;
        setProfileLoaded(true);
      });

    return () => {
      alive = false;
    };
  }, [uid]);
  const blockReason = resolveMatchBlockReason(activity, uid, profileLoaded, profileDisplayName);
  const blockedState = React.useMemo(
    () => (blockReason ? getBlockedState(blockReason, tt) : null),
    [blockReason, tt]
  );
  const [busy, setBusy] = React.useState(false);
  const [queueCancelled, setQueueCancelled] = React.useState(false);
  const [statusKey, setStatusKey] = React.useState<MatchStatusKey>("preparing");
  const [queueErrorKey, setQueueErrorKey] = React.useState<string | null>(null);
  const statusTitle = React.useMemo(() => {
    if (activity === "draw") {
      switch (statusKey) {
        case "searching":
          return tt("play.match.waitingForPartner", "Ищем второго человека");
        case "delayed":
          return tt("play.match.status.delayedDrawTitle", "Ищем ещё немного");
        case "found":
          return tt("play.match.status.foundDrawTitle", "Человек найден");
        case "cancelled":
          return tt("play.match.status.cancelledTitle", "Поиск остановлен");
        case "expired":
          return tt("play.match.queueExpired", "Поиск завершился");
        case "error":
          return tt("play.match.status.errorDrawTitle", "Не получилось начать общий рисунок");
        case "preparing":
        default:
          return tt("play.match.status.preparingDrawTitle", "Готовим общий рисунок");
      }
    }

    switch (statusKey) {
      case "searching":
        return tt("play.match.waitingForPartner", "Ищем второго человека");
      case "delayed":
        return tt("play.match.status.delayedTitle", "Все еще ищем человека");
      case "found":
        return tt("play.match.status.foundTitle", "Напарник найден");
      case "cancelled":
        return tt("play.match.status.cancelledTitle", "Поиск остановлен");
      case "expired":
        return tt("play.match.queueExpired", "Поиск завершился");
      case "error":
        return tt("play.match.status.errorTitle", "Не получилось начать поиск");
      case "preparing":
      default:
        return tt("play.match.status.preparingTitle", "Подготовим совместную сессию");
    }
  }, [activity, statusKey, tt]);
  const statusText = React.useMemo(() => {
    switch (statusKey) {
      case "searching":
        return tt(
          "play.match.searchCanStayOpen",
          "Ты в очереди. Можно не нажимать заново."
        );
      case "delayed":
        return tt(
          "play.match.stillSearching",
          "Пока никого нет, но поиск продолжается."
        );
      case "found":
        return modeCopy.foundBody;
      case "cancelled":
        return tt(
          "play.match.status.cancelledBody",
          "Очередь уже очищена. Можно спокойно вернуться назад и попробовать снова, когда будешь готов."
        );
      case "expired":
        return tt(
          "play.match.notFoundTryAgain",
          "Пока никого не нашли. Попробуйте снова."
        );
      case "error":
        {
          const errorKey = queueErrorKey ?? "play.match.queueSetupError";
          return tt(errorKey, getPlayQueueErrorFallback(errorKey));
        }
      case "preparing":
      default:
        return modeCopy.preparingBody;
    }
  }, [
    modeCopy.foundBody,
    modeCopy.preparingBody,
    queueErrorKey,
    statusKey,
    tt,
  ]);
  const stateMeta = React.useMemo(
    () => getMatchStateMeta(statusKey, tt),
    [statusKey, tt]
  );
  const mountedRef = React.useRef(true);
  const matchedSessionRef = React.useRef("");
  const cancelledRef = React.useRef(false);
  const cancellingPromiseRef = React.useRef<Promise<void> | null>(null);
  const expiringPromiseRef = React.useRef<Promise<void> | null>(null);
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

  const setStatusSafe = React.useCallback((nextStatusKey: MatchStatusKey) => {
    if (!mountedRef.current) return;
    setStatusKey(nextStatusKey);
  }, []);

  const handleQueueRuntimeError = React.useCallback(
    (error: unknown) => {
      logPlayQueueError(error);
      if (!mountedRef.current || cancelledRef.current) return;
      cancelledRef.current = true;
      setQueueErrorKey(getPlayQueueErrorKey(error));
      setBusySafe(false);
      setStatusSafe("error");
    },
    [setBusySafe, setStatusSafe]
  );

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
  }, [db, uid]);

  const expireQueue = React.useCallback(async () => {
    if (!db || !uid || matchedSessionRef.current) return;
    if (expiringPromiseRef.current) {
      await expiringPromiseRef.current;
      return;
    }

    const task = expirePlayRequest(db, uid).catch(() => {});
    expiringPromiseRef.current = task;
    await task;
    expiringPromiseRef.current = null;
  }, [db, uid]);

  const handleQueueExpired = React.useCallback(async () => {
    if (!mountedRef.current || matchedSessionRef.current || cancelledRef.current) return;
    cancelledRef.current = true;
    setQueueCancelled(false);
    setQueueErrorKey(null);
    setBusySafe(false);
    setStatusSafe("expired");
    await expireQueue();
  }, [expireQueue, setBusySafe, setStatusSafe]);

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
    setStatusSafe("cancelled");
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
      setStatusSafe("delayed");
    }, PLAY_QUEUE_DELAYED_MS);

    return () => clearTimeout(timer);
  }, [busy, queueCancelled, setStatusSafe]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener("beforeRemove", (event: EventArg<"beforeRemove", true, undefined>) => {
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
    expiringPromiseRef.current = null;
    setQueueCancelled(false);
    setQueueErrorKey(null);
    setStatusSafe("preparing");

    if (blockReason || !activity) {
      setBusySafe(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setBusySafe(true);
    setStatusSafe("searching");

    let unsubscribe = () => {};
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let expiryTimer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const clearRetryTimer = () => {
      if (!retryTimer) return;
      clearTimeout(retryTimer);
      retryTimer = null;
    };

    const clearExpiryTimer = () => {
      if (!expiryTimer) return;
      clearTimeout(expiryTimer);
      expiryTimer = null;
    };

    const stopQueueLoop = () => {
      stopped = true;
      clearRetryTimer();
      clearExpiryTimer();
    };

    const scheduleRetry = (expiresAt: number) => {
      clearRetryTimer();
      if (stopped || cancelledRef.current || matchedSessionRef.current) return;

      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        void handleQueueExpired();
        return;
      }

      retryTimer = setTimeout(() => {
        void runMatchAttempt(expiresAt);
      }, Math.min(PLAY_QUEUE_RETRY_INTERVAL_MS, remainingMs));
    };

    const runMatchAttempt = async (expiresAt: number): Promise<void> => {
      if (stopped || cancelledRef.current || matchedSessionRef.current) return;
      if (Date.now() >= expiresAt) {
        await handleQueueExpired();
        return;
      }

      try {
        const result = await tryMatchWaitingPlayer(db!, uid, profileDisplayName, activity);
        if (!mountedRef.current || stopped || cancelledRef.current) {
          return;
        }

        if (result.sessionId) {
          stopQueueLoop();
          setStatusSafe("found");
          enterSession(result.sessionId);
          return;
        }

        if (result.expired) {
          await handleQueueExpired();
          return;
        }

        scheduleRetry(expiresAt);
      } catch (error) {
        if (!mountedRef.current || stopped || matchedSessionRef.current) return;
        stopQueueLoop();
        await cancelQueue();
        handleQueueRuntimeError(error);
      }
    };

    void (async () => {
      try {
        const activeUid = auth?.currentUser?.uid ?? "";
        if (!activeUid || activeUid !== uid) {
          const error = new Error("No authenticated user for play queue");
          (error as Error & { code?: string }).code = "auth/no-current-user";
          throw error;
        }
        if (!activity || !isReleasePlayActivity(activity)) {
          const error = new Error("Invalid release activity for play queue");
          (error as Error & { code?: string }).code = "play/invalid-activity";
          throw error;
        }

        const queueEntry = await enqueuePlayRequest(db!, uid, activity, profileDisplayName);
        if (!mountedRef.current || cancelledRef.current || matchedSessionRef.current) {
          await cancelQueue();
          return;
        }
        const expiresAt =
          queueEntry.expiresAt > Date.now()
            ? queueEntry.expiresAt
            : Date.now() + PLAY_QUEUE_TTL_MS;

        unsubscribe = subscribeOwnQueueEntry(db!, uid, (entry) => {
          if (entry?.status === "cancelled" && !matchedSessionRef.current) {
            stopQueueLoop();
            cancelledRef.current = true;
            setQueueCancelled(true);
            setStatusSafe("cancelled");
            setBusySafe(false);
            return;
          }

          if (entry?.status === "expired" && !matchedSessionRef.current) {
            stopQueueLoop();
            cancelledRef.current = true;
            setStatusSafe("expired");
            setBusySafe(false);
            return;
          }

          if (entry?.status === "matched" && entry.sessionId) {
            stopQueueLoop();
            setStatusSafe("found");
            enterSession(entry.sessionId);
          }
        }, handleQueueRuntimeError);

        if (!mountedRef.current || cancelledRef.current || matchedSessionRef.current) {
          unsubscribe();
          await cancelQueue();
          return;
        }

        expiryTimer = setTimeout(() => {
          void handleQueueExpired();
        }, Math.max(expiresAt - Date.now(), 0));
        await runMatchAttempt(expiresAt);
      } catch (error) {
        if (!mountedRef.current || cancelledRef.current) return;
        stopQueueLoop();
        unsubscribe();
        await cancelQueue();
        handleQueueRuntimeError(error);
      }
    })();

    return () => {
      stopQueueLoop();
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
    handleQueueExpired,
    handleQueueRuntimeError,
    profileDisplayName,
    setBusySafe,
    setStatusSafe,
    uid,
  ]);

  const handlePrimaryBlockedAction = React.useCallback(() => {
    if (!blockReason) return;
    if (blockReason === "auth") {
      allowLeaveRef.current = true;
      if (navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      returnToTogether();
      return;
    }
    if (blockReason === "profile") {
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
        title={t("tabs.together")}
        background="togetherMain"
        overlayOpacity={0.24}
        blurRadius={0}
        showBack
        onBack={handleSecondaryBlockedAction}
      >
        <View style={styles.container}>
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <Text style={styles.kicker}>
                {tt("play.match.blockedHeroKicker", "Together подготавливает старт")}
              </Text>
              <View style={[styles.stateChip, styles.stateChipPaused]}>
                <Text style={[styles.stateChipText, styles.stateChipTextPaused]}>
                  {tt("play.match.blockedHeroBadge", "Нужно действие")}
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
              {tt(
                "play.match.blockedSignalText",
                "Этот экран остаётся частью основного пути Together: здесь готовится пара и открывается общий этап."
              )}
            </Text>
          </View>

          <View style={styles.noteCard}>
            <Text style={styles.noteTitle}>{tt("play.match.blockedNoteTitle", "Что нужно сделать")}</Text>
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
      title={t("tabs.together")}
      background="togetherMain"
      overlayOpacity={0.24}
      blurRadius={0}
      showBack
      onBack={handleCancel}
    >
      <View style={styles.container}>
        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <Text style={styles.kicker}>
              {tt("play.match.heroKicker", "Together подбирает пару")}
            </Text>
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
          <Text style={styles.noteTitle}>{tt("play.match.noteTitle", "Что будет дальше")}</Text>
          <Text style={styles.caption}>{modeCopy.caption}</Text>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={handleCancel} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>
              {busy
                ? tt("play.match.cancelSearch", "Отменить поиск")
                : tt("common.back", "Назад")}
            </Text>
          </Pressable>
          {!busy ? (
            <Pressable onPress={retryMatch} style={styles.ghostButton}>
              <Text style={styles.ghostButtonText}>
                {tt("play.match.tryAgain", "Попробовать снова")}
              </Text>
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
