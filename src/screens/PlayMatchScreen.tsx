import React from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Device from "expo-device";
import {
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
  TogetherPreferredAgeRangeInput,
  TogetherQueueCancelSource,
  TogetherQueueEntry,
  TogetherQueueLocationInput,
} from "@/services/api/types";
import {
  DEFAULT_TOGETHER_RADIUS_KM,
  hasTogetherQueueCoordinates,
  requestTogetherQueueLocation,
  type TogetherRadiusKm,
} from "@/services/togetherLocation";
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
type QueueStartReason = "initial" | "retry" | "expandRadius";

const POLL_INTERVAL_MS = 2000;
const DELAYED_MS = 90 * 1000;
const POLL_FAILURE_REPORT_THRESHOLD = 3;

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

function queueStartedAtFromEntry(entry: TogetherQueueEntry) {
  const createdAt = Date.parse(entry.createdAt);
  return Number.isFinite(createdAt) ? createdAt : Date.now();
}

function getLocationMetadata(location?: TogetherQueueLocationInput) {
  return {
    radiusKm: location?.radiusKm ?? null,
    hasCoordinates: hasTogetherQueueCoordinates(location),
  };
}

function getAgePreferenceMetadata(preference?: TogetherPreferredAgeRangeInput) {
  return {
    preferredAgeMin: preference?.min ?? null,
    preferredAgeMax: preference?.max ?? null,
  };
}

function isAgeValidationError(error: unknown) {
  if (!(error instanceof Error)) return false;
  const apiError = error as {
    code?: string;
    details?: Record<string, unknown>;
    fields?: Record<string, unknown>;
  };
  const details = {
    ...(apiError.details ?? {}),
    ...(apiError.fields ?? {}),
  };
  return (
    apiError.code === "validation_error" &&
    (
      "birthDate" in details ||
      "age" in details ||
      "preferredAgeMin" in details ||
      "preferredAgeMax" in details ||
      "preferredAgeRange" in details
    )
  );
}

function firstValidationFieldValue(value: unknown) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return String(value ?? "");
}

function getAgeValidationErrorKey(error: unknown) {
  if (!isAgeValidationError(error)) return "";
  const apiError = error as {
    details?: Record<string, unknown>;
    fields?: Record<string, unknown>;
  };
  const details = {
    ...(apiError.details ?? {}),
    ...(apiError.fields ?? {}),
  };
  const birthDateError = firstValidationFieldValue(details.birthDate);
  const ageError = firstValidationFieldValue(details.age);
  if (ageError === "underage") return "editProfile.birthDateUnderage";
  if (birthDateError === "future") return "editProfile.birthDateFuture";
  if (birthDateError === "required") return "editProfile.birthDateRequired";
  if (birthDateError === "unreasonable_age") return "editProfile.birthDateYearInvalid";
  if (birthDateError === "invalid") return "editProfile.birthDateInvalid";
  return "together.age.backendRejected";
}

