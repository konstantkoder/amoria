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
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayMatchRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { reportClientError } from "@/services/api/clientErrorsApi";
import * as togetherApi from "@/services/api/togetherApi";
import type { TogetherActivity, TogetherQueueEntry } from "@/services/api/types";
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

const POLL_INTERVAL_MS = 2000;
const DELAYED_MS = 9000;

function getMatchStateMeta(statusKey: MatchStatusKey, tt: TranslateFn) {
  if (statusKey === "searching" || statusKey === "delayed") {
    return {
      label: tt("play.match.state.searchingLabel", "Ищем"),
      hint:
        statusKey === "delayed"
          ? tt("play.match.stillSearching", "Пока никого нет, но поиск продолжается.")
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
  const suffix = activity === "color_mood" ? "ColorMood" : "Draw";
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
  return activity === "color_mood" ? "PlayColorMood" : "PlayCanvas";
}

export default function PlayMatchScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayMatch">>();
  const route = useRoute<PlayMatchRouteProp>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const tt = React.useCallback<TranslateFn>(
    (key, fallback, params) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );

  const uid = authUser?.id ?? "";
  const rawActivity = (route.params as { activity?: unknown } | undefined)?.activity;
  const activity: TogetherActivity | null =
    rawActivity === "draw" || rawActivity === "color_mood"
      ? rawActivity
      : null;
  const [statusKey, setStatusKey] = React.useState<MatchStatusKey>("preparing");
  const [entry, setEntry] = React.useState<TogetherQueueEntry | null>(null);
  const [errorText, setErrorText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [queueStartedAt, setQueueStartedAt] = React.useState(0);
  const entryIdRef = React.useRef("");
  const matchedRef = React.useRef(false);
  const cancelRequestedRef = React.useRef(false);
  const autoStartedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  const invalidActivityReportedRef = React.useRef(false);

  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const cancelCurrentQueue = React.useCallback(async () => {
    const entryId = entryIdRef.current;
    if (!entryId || matchedRef.current || cancelRequestedRef.current) return;
    cancelRequestedRef.current = true;
    try {
      await togetherApi.cancelQueue(entryId);
    } catch {}
  }, []);

  const startQueue = React.useCallback(async () => {
    if (!uid || !activity || inFlightRef.current) return;

    matchedRef.current = false;
    cancelRequestedRef.current = false;
    inFlightRef.current = true;
    setBusy(true);
    setErrorText("");
    setStatusKey("preparing");
    setQueueStartedAt(Date.now());

    try {
      const response = await togetherApi.joinQueue(activity);
      entryIdRef.current = response.entry.id;
      setEntry(response.entry);
      if (response.entry.status === "matched" && response.entry.sessionId) {
        matchedRef.current = true;
        setStatusKey("found");
        navigation.replace(nextRouteForActivity(activity), { sessionId: response.entry.sessionId });
        return;
      }
      setStatusKey("searching");
    } catch {
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
    void startQueue();
  }, [activity, startQueue, uid]);

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
          setStatusKey("expired");
          return;
        }

        if (response.entry.status === "cancelled") {
          setStatusKey("cancelled");
          return;
        }

        setStatusKey(Date.now() - queueStartedAt > DELAYED_MS ? "delayed" : "searching");
      } catch {
        if (!alive) return;
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
  }, [activity, entry?.id, navigation, queueStartedAt, statusKey, tt]);

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

  const retry = React.useCallback(() => {
    entryIdRef.current = "";
    cancelRequestedRef.current = false;
    matchedRef.current = false;
    setEntry(null);
    void startQueue();
  }, [startQueue]);

  const handleBack = React.useCallback(() => {
    void cancelCurrentQueue();
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    goToTogether();
  }, [cancelCurrentQueue, goToTogether, navigation]);

  const blockedTitle = !uid
    ? tt("play.match.blocked.authTitle", "Нужен вход в аккаунт")
    : tt("play.match.blocked.activityTitle", "Старт не удалось подготовить");
  const blockedBody = !uid
    ? tt("play.match.authRequired", "Нужно войти, чтобы начать общий рисунок.")
    : tt(
        "play.match.invalidActivity",
        "Формат этой Together-сессии не распознан."
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
          <Text style={styles.body}>{errorText || meta.hint}</Text>
          {entry?.expiresAt ? (
            <Text style={styles.expiresText}>
              {tt("play.match.queueExpiresAt", "Очередь активна до {time}", {
                time: new Date(entry.expiresAt).toLocaleTimeString(),
              })}
            </Text>
          ) : null}
          <View style={styles.actions}>
            {canRetry ? (
              <Pressable style={styles.primaryButton} onPress={retry} disabled={busy}>
                <Text style={styles.primaryButtonText}>
                  {tt("common.retry", "Повторить")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.secondaryButton} onPress={handleBack}>
              <Text style={styles.secondaryButtonText}>
                {tt("common.cancel", "Отмена")}
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
});
