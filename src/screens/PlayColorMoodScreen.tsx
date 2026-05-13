import React from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlayColorMoodRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import * as togetherApi from "@/services/api/togetherApi";
import type {
  TogetherEventDto,
  TogetherSessionResponse,
} from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import { getTogetherPeer, rememberTogetherSession } from "@/services/togetherCanvasState";
import {
  buildTogetherPaletteFromEvents,
  type TogetherPaletteSelection,
} from "@/services/togetherPaletteState";
import { theme } from "@/theme";

type MoodOption = {
  label: string;
  color: string;
  i18nKey: string;
  fallback: string;
};

const MOOD_OPTIONS: MoodOption[] = [
  { label: "calm", color: "#38BDF8", i18nKey: "play.colorMood.option.calm", fallback: "Спокойствие" },
  { label: "romantic", color: "#F97393", i18nKey: "play.colorMood.option.romantic", fallback: "Романтика" },
  { label: "energy", color: "#FF8A3D", i18nKey: "play.colorMood.option.energy", fallback: "Энергия" },
  { label: "curious", color: "#A78BFA", i18nKey: "play.colorMood.option.curious", fallback: "Интерес" },
  { label: "warm", color: "#FACC15", i18nKey: "play.colorMood.option.warm", fallback: "Тепло" },
  { label: "fresh", color: "#34D399", i18nKey: "play.colorMood.option.fresh", fallback: "Свежесть" },
];