function geoModeForLocation(location?: TogetherQueueLocationInput) {
  if (!hasTogetherQueueCoordinates(location)) {
    return "missing_location";
  }

  return location.radiusKm === null ? "no_limit_with_location" : "finite_with_location";
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

function nextExpandedRadius(radiusKm: TogetherRadiusKm): TogetherRadiusKm {
  if (radiusKm === 5) return 25;
  if (radiusKm === 25) return 100;
  if (radiusKm === 100) return 250;
  if (radiusKm === 250) return null;
  return null;
}

function getMatchStateMeta(statusKey: MatchStatusKey, tt: TranslateFn) {
  if (statusKey === "searching" || statusKey === "delayed") {
    return {
      label: tt("play.match.state.searchingLabel", "Ищем"),
      hint:
        statusKey === "delayed"
          ? tt("play.match.stillSearching", "Поиск продолжается. Можно подождать или остановить поиск.")
          : tt("play.match.searchCanStayOpen", "Ищем человека... Можно подождать или остановить поиск."),
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
      hint: tt("play.match.notFoundTryAgain", "Время очереди истекло. Можно начать поиск заново."),
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
        "Проверьте подключение/GPS и попробуйте снова или вернитесь в меню."
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
      return tt(`play.match.status.searching${suffix}Title`, "Ищем человека...");
    case "delayed":
      return tt(`play.match.status.delayed${suffix}Title`, "Ищем человека...");
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
  const routeAgePreference = (
    route.params as { agePreference?: TogetherPreferredAgeRangeInput } | undefined
  )?.agePreference;
  const routeAgeLabel = String((route.params as { ageLabel?: unknown } | undefined)?.ageLabel ?? "")
    .trim();
  const activity: TogetherActivity | null =
    rawActivity === "draw" || rawActivity === "story_sparks"
      ? rawActivity
      : null;
  const [statusKey, setStatusKey] = React.useState<MatchStatusKey>("preparing");
  const [entry, setEntry] = React.useState<TogetherQueueEntry | null>(null);
  const [errorText, setErrorText] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [exiting, setExiting] = React.useState(false);
  const [connectionNotice, setConnectionNotice] = React.useState("");
  const [queueStartedAt, setQueueStartedAt] = React.useState(0);
  const [activeQueueLocation, setActiveQueueLocation] =
    React.useState<TogetherQueueLocationInput | undefined>(routeQueueLocation);
  const entryIdRef = React.useRef("");
  const matchedRef = React.useRef(false);
  const cancelRequestedRef = React.useRef(false);
  const userRequestedExitRef = React.useRef(false);
  const userRequestedRestartRef = React.useRef(false);
  const radiusExpansionRef = React.useRef(false);
  const autoStartedRef = React.useRef(false);
  const inFlightRef = React.useRef(false);
  const invalidActivityReportedRef = React.useRef(false);
  const pollFailureReportedRef = React.useRef(false);
  const pollFailureCountRef = React.useRef(0);
  const delayedThresholdReportedRef = React.useRef(false);

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

  const isQueueCancellationAllowed = React.useCallback((
    cancelSource: TogetherQueueCancelSource
  ) => {
    switch (cancelSource) {
      case "user_stop":
      case "user_back":
        return userRequestedExitRef.current;
      case "retry_restart":
        return userRequestedRestartRef.current;
      case "radius_expansion":
        return radiusExpansionRef.current;
      default:
        return false;
    }
  }, []);

  const cancelCurrentQueue = React.useCallback(async (
    cancelSource: TogetherQueueCancelSource,
    reportFailure = false
  ) => {
    const entryId = entryIdRef.current;
    if (!entryId || matchedRef.current || cancelRequestedRef.current) return;
    if (!isQueueCancellationAllowed(cancelSource)) return;
    cancelRequestedRef.current = true;
    try {
      const response = await togetherApi.cancelQueue(entryId, { cancelSource });
      setEntry(response.entry);
      if (response.entry.status === "cancelled") {
        setStatusKey("cancelled");
      }
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
          queueEntryId: entryId,
          cancelSource,
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
  }, [activity, isQueueCancellationAllowed, statusKey, tt]);

  const resolveLocationForQueue = React.useCallback(async (
    locationForRequest: TogetherQueueLocationInput | undefined,
    reason: QueueStartReason
  ): Promise<TogetherQueueLocationInput | null> => {
    if (hasTogetherQueueCoordinates(locationForRequest)) {
      return locationForRequest;
    }

    const requestedRadiusKm = activeQueueLocation
      ? activeQueueLocation.radiusKm
      : DEFAULT_TOGETHER_RADIUS_KM;
    const result = await requestTogetherQueueLocation(requestedRadiusKm);
    if ("location" in result) {
      return result.location;
    }

    if (result.reason === "permissionDenied") {
      setStatusKey("error");
      setErrorText(
        tt(
          "together.geo.permissionDenied",
          "Для совместного поиска нужна геолокация. Мы не показываем точную позицию другим людям."
        )
      );
      return null;
    }

    const safeError = sanitizeErrorForReport(result.error);
    const isDeviceLocationUnavailable = result.permissionStatus === "granted";
    reportClientError({
      screen: "PlayMatchScreen",
      action: "startTogetherQueue",
      step: "locationReadFailed",
      code: safeError.code,
      message: safeError.message,
      stack: safeError.stack,
      metadata: {
        activity,
        radiusKm: requestedRadiusKm,
        reason,
        permissionStatus: result.permissionStatus,
        hasCoordinates: false,
        platform: Platform.OS,
        deviceModel: Device.modelName ?? null,
      },
    });
    setStatusKey("error");
    setErrorText(
      isDeviceLocationUnavailable
        ? tt(
            "together.geo.deviceLocationUnavailable",
            "Устройство не отдаёт координаты. Проверьте GPS/геолокацию. В эмуляторе BlueStacks установите местоположение и откройте Google Maps для проверки."
          )
        : tt(
            "together.geo.locationReadFailed",
            "Не удалось получить геолокацию. Проверьте доступ и попробуйте ещё раз."
          )
    );
    return null;
  }, [activeQueueLocation?.radiusKm, activity, tt]);

  const exitToMainTabs = React.useCallback(async (
    cancelSource: TogetherQueueCancelSource = "user_back"
  ) => {
    if (exiting) return;
    userRequestedExitRef.current = true;
    setExiting(true);
    try {
      await cancelCurrentQueue(cancelSource, true);
    } finally {
      goToTogether();
      setExiting(false);
      userRequestedExitRef.current = false;
    }
  }, [cancelCurrentQueue, exiting, goToTogether]);

  const startQueue = React.useCallback(async (
    locationForRequest?: TogetherQueueLocationInput,
    reason: QueueStartReason = "initial"
  ) => {
    if (!uid || !activity || inFlightRef.current) return;

    entryIdRef.current = "";
    matchedRef.current = false;
    cancelRequestedRef.current = false;
    pollFailureReportedRef.current = false;
    pollFailureCountRef.current = 0;
    delayedThresholdReportedRef.current = false;
    inFlightRef.current = true;
    setBusy(true);
    setErrorText("");
    setConnectionNotice("");
    setStatusKey("preparing");
    setQueueStartedAt(Date.now());

    let preparedLocation: TogetherQueueLocationInput | undefined;
    try {
      preparedLocation = await resolveLocationForQueue(locationForRequest, reason) ?? undefined;
      if (!preparedLocation) {
        return;
      }

      setActiveQueueLocation(preparedLocation);
      const response = await togetherApi.joinQueue(activity, preparedLocation, routeAgePreference);
      entryIdRef.current = response.entry.id;
      setQueueStartedAt(queueStartedAtFromEntry(response.entry));
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
        step: reason === "expandRadius"
          ? "expandRadiusJoinFailed"
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
          ...getLocationMetadata(preparedLocation),
          ...getAgePreferenceMetadata(routeAgePreference),
          hasAgePreference: Boolean(routeAgePreference),
        },
      });
      setStatusKey("error");
      const ageErrorKey = getAgeValidationErrorKey(error);
      setErrorText(
        ageErrorKey
          ? tt(
              ageErrorKey,
              "Проверьте дату рождения в профиле и возрастной фильтр, затем попробуйте ещё раз."
            )
          : tt(
              "play.match.queueNetworkError",
              "Проверь подключение к интернету и попробуй ещё раз."
            )
      );
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }, [activity, navigation, resolveLocationForQueue, routeAgePreference, tt, uid]);

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
        pollFailureCountRef.current = 0;
        setConnectionNotice("");
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

        const isDelayed = Date.now() - queueStartedAt > DELAYED_MS;
        const nextStatus = isDelayed ? "delayed" : "searching";
        if (isDelayed && !delayedThresholdReportedRef.current) {
          delayedThresholdReportedRef.current = true;
          reportClientError({
            screen: "PlayMatchScreen",
            action: "startTogetherQueue",
            step: "queueDelayedThreshold",
            message: "Together queue is still waiting after delayed threshold",
            metadata: {
              activity,
              queueEntryId: response.entry.id,
              geoMode: geoModeForLocation(activeQueueLocation),
              ...getLocationMetadata(activeQueueLocation),
            },
          });
        }
        setStatusKey(nextStatus);
      } catch (error) {
        if (!alive) return;
        pollFailureCountRef.current += 1;
        setConnectionNotice(
          tt(
            "play.match.pollRetrying",
            "Проблема соединения, пробуем снова."
          )
        );
        if (
          pollFailureCountRef.current >= POLL_FAILURE_REPORT_THRESHOLD &&
          !pollFailureReportedRef.current
        ) {
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
              queueEntryId: entryIdRef.current || null,
              pollFailureCount: pollFailureCountRef.current,
              geoMode: geoModeForLocation(activeQueueLocation),
              ...getLocationMetadata(activeQueueLocation),
            },
          });
        }
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

  const restartQueue = React.useCallback(async (
    locationForRequest?: TogetherQueueLocationInput,
    reason: "retry" | "expandRadius" = "retry"
  ) => {
    if (busy || inFlightRef.current) return;
    const cancelSource: TogetherQueueCancelSource =
      reason === "expandRadius" ? "radius_expansion" : "retry_restart";
    userRequestedRestartRef.current = reason === "retry";
    radiusExpansionRef.current = reason === "expandRadius";
    await cancelCurrentQueue(cancelSource, true);
    entryIdRef.current = "";
    cancelRequestedRef.current = false;
    matchedRef.current = false;
    setEntry(null);
    try {
      await startQueue(locationForRequest, reason);
    } finally {
      userRequestedRestartRef.current = false;
      radiusExpansionRef.current = false;
    }
  }, [busy, cancelCurrentQueue, startQueue]);

  const retry = React.useCallback(() => {
    void restartQueue(activeQueueLocation, "retry");
  }, [activeQueueLocation, restartQueue]);

  const expandRadius = React.useCallback(() => {
    const runExpansion = () => {
      if (!hasTogetherQueueCoordinates(activeQueueLocation)) {
        void restartQueue(undefined, "expandRadius");
        return;
      }
      const nextRadiusKm = nextExpandedRadius(activeQueueLocation.radiusKm);
      void restartQueue(
        {
          latitude: activeQueueLocation.latitude,
          longitude: activeQueueLocation.longitude,
          radiusKm: nextRadiusKm,
        },
        "expandRadius"
      );
    };

    Alert.alert(
      tt("play.match.expandRadiusConfirmTitle", "Расширить радиус?"),
      tt(
        "play.match.expandRadiusConfirmBody",
        "Текущий поиск будет остановлен, затем начнётся новый поиск с большим радиусом."
      ),
      [
        { text: tt("common.cancel", "Отмена"), style: "cancel" },
        {
          text: tt("play.match.expandRadius", "Расширить радиус"),
          style: "destructive",
          onPress: runExpansion,
        },
      ]
    );
  }, [activeQueueLocation, restartQueue, tt]);

  const handleBack = React.useCallback(() => {
    void exitToMainTabs("user_back");
  }, [exitToMainTabs]);

  const handleStopSearch = React.useCallback(() => {
    void exitToMainTabs("user_stop");
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
  const isActiveSearch = statusKey === "searching" || statusKey === "delayed";
  const canRetry = statusKey === "error" || statusKey === "expired" || statusKey === "cancelled";
  const activeRadiusKm = activeQueueLocation
    ? activeQueueLocation.radiusKm
    : DEFAULT_TOGETHER_RADIUS_KM;
  const activeRadiusLabel = radiusLabelFor(activeRadiusKm, tt);
  const locationReady = hasTogetherQueueCoordinates(activeQueueLocation);
  const expandedRadiusKm = nextExpandedRadius(activeRadiusKm);
  const canExpandRadius =
    statusKey === "delayed" &&
    locationReady &&
    expandedRadiusKm !== activeRadiusKm;
  const bodyText = errorText || connectionNotice || (
    canExpandRadius
      ? tt("play.match.noMatchExpandRadius", "Поиск продолжается. Можно расширить радиус или остановить поиск.")
      : meta.hint
  );
  const retryLabel =
    statusKey === "error" && !entryIdRef.current
      ? tt("together.geo.retryLocation", "Попробовать снова")
      : tt("play.match.restartSearch", "Остановить и начать заново");

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
          <Text style={styles.radiusText}>
            {tt("play.match.ageLabel", "Возраст: {age}", {
              age: routeAgeLabel || tt("together.age.anyAdult", "любой 18+"),
            })}
          </Text>
          <Text style={styles.radiusModeText}>
            {radiusSearchTextFor(activeRadiusKm, tt)}
          </Text>
          <Text style={styles.locationReadyText}>
            {locationReady
              ? tt("play.match.locationReady", "Геолокация готова")
              : tt("play.match.locationNotReady", "Геолокация не готова")}
          </Text>
          <View style={styles.actions}>
            {isActiveSearch ? (
              <Pressable
                style={[styles.primaryButton, exiting ? styles.buttonDisabled : null]}
                onPress={handleStopSearch}
                disabled={exiting}
                accessibilityRole="button"
              >
                <Text style={styles.primaryButtonText}>
                  {exiting
                    ? tt("common.exiting", "Выходим…")
                    : tt("play.match.stopSearch", "Остановить поиск")}
                </Text>
              </Pressable>
            ) : null}
            {canExpandRadius ? (
              <Pressable style={styles.secondaryButton} onPress={expandRadius} disabled={busy}>
                <Text style={styles.secondaryButtonText}>
                  {tt("play.match.expandRadius", "Расширить радиус")}
                </Text>
              </Pressable>
            ) : null}
            {canRetry ? (
              <Pressable style={styles.primaryButton} onPress={retry} disabled={busy}>
                <Text style={styles.primaryButtonText}>
                  {retryLabel}
                </Text>
              </Pressable>
            ) : null}
            {!isActiveSearch ? (
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
            ) : null}
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
  locationReadyText: {
    color: "rgba(255,245,234,0.72)",
    fontSize: 12,
    textAlign: "center",
    fontWeight: "700",
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
