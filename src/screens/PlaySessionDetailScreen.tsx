import React from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import ReplayCanvasWebView from "@/components/play/ReplayCanvasWebView";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type PlaySessionDetailRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import * as togetherApi from "@/services/api/togetherApi";
import type { TogetherHistoryItem, TogetherSessionResponse } from "@/services/api/types";
import { markPlaySessionSeen } from "@/services/activityFreshness";
import {
  getRememberedTogetherSession,
  getTogetherPeer,
  getTogetherStrokes,
  rememberTogetherSession,
} from "@/services/togetherCanvasState";
import { theme } from "@/theme";

function formatDateTime(value: string) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Date(timestamp).toLocaleString();
  }
}

function getOutcomeLabel(
  outcome: string,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  switch (outcome) {
    case "open_open":
      return tt("playDetail.outcomeOpen", "Чат открыт");
    case "open_skip":
      return tt("playDetail.outcomeMixed", "Осталось историей");
    case "skip_skip":
      return tt("playDetail.outcomeClosed", "Без чата");
    case "pending":
    default:
      return tt("playDetail.outcomeWaiting", "Ждём ответ");
  }
}

export default function PlaySessionDetailScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlaySessionDetail">>();
  const route = useRoute<PlaySessionDetailRouteProp>();
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
  const remembered = React.useMemo(() => getRememberedTogetherSession(sessionId), [sessionId]);
  const [sessionResponse, setSessionResponse] = React.useState<TogetherSessionResponse | null>(remembered);
  const [historyItem, setHistoryItem] = React.useState<TogetherHistoryItem | null>(null);
  const [loading, setLoading] = React.useState(!remembered);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [openingChat, setOpeningChat] = React.useState(false);
  const [chatActionError, setChatActionError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);
  const mountedRef = React.useRef(true);

  const goToTogether = React.useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const goToHistory = React.useCallback(() => {
    navigation.navigate("PlayHistory");
  }, [navigation]);

  const handleBack = React.useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("PlayHistory");
  }, [navigation]);

  React.useEffect(() => {
    mountedRef.current = true;
    setLoadError(null);
    setChatActionError(null);
    if (!sessionId) {
      setLoading(false);
      return () => {
        mountedRef.current = false;
      };
    }

    setLoading(!remembered);
    void Promise.all([
      togetherApi.getSession(sessionId),
      togetherApi.history(100).catch(() => ({ items: [], nextCursor: null })),
    ])
      .then(([session, history]) => {
        if (!mountedRef.current) return;
        rememberTogetherSession(session);
        setSessionResponse(session);
        setHistoryItem(history.items.find((item) => item.sessionId === sessionId) ?? null);
        setLoading(false);
        void markPlaySessionSeen(sessionId);
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setLoadError(
          tt(
            "playDetail.errorBody",
            "Не удалось открыть эту совместную историю прямо сейчас. Попробуй еще раз."
          )
        );
        setLoading(false);
      });

    return () => {
      mountedRef.current = false;
    };
  }, [remembered, reloadKey, sessionId, tt]);

  const session = sessionResponse?.session ?? null;
  const peer = React.useMemo(
    () => getTogetherPeer(sessionResponse, uid),
    [sessionResponse, uid]
  );
  const peerName =
    historyItem?.peer.displayName ||
    peer?.displayName?.trim() ||
    tt("profile.amoriaUser", "Пользователь Amoria");
  const outcome = historyItem?.outcome ?? "pending";
  const strokes = React.useMemo(() => getTogetherStrokes(sessionId), [sessionId]);
  const hasReplay = strokes.length > 0;

  const openChat = React.useCallback(async () => {
    if (outcome !== "open_open" || !peer?.id) return;
    setOpeningChat(true);
    setChatActionError(null);
    try {
      const response = await togetherApi.reveal(sessionId, "open");
      if (!response.threadId) throw new Error("Thread was not returned");
      navigation.navigate("DMChat", {
        threadId: response.threadId,
        peerId: peer.id,
        peerName,
        backTarget: "sessionDetail",
        backSessionId: sessionId,
        sourceContext: {
          source: "play",
          sourceSessionId: sessionId,
          artworkSummary: {
            activity: "draw",
            strokeCount: strokes.length,
          },
        },
      });
    } catch {
      setChatActionError(
        tt(
          "playDetail.openChatFailed",
          "Не удалось открыть чат прямо сейчас. Попробуй ещё раз чуть позже."
        )
      );
    } finally {
      if (mountedRef.current) setOpeningChat(false);
    }
  }, [navigation, outcome, peer?.id, peerName, sessionId, strokes.length, tt]);

  if (!sessionId) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title={tt("playDetail.missingTitle", "История не найдена")}
            body={tt("playDetail.missingBody", "Не удалось открыть историю без идентификатора сессии.")}
            primaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loading) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="albums-outline"
            title={tt("playDetail.loadingTitle", "Открываем историю")}
            body={tt(
              "playDetail.loadingBody",
              "Собираем общий результат, партнёра и контекст этой сессии."
            )}
          />
        </View>
      </ScreenShell>
    );
  }

  if (loadError || !session) {
    return (
      <ScreenShell
        title={tt("playDetail.title", "Совместная история")}
        background="togetherStory"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("playDetail.errorTitle", "История временно недоступна")}
            body={loadError || tt("playDetail.notFoundBody", "Эта история больше недоступна.")}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: tt("playDetail.backToHistory", "Вернуться к историям"), onPress: goToHistory }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={tt("playDetail.title", "Совместная история")}
      background="togetherStory"
      showBack
      onBack={handleBack}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heroCard}>
          <Text style={styles.kicker}>{tt("playDetail.kicker", "Together")}</Text>
          <Text style={styles.title}>{session.promptText}</Text>
          <Text style={styles.body}>
            {tt("playDetail.storyBody", "Общая история с {name}", { name: peerName })}
          </Text>
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.partner", "Партнёр")}</Text>
              <Text style={styles.metaValue}>{peerName}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.status", "Статус")}</Text>
              <Text style={styles.metaValue}>{getOutcomeLabel(outcome, tt)}</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaLabel}>{tt("playDetail.createdAt", "Создано")}</Text>
              <Text style={styles.metaValue}>{formatDateTime(session.createdAt)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.replayCard}>
          <Text style={styles.sectionTitle}>{tt("playDetail.replayTitle", "Replay")}</Text>
          {hasReplay ? (
            <View style={styles.replayWrap}>
              <ReplayCanvasWebView strokes={strokes} autoplay={route.params.focus === "replay"} showControls />
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {tt(
                "playDetail.replayEmpty",
                "Replay доступен сразу после сессии на текущем устройстве. Backend history пока хранит только контекст и решение."
              )}
            </Text>
          )}
        </View>

        <View style={styles.bridgeCard}>
          <Text style={styles.sectionTitle}>
            {outcome === "open_open"
              ? tt("playDetail.bridgeChatReadyTitle", "Из этой истории уже можно вернуться в чат")
              : tt("playDetail.bridgeStoryOnlyTitle", "Эта история осталась вашим общим моментом")}
          </Text>
          <Text style={styles.body}>
            {outcome === "open_open"
              ? tt(
                  "playDetail.bridgeChatReadyBody",
                  "Эта история уже стала частью открытого чата. Отсюда можно сразу перейти в разговор."
                )
              : tt(
                  "playDetail.bridgeStoryOnlyBody",
                  "Контакт не перешёл в чат или ещё ждёт второго решения, но вся общая история остаётся здесь."
                )}
          </Text>
          {chatActionError ? <Text style={styles.errorText}>{chatActionError}</Text> : null}
          <View style={styles.actionRow}>
            {outcome === "open_open" ? (
              <Pressable
                style={[styles.primaryButton, openingChat ? styles.buttonDisabled : null]}
                onPress={() => void openChat()}
                disabled={openingChat}
              >
                <Text style={styles.primaryButtonText}>
                  {openingChat
                    ? tt("playDetail.openingChat", "Открываем…")
                    : tt("playDetail.openPrivateChat", "Открыть чат")}
                </Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.secondaryButton} onPress={() => navigation.navigate("PlayMatch", { activity: "draw" })}>
              <Text style={styles.secondaryButtonText}>
                {tt("playDetail.startAnotherSession", "Начать ещё одну совместную сессию")}
              </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  centerState: {
    flex: 1,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 16,
    paddingBottom: 42,
    gap: 16,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    gap: 10,
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
  metaGrid: {
    gap: 10,
  },
  metaItem: {
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
  replayCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(13, 17, 31, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  replayWrap: {
    height: 320,
    overflow: "hidden",
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  emptyText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  bridgeCard: {
    borderRadius: theme.shapes.card,
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(16, 20, 38, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  errorText: {
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    gap: 10,
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
    opacity: 0.58,
  },
});