function buildClientEventId(userId: string) {
  return `${userId || "local"}-palette-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function readTogetherEvent(payload: wsClient.RealtimeMessage): TogetherEventDto | null {
  if (payload.type !== "together.event") return null;
  const event = payload.event && typeof payload.event === "object" ? payload.event : null;
  if (!event) return null;
  return event as TogetherEventDto;
}

function readTogetherSessionUpdate(
  payload: wsClient.RealtimeMessage
): TogetherSessionResponse | null {
  if (payload.type !== "together.session.updated") return null;
  const session = payload.session && typeof payload.session === "object" ? payload.session : null;
  if (!session || !("session" in session)) return null;
  return session as TogetherSessionResponse;
}

function latestByUser(
  selections: TogetherPaletteSelection[],
  userId: string
): TogetherPaletteSelection | null {
  return selections.find((selection) => selection.fromUserId === userId) ?? null;
}

export default function PlayColorMoodScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayColorMood">>();
  const route = useRoute<PlayColorMoodRouteProp>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const tt = React.useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );

  const sessionId = route.params.sessionId.trim();
  const uid = authUser?.id ?? "";
  const [sessionResponse, setSessionResponse] = React.useState<TogetherSessionResponse | null>(null);
  const [events, setEvents] = React.useState<TogetherEventDto[]>([]);
  const [selectedLabel, setSelectedLabel] = React.useState(MOOD_OPTIONS[0].label);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const [actionError, setActionError] = React.useState("");
  const mountedRef = React.useRef(true);
  const finishPromiseRef = React.useRef<Promise<void> | null>(null);
  const navigatedRef = React.useRef(false);

  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const applySessionResponse = React.useCallback(
    (response: TogetherSessionResponse) => {
      rememberTogetherSession(response);
      if (!mountedRef.current) return;
      setSessionResponse(response);
      if (response.session.status === "finished" && !navigatedRef.current) {
        navigatedRef.current = true;
        navigation.replace("PlayResult", { sessionId: response.session.id });
      }
    },
    [navigation]
  );

  const reloadEvents = React.useCallback(async () => {
    const response = await togetherApi.getSessionEvents(sessionId);
    if (mountedRef.current) {
      setEvents(response.items);
    }
    return response.items;
  }, [sessionId]);

  React.useEffect(() => {
    mountedRef.current = true;
    setLoading(true);
    setLoadError("");
    setActionError("");

    if (!uid || !sessionId) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    void Promise.all([togetherApi.getSession(sessionId), togetherApi.getSessionEvents(sessionId)])
      .then(([session, sessionEvents]) => {
        if (!mountedRef.current) return;
        if (session.session.activity !== "color_mood") {
          navigation.replace("PlayCanvas", { sessionId });
          return;
        }

        applySessionResponse(session);
        setEvents(sessionEvents.items);
        setLoading(false);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadError(
          tt(
            "play.colorMood.guardOfflineBody",
            "Не удалось подготовить соединение для этой сессии. Вернитесь назад или попробуйте позже."
          )
        );
        setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [applySessionResponse, navigation, sessionId, tt, uid]);

  React.useEffect(() => {
    if (!uid || !sessionId) return;
    let alive = true;
    wsClient.connect();
    wsClient.subscribeTogetherSession(sessionId);
    const unsubscribe = wsClient.onMessage((payload) => {
      if (!alive || String(payload.sessionId ?? "") !== sessionId) return;
      const sessionUpdate = readTogetherSessionUpdate(payload);
      if (sessionUpdate) {
        applySessionResponse(sessionUpdate);
        return;
      }

      const event = readTogetherEvent(payload);
      if (!event || event.type !== "palette") return;
      setEvents((current) =>
        current.some((item) => item.id === event.id || item.clientEventId === event.clientEventId)
          ? current
          : [...current, event]
      );
    });

    return () => {
      alive = false;
      unsubscribe();
      wsClient.unsubscribeTogetherSession(sessionId);
    };
  }, [applySessionResponse, sessionId, uid]);

  const session = sessionResponse?.session ?? null;
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const peerName = peer?.displayName?.trim() || tt("profile.amoriaUser", "Пользователь Amoria");
  const selections = React.useMemo(() => buildTogetherPaletteFromEvents(events), [events]);
  const mySelection = latestByUser(selections, uid);
  const peerSelection = peer?.id ? latestByUser(selections, peer.id) : null;
  const selectedOption =
    MOOD_OPTIONS.find((option) => option.label === selectedLabel) ?? MOOD_OPTIONS[0];
  const expectedSelections = Math.max(sessionResponse?.participants.length ?? 0, 2);
  const readyToFinish =
    session?.status === "active" &&
    sessionResponse?.participants.length === 2 &&
    selections.length >= expectedSelections;

  const completeSession = React.useCallback(async () => {
    if (!sessionId || finishPromiseRef.current || session?.status !== "active") return;

    const task = togetherApi
      .finish(sessionId)
      .then((response) => {
        applySessionResponse(response);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setActionError(
          tt(
            "play.colorMood.finishFailed",
            "Не удалось завершить палитру. Проверьте подключение и попробуйте ещё раз."
          )
        );
      })
      .finally(() => {
        finishPromiseRef.current = null;
      });

    finishPromiseRef.current = task;
    await task;
  }, [applySessionResponse, session?.status, sessionId, tt]);

  React.useEffect(() => {
    if (!readyToFinish) return;
    void completeSession();
  }, [completeSession, readyToFinish]);

  const confirmSelection = React.useCallback(async () => {
    if (!uid || !sessionId || !session || session.status !== "active" || mySelection || saving) {
      return;
    }

    setSaving(true);
    setActionError("");
    try {
      await togetherApi.sendEvent(sessionId, {
        clientEventId: buildClientEventId(uid),
        type: "palette",
        payload: {
          color: selectedOption.color,
          label: selectedOption.label,
        },
      });
      await reloadEvents();
    } catch {
      if (!mountedRef.current) return;
      setActionError(
        tt(
          "play.colorMood.saveFailed",
          "Не удалось сохранить цвета. Попробуй ещё раз."
        )
      );
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }, [mySelection, reloadEvents, saving, selectedOption, session, sessionId, tt, uid]);

  const leaveSession = React.useCallback(async () => {
    if (!sessionId || leaving) return;
    setLeaving(true);
    setActionError("");
    try {
      await togetherApi.leave(sessionId);
      goToTogether();
    } catch {
      if (!mountedRef.current) return;
      setActionError(
        tt(
          "play.canvas.leaveFailed",
          "Не удалось выйти из сессии. Сессия не закрыта локально, попробуй ещё раз."
        )
      );
    } finally {
      if (mountedRef.current) setLeaving(false);
    }
  }, [goToTogether, leaving, sessionId, tt]);

  const handleBack = React.useCallback(() => {
    if (session?.status !== "active") {
      goToTogether();
      return;
    }

    Alert.alert(
      tt("play.colorMood.leaveTitle", "Завершить палитру?"),
      tt(
        "play.colorMood.leaveDraftBody",
        "Если выйти сейчас, совместная сессия завершится для обоих."
      ),
      [
        { text: tt("common.stay", "Остаться"), style: "cancel" },
        {
          text: tt("common.exit", "Выйти"),
          style: "destructive",
          onPress: () => {
            void leaveSession();
          },
        },
      ]
    );
  }, [goToTogether, leaveSession, session?.status, tt]);

  if (!uid || !sessionId) {
    return (
      <ScreenShell
        title={tt("play.colorMood.title", "Палитра настроения")}
        background="togetherMain"
        showBack
        onBack={goToTogether}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("play.colorMood.guardAuthTitle", "Не удалось открыть палитру")}
            body={tt("play.colorMood.guardAuthBody", "Чтобы войти в общую палитру, нужен активный аккаунт.")}
            primaryAction={{ label: tt("common.openProfile", "Открыть профиль"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loading) {
    return (
      <ScreenShell
        title={tt("play.colorMood.title", "Палитра настроения")}
        background="togetherMain"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="color-palette-outline"
            title={tt("play.colorMood.loadingTitle", "Подключаем палитру")}
            body={tt(
              "play.colorMood.loadingBody",
              "Сейчас загрузим совместную сессию и покажем цвета для выбора."
            )}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadError || !session) {
    return (
      <ScreenShell
        title={tt("play.colorMood.title", "Палитра настроения")}
        background="togetherMain"
        showBack
        onBack={goToTogether}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("play.colorMood.guardErrorTitle", "Подключение прервалось")}
            body={loadError || tt("play.colorMood.guardNotFoundBody", "Сессия больше недоступна.")}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => navigation.replace("PlayColorMood", { sessionId }) }}
            secondaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={tt("play.colorMood.title", "Палитра настроения")}
      background="togetherMain"
      showBack
      onBack={handleBack}
    >
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>{tt("play.colorMood.kicker", "Together")}</Text>
          <Text style={styles.title}>{session.promptText}</Text>
          <Text style={styles.body}>
            {tt("play.colorMood.phasePickBody", "Каждый выбирает один цвет настроения. Потом палитра сохранится как общий результат.")}
          </Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner", "Партнёр")}</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("play.colorMood.metaCollected", "Собрано")}</Text>
              <Text style={styles.metaValue}>
                {selections.length}/{expectedSelections}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.paletteCard}>
          <Text style={styles.sectionTitle}>{tt("play.colorMood.paletteTitle", "Доступные цвета")}</Text>
          <View style={styles.optionGrid}>
            {MOOD_OPTIONS.map((option) => {
              const selected = selectedLabel === option.label;
              return (
                <Pressable
                  key={option.label}
                  style={[
                    styles.option,
                    selected ? styles.optionSelected : null,
                    mySelection ? styles.optionLocked : null,
                  ]}
                  onPress={() => {
                    if (!mySelection) setSelectedLabel(option.label);
                  }}
                  disabled={Boolean(mySelection)}
                >
                  <View style={[styles.swatch, { backgroundColor: option.color }]} />
                  <Text style={styles.optionText}>{tt(option.i18nKey, option.fallback)}</Text>
                  {selected ? <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" /> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hintText}>
            {mySelection
              ? tt("play.colorMood.phaseWaitingBody", "Ваш выбор сохранён. Когда второй человек закончит, откроется итог.")
              : tt("play.colorMood.paletteBody", "После подтверждения выбор сохранится на сервере и будет виден второму участнику.")}
          </Text>
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
          <Pressable
            style={[styles.primaryButton, saving || Boolean(mySelection) ? styles.buttonDisabled : null]}
            onPress={() => void confirmSelection()}
            disabled={saving || Boolean(mySelection)}
          >
            <Text style={styles.primaryButtonText}>
              {mySelection
                ? tt("play.colorMood.primaryWaiting", "Ждём второй выбор")
                : saving
                  ? tt("common.saving", "Сохранение...")
                  : tt("play.colorMood.confirmChoice", "Сохранить настроение")}
            </Text>
          </Pressable>
        </View>

        <View style={styles.sharedCard}>
          <Text style={styles.sectionTitle}>{tt("play.colorMood.sharedPaletteTitle", "Общая палитра")}</Text>
          <View style={styles.selectionRow}>
            <SelectionPill
              label={tt("common.you", "ты")}
              selection={mySelection}
              valueText={
                mySelection
                  ? tt(`play.colorMood.option.${mySelection.label}`, mySelection.label)
                  : null
              }
              emptyText={tt("play.colorMood.waitingMine", "Выберите цвет")}
            />
            <SelectionPill
              label={peerName}
              selection={peerSelection}
              valueText={
                peerSelection
                  ? tt(`play.colorMood.option.${peerSelection.label}`, peerSelection.label)
                  : null
              }
              emptyText={tt("play.colorMood.waitingPeer", "Ждём выбор")}
            />
          </View>
          {readyToFinish ? (
            <Text style={styles.hintText}>
              {tt("play.colorMood.phaseDoneBody", "Цвета собраны. Открываем итог.")}
            </Text>
          ) : null}
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

function SelectionPill({
  label,
  selection,
  valueText,
  emptyText,
}: {
  label: string;
  selection: TogetherPaletteSelection | null;
  valueText: string | null;
  emptyText: string;
}) {
  return (
    <View style={styles.selectionPill}>
      <View
        style={[
          styles.selectionSwatch,
          { backgroundColor: selection?.color ?? "rgba(255,255,255,0.16)" },
        ]}
      />
      <View style={styles.selectionTextWrap}>
        <Text style={styles.selectionLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.selectionValue} numberOfLines={1}>
          {valueText ?? emptyText}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 16,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    gap: 12,
    backgroundColor: "rgba(10, 13, 26, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  kicker: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  title: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  body: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    gap: 10,
  },
  metaItem: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  metaLabel: {
    color: theme.colors.subtext,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  metaValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 4,
  },
  paletteCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(13, 17, 31, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sharedCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(16, 20, 38, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  optionGrid: {
    gap: 10,
  },
  option: {
    minHeight: 50,
    borderRadius: 14,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  optionSelected: {
    borderColor: theme.colors.primary,
    backgroundColor: "rgba(249, 115, 147, 0.20)",
  },
  optionLocked: {
    opacity: 0.72,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  optionText: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  hintText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  errorText: {
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
  },
  primaryButton: {
    minHeight: 52,
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
  buttonDisabled: {
    opacity: 0.58,
  },
  selectionRow: {
    gap: 10,
  },
  selectionPill: {
    minHeight: 58,
    borderRadius: 14,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  selectionSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.55)",
  },
  selectionTextWrap: {
    flex: 1,
  },
  selectionLabel: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
  },
  selectionValue: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 2,
    textTransform: "capitalize",
  },
});
