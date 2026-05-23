import React from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayMatchRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import {
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import * as togetherApi from "@/services/api/togetherApi";
import type {
  TogetherActivity,
  TogetherQueueEntry,
  TogetherQueueLocationInput,
} from "@/services/api/types";
import { theme } from "@/theme";

type MatchStatusKey =
  | "preparing"
  | "searching"
  | "delayed"
  | "found"
  | "cancelled"
  | "expired"
  | "error";

type TranslateFn = (key: string, fallback: string, params?: Record<string, string>) => string;
type TogetherRadiusKm = 5 | 25 | 100 | 250 | null;

const POLL_INTERVAL_MS = 2000;
const DELAYED_MS = 9000;

function interpolateFallback(fallback: string, params?: Record<string, string>) {
  let value = fallback;
  if (!params) return value;
  for (const [key, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${key}}`, replacement);
  }
  return value;
}

function formatQueueExpiresAt(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLocationMetadata(location?: TogetherQueueLocationInput) {
  return {
    radiusKm: location?.radiusKm ?? null,
    hasCoordinates:
      Number.isFinite(location?.latitude) &&
      Number.isFinite(location?.longitude),
  };
}

function radiusLabelFor(radiusKm: TogetherRadiusKm, tt: TranslateFn) {
  if (radiusKm === null) {
    return tt("together.geo.anywhere", "Без ограничения");
  }

  return tt(`together.geo.${radiusKm}km`, `${radiusKm} км`);
}

function radiusSearchTextFor(radiusKm: TogetherRadiusKm, tt: TranslateFn) {
  if (radiusKm === null) {
    return tt("play.match.searchingNoLimit", "Ищем без ограничения");
  }

  return tt("play.match.searchingRadius", "Ищем в радиусе {radius}", {
    radius: radiusLabelFor(radiusKm, tt),
  });
}

function getMatchStateMeta(statusKey: MatchStatusKey, tt: TranslateFn) {
  if (statusKey === "searching" || statusKey === "delayed") {
    return {
      label: tt("play.match.state.searchingLabel", "Ищем"),
      hint:
        statusKey === "delayed"
          ? tt("play.match.stillSearching", "Поиск продолжается. Оставьте экран открытым.")
          : tt("play.match.searchCanStayOpen", "Ты в очереди. Можно не нажимать заново."),
      tone: "live" as const,
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

  if (statusKey === "expired") {
    return {
      label: tt("play.match.state.retryLabel", "Повтор"),
      hint: tt("play.match.notFoundTryAgain", "Пока никого не нашли. Попробуйте снова."),
      tone: "paused" as const,
    };
  }

  if (statusKey === "cancelled") {
    return {
      label: tt("play.match.state.pausedLabel", "Пауза"),
      hint: tt(
        "play.match.state.pausedHint",
        "Поиск остановлен. Можно вернуться назад или запустить его снова позже."
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

  return {
    label: tt("play.match.state.startLabel", "Старт"),
    hint: tt(
      "play.match.state.startHint",
      "Сейчас подготовим очередь и перейдём к общему холсту, как только найдётся человек."
    ),
    tone: "ready" as const,
  };
}

function getStatusTitle(statusKey: MatchStatusKey, tt: TranslateFn) {
  return getActivityStatusTitle("draw", statusKey, tt);
}

function getActivityStatusTitle(
  activity: TogetherActivity,
  statusKey: MatchStatusKey,
  tt: TranslateFn
) {
  const suffix =
    activity === "story_sparks"
      ? "StorySparks"
      : "Draw";
  switch (statusKey) {
    case "searching":
      return tt(`play.match.status.searching${suffix}Title`, "Ищем второго человека");
    case "delayed":
      return tt(`play.match.status.delayed${suffix}Title`, "Ищем ещё немного");
    case "found":
      return tt(`play.match.status.found${suffix}Title`, "Человек найден");
    case "cancelled":
      return tt("play.match.status.cancelledTitle", "Поиск остановлен");
    case "expired":
      return tt("play.match.queueExpired", "Поиск завершился");
    case "error":
      return tt(`play.match.status.error${suffix}Title`, "Не получилось начать совместную сессию");
    case "preparing":
    default:
      return tt(`play.match.status.preparing${suffix}Title`, "Готовим совместную сессию");
  }
}

function nextRouteForActivity(activity: TogetherActivity) {
  if (activity === "story_sparks") return "PlayStorySparks";
  return "PlayCanvas";
}

export default function PlayMatchScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayMatch">>();
  const route = useRoute<PlayMatchRouteProp>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const tt = React.useCallback<TranslateFn>(
    (key, fallback, params) => {
      const value = t(key, params);
      return value === key ? interpolateFallback(fallback, params) : value;
    },
    [t]
  );

  const uid = authUser?.id ?? "";
  const rawActivity = (route.params as { activity?: unknown } | undefined)?.activity;
  const routeQueueLocation = (route.params as { location?: TogetherQueueLocationInput } | undefined)
    ?.location;
  const activity: TogetherActivity | null =
    rawActivity === "draw" || rawActivity === "story_sparks"
      ? rawActivity
      : null;
  const [statusKey, setStatusKey] = React.useState<MatchStatusKey>("preparing");
  const [entry, setEntry] = React.useState<TogetherQueueEntry | null>(null);
  const [errorText, setErrorText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const [queueStartedAt, setQueueStartedAt] = React.useState(0);
  const [activeQueueLocation, setActiveQueueLocation] =
    React.useState<TogetherQueueLocationInput | undefined>(routeQueueLocation);
  const entryIdRef = React.useRef("");
  const matchedRef = React.useRef(false);
  const cancelRequestedRef = React.useRef(false);
  const autoStartedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  const invalidActivityReportedRef = React.useRef(false);
  const pollFailureReportedRef = React.useRef(false);
  const expiredReportedRef = React.useRef(false);
  const retryActionCountRef = React.useRef(0);

  const goToTogether = React.useCallback(() => {
    try {
      navigation.navigate("Tabs", { screen: "Together" });
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "PlayMatchScreen",
        action: "exitTogetherSession",
        step: "navigationFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          activity: activity ?? null,
          entryIdExists: Boolean(entryIdRef.current),
        },
      });
    }
  }, [activity, navigation]);

  const cancelCurrentQueue = React.useCallback(async (reportFailure = false) => {
    const entryId = entryIdRef.current;
    if (!entryId || matchedRef.current || cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    try {
      await togetherApi.cancelQueue(entryId);
    } catch (error) {
      if (!reportFailure) return;

      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "PlayMatchScreen",
        action: "exitTogetherSession",
        step: "cancelQueueFailed",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          activity: activity ?? null,
          entryIdExists: Boolean(entryId),
          status: statusKey,
        },
      });
      Alert.alert(
        tt("play.togetherExit.leaveFailedTitle", "Выходим в меню"),
        tt(
          "play.togetherExit.leaveFailedBody",
          "Не удалось подтвердить выход на сервере. Мы вернём вас в основное меню, а сессию можно проверить позже."
        )
      );
    }
  }, [activity, statusKey, tt]);

  const exitToMainTabs = React.useCallback(async () => {
    if (exiting) return;
    setExiting(true);
    try {
      await cancelCurrentQueue(true);
    } finally {
      goToTogether();
      setExiting(false);
    }
  }, [cancelCurrentQueue, exiting, goToTogether]);

  const startQueue = React.useCallback(async (
    locationForRequest?: TogetherQueueLocationInput,
    reason: "initial" | "retry" | "noLimitRetry" = "initial"
  ) => {
    if (!uid || !activity || inFlightRef.current) return;

    entryIdRef.current = "";
    matchedRef.current = false;
    cancelRequestedRef.current = false;
    pollFailureReportedRef.current = false;
    expiredReportedRef.current = false;
    inFlightRef.current = true;
    setBusy(true);
    setErrorText("");
    setStatusKey("preparing");
    setQueueStartedAt(Date.now());
    setActiveQueueLocation(locationForRequest);

    try {
      const response = await togetherApi.joinQueue(activity, locationForRequest);
      entryIdRef.current = response.entry.id;
      setEntry(response.entry);
      if (response.entry.status === "matched" && response.entry.sessionId) {
        matchedRef.current = true;
        setStatusKey("found");
        navigation.replace(nextRouteForActivity(activity), { sessionId: response.entry.sessionId });
        return;
      }
      setStatusKey("searching");
    } catch (error) {
      const safeError = sanitizeErrorForReport(error);
      reportClientError({
        screen: "PlayMatchScreen",
        action: "startTogetherQueue",
        step: reason === "noLimitRetry"
          ? "noLimitRetryJoinFailed"
          : reason === "retry"
          ? "retryQueueJoinFailed"
          : safeError.code === "validation_error"
          ? "backendGeoValidationFailed"
          : "queueJoinFailedWithGeoPayload",
        code: safeError.code,
        message: safeError.message,
        stack: safeError.stack,
        metadata: {
          activity,
          ...getLocationMetadata(locationForRequest),
        },
      });
      setStatusKey("error");
      setErrorText(
        tt(
          "play.match.queueNetworkError",
          "Проверь подключение к интернету и попробуй ещё раз."
        )
      );
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [activity, navigation, tt, uid]);

  React.useEffect(() => {
    if (!uid || !activity) return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startQueue(routeQueueLocation);
  }, [activity, routeQueueLocation, startQueue, uid]);

  React.useEffect(() => {
    if (!uid || activity || invalidActivityReportedRef.current) return;
    invalidActivityReportedRef.current = true;
    const rawActivityText = String(rawActivity ?? "").trim();
    reportClientError({
      screen: "PlayMatchScreen",
      action: "startTogetherSession",
      step: "invalidActivity",
      message: "PlayMatch opened with empty or invalid activity",
      metadata: {
        activityPresent: Boolean(rawActivityText),
        unsupportedKnownRemovedActivity: rawActivityText.length > 0,
      },
    });
  }, [activity, rawActivity, uid]);

  React.useEffect(() => {
    if (!entry?.id || matchedRef.current || statusKey !== "searching" && statusKey !== "delayed") {
      return;
    }

    let alive = true;
    const poll = async () => {
      try {
        const response = await togetherApi.getQueue(entry.id);
        if (!alive || matchedRef.current) return;
        setEntry(response.entry);

        if (response.entry.status === "matched" && response.entry.sessionId) {
          matchedRef.current = true;
          setStatusKey("found");
          navigation.replace(nextRouteForActivity(activity), { sessionId: response.entry.sessionId });
          return;
        }

        if (response.entry.status === "expired") {
          if (!expiredReportedRef.current) {
            expiredReportedRef.current = true;
            reportClientError({
              screen: "PlayMatchScreen",
              action: "startTogetherQueue",
              step: "queueExpiredWithoutMatch",
              message: "Together queue expired without a match",
              metadata: {
                activity,
                entryIdExists: Boolean(entryIdRef.current),
                ...getLocationMetadata(activeQueueLocation),
              },
            });
          }
          setStatusKey("expired");
          return;
        }

        if (response.entry.status === "cancelled") {
          setStatusKey("cancelled");
          return;
        }

        const nextStatus = Date.now() - queueStartedAt > DELAYED_MS ? "delayed" : "searching";
        setStatusKey(nextStatus);
      } catch (error) {
        if (!alive) return;
        if (!pollFailureReportedRef.current) {
          pollFailureReportedRef.current = true;
          const safeError = sanitizeErrorForReport(error);
          reportClientError({
            screen: "PlayMatchScreen",
            action: "startTogetherQueue",
            step: "queuePollFailed",
            code: safeError.code,
            message: safeError.message,
            stack: safeError.stack,
            metadata: {
              activity,
              entryIdExists: Boolean(entryIdRef.current),
              ...getLocationMetadata(activeQueueLocation),
            },
          });
        }
        setStatusKey("error");
        setErrorText(
          tt(
            "play.match.queueNetworkError",
            "Проверь подключение к интернету и попробуй ещё раз."
          )
        );
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, POLL_INTERVAL_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [activity, activeQueueLocation, entry?.id, navigation, queueStartedAt, statusKey, tt]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener(
      "beforeRemove",
      (_event: EventArg<"beforeRemove", true, undefined>) => {
        void cancelCurrentQueue();
      }
    );
    return unsubscribe;
  }, [cancelCurrentQueue, navigation]);

  React.useEffect(() => {
    return () => {
      void cancelCurrentQueue();
    };
  }, [cancelCurrentQueue]);

  const restartQueue = React.useCallback(async (
    locationForRequest?: TogetherQueueLocationInput,
    reason: "retry" | "noLimitRetry" = "retry"
  ) => {
    if (busy || inFlightRef.current) return;
    retryActionCountRef.current += 1;
    if (retryActionCountRef.current >= 2) {
      reportClientError({
        screen: "PlayMatchScreen",
        action: "startTogetherQueue",
        step: "repeatedRetryAction",
        message: "User repeated Together queue retry or cancel action",
        metadata: {
          activity,
          retryActionCount: retryActionCountRef.current,
          reason,
          status: statusKey,
          ...getLocationMetadata(locationForRequest),
        },
      });
    }
    await cancelCurrentQueue(true);
    entryIdRef.current = "";
    cancelRequestedRef.current = false;
    matchedRef.current = false;
    setEntry(null);
    await startQueue(locationForRequest, reason);
  }, [activity, busy, cancelCurrentQueue, startQueue, statusKey]);

  const retry = React.useCallback(() => {
    void restartQueue(activeQueueLocation, "retry");
  }, [activeQueueLocation, restartQueue]);

  const tryNoLimit = React.useCallback(() => {
    reportClientError({
      screen: "PlayMatchScreen",
      action: "startTogetherQueue",
      step: "noLimitRetryAction",
      message: "User retried Together queue with no-limit radius",
      metadata: {
        activity,
        previousRadiusKm: activeQueueLocation?.radiusKm ?? null,
        radiusKm: null,
        hasCoordinates: false,
      },
    });
    void restartQueue(undefined, "noLimitRetry");
  }, [activity, activeQueueLocation, restartQueue]);

  const handleBack = React.useCallback(() => {
    void exitToMainTabs();
  }, [exitToMainTabs]);

  const blockedTitle = !uid
    ? tt("play.match.blocked.authTitle", "Нужен вход в аккаунт")
    : tt("play.match.blocked.activityTitle", "Старт не удалось подготовить");
  const blockedBody = !uid
    ? tt("play.match.authRequired", "Нужно войти, чтобы начать общий рисунок.")
    : tt(
        "play.match.invalidActivity",
        "Эта старая сессия больше недоступна в текущей версии."
      );

  if (!uid || !activity) {
    return (
      <ScreenShell
        title={tt("tabs.together", "Вместе")}
        background="togetherMain"
        showBack
        onBack={handleBack}
      >
        <View style={styles.center}>
          <View style={styles.card}>
            <Ionicons name="alert-circle-outline" size={36} color="#FFE0B8" />
            <Text style={styles.title}>{blockedTitle}</Text>
            <Text style={styles.body}>{blockedBody}</Text>
            <Pressable style={styles.primaryButton} onPress={goToTogether}>
              <Text style={styles.primaryButtonText}>
                {tt("common.backToTogether", "Вернуться во Вместе")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScreenShell>
    );
  }

  const meta = getMatchStateMeta(statusKey, tt);
  const canRetry = statusKey === "error" || statusKey === "expired" || statusKey === "cancelled";
  const activeRadiusKm = activeQueueLocation?.radiusKm ?? null;
  const activeRadiusLabel = radiusLabelFor(activeRadiusKm, tt);
  const canTryNoLimit = activeRadiusKm !== null && (statusKey === "delayed" || canRetry);
  const bodyText = errorText || (
    canTryNoLimit && statusKey === "delayed"
      ? tt("play.match.noMatchTryNoLimit", "Пока никого не нашли. Попробуйте без ограничения.")
      : meta.hint
  );

  return (
    <ScreenShell
      title={tt("tabs.together", "Вместе")}
      background="togetherMain"
      showBack
      onBack={handleBack}
    >
      <View style={styles.center}>
        <View style={styles.card}>
          <View style={[styles.iconWrap, styles[`iconWrap_${meta.tone}`]]}>
            {statusKey === "searching" || statusKey === "delayed" || busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Ionicons
                name={statusKey === "found" ? "sparkles-outline" : "brush-outline"}
                size={30}
                color="#FFFFFF"
              />
            )}
          </View>
          <Text style={styles.kicker}>{meta.label}</Text>
          <Text style={styles.title}>{getActivityStatusTitle(activity, statusKey, tt)}</Text>
          <Text style={styles.body}>{bodyText}</Text>
          {entry?.expiresAt ? (
            <Text style={styles.expiresText}>
              {tt("play.match.queueExpiresAt", "Очередь активна до {time}", {
                time: formatQueueExpiresAt(entry.expiresAt) || "—",
              })}
            </Text>
          ) : null}
          <Text style={styles.radiusText}>
            {tt("play.match.radiusLabel", "Радиус поиска: {radius}", {
              radius: activeRadiusLabel,
            })}
          </Text>
          <Text style={styles.radiusModeText}>
            {radiusSearchTextFor(activeRadiusKm, tt)}
          </Text>
          <View style={styles.actions}>
            {canTryNoLimit ? (
              <Pressable style={styles.primaryButton} onPress={tryNoLimit} disabled={busy}>
                <Text style={styles.primaryButtonText}>
                  {tt("play.match.tryNoLimit", "Попробовать без ограничения")}
                </Text>
              </Pressable>
            ) : null}
            {canRetry ? (
              <Pressable style={styles.primaryButton} onPress={retry} disabled={busy}>
                <Text style={styles.primaryButtonText}>
                  {tt("common.retry", "Повторить")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.secondaryButton, exiting ? styles.buttonDisabled : null]}
              onPress={handleBack}
              disabled={exiting}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>
                {exiting
                  ? tt("common.exiting", "Выходим…")
                  : tt("common.backToMainTabs", "Вернуться в меню")}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: theme.shapes.card,
    padding: 22,
    gap: 12,
    alignItems: "center",
    backgroundColor: "rgba(10, 13, 26, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  iconWrap_live: {
    backgroundColor: "#37A2FF",
  },
  iconWrap_ready: {
    backgroundColor: theme.colors.primary,
  },
  iconWrap_paused: {
    backgroundColor: "rgba(255,255,255,0.22)",
  },
  iconWrap_error: {
    backgroundColor: "#FF6B6B",
  },
  kicker: {
    color: "#FFE0B8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
  },
  expiresText: {
    color: "rgba(255,255,255,0.58)",
    fontSize: 12,
    textAlign: "center",
  },
  radiusText: {
    color: "rgba(255,245,234,0.72)",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "700",
  },
  radiusModeText: {
    color: "#FFE0B8",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "800",
  },
  actions: {
    width: "100%",
    gap: 10,
    marginTop: 8,
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
});
