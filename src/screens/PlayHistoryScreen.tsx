import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import * as togetherApi from "@/services/api/togetherApi";
import type { TogetherHistoryItem } from "@/services/api/types";
import {
  localizeStoryText,
  storyArtifactToDmSummary,
} from "@/services/togetherStorySparksState";
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
      return tt("playHistory.storyStatusOpenShort", "Чат открыт");
    case "open_skip":
      return tt("playHistory.storyStatusMixedShort", "Осталось историей");
    case "skip_skip":
      return tt("playHistory.storyStatusClosedShort", "Без чата");
    case "continue_story":
      return tt("playHistory.storyStatusContinuedShort", "Продолжили историю");
    case "mixed_intent":
      return tt("playHistory.storyStatusMixedIntentShort", "Без общего пути");
    case "blocked":
      return tt("playHistory.storyStatusBlockedShort", "Контакт недоступен");
    case "pending":
    default:
      return tt("playHistory.storyStatusWaitingShort", "Ждём ответ");
  }
}

function isTerminalClosedStatus(status?: string | null) {
  return status === "abandoned" || status === "cancelled";
}

function canRevealOpen(item: TogetherHistoryItem) {
  return !isTerminalClosedStatus(item.status) && item.canOpenChat === true && item.myDecision == null;
}

function hasExistingThread(item: TogetherHistoryItem) {
  return (
    !isTerminalClosedStatus(item.status) &&
    item.outcome === "open_open" &&
    Boolean(item.threadId)
  );
}

function getRelationshipText(
  item: TogetherHistoryItem,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  if (isTerminalClosedStatus(item.status)) {
    return tt(
      "playHistory.storyStatusInterrupted",
      "Сессия была прервана. Чат по этой сессии недоступен."
    );
  }

  if (item.outcome === "blocked") {
    return tt(
      "playHistory.storyStatusBlocked",
      "Контакт недоступен. Чат не может быть открыт из-за настроек безопасности."
    );
  }

  if (item.outcome === "open_open") {
    return tt(
      "playHistory.storyStatusOpen",
      "Эта история уже стала открытой связью. Отсюда можно вернуться и к самому моменту, и в чат."
    );
  }

  if (item.outcome === "continue_story") {
    return tt(
      "playHistory.storyStatusContinued",
      "После рисунка вы оба выбрали Историю на двоих. Продолжение сохранено отдельной общей историей."
    );
  }

  if (item.outcome === "mixed_intent") {
    return tt(
      "playHistory.storyStatusMixedIntent",
      "Вы выбрали разные продолжения, поэтому чат не открылся и новый этап не начался."
    );
  }

  if (item.outcome === "pending") {
    return tt(
      "playHistory.storyStatusWaiting",
      "История уже сохранена. Если открытие станет взаимным, чат вырастет именно из этого общего момента."
    );
  }

  return tt(
    "playHistory.storyStatusStoryOnly",
    "Этот момент остался общей историей. Он сохранён здесь даже без чата и никуда не исчезнет."
  );
}

function getHistoryContextText(
  item: TogetherHistoryItem,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string,
  locale: Parameters<typeof localizeStoryText>[1]
) {
  if (item.activity === "color_mood") {
    return tt("playHistory.contextColorMood", "Палитра, собранная вами вместе");
  }

  if (item.activity === "story_sparks") {
    return item.storyArtifact?.title
      ? tt("playHistory.contextStorySparks", "История на двоих: {title}", {
          title: localizeStoryText(item.storyArtifact.title, locale),
        })
      : tt("playHistory.contextStorySparksPlain", "История на двоих");
  }

  return item.promptText?.trim()
    ? tt("playHistory.contextDrawChallenge", "Creative challenge: {challenge}", {
        challenge: item.promptText.trim(),
      })
    : tt("playHistory.contextDraw", "Shared drawing on one canvas");
}

export default function PlayHistoryScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayHistory">>();
  const { user: authUser } = useAuth();
  const { locale, t } = useLocale();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );

  const uid = authUser?.id ?? "";
  const [history, setHistory] = useState<TogetherHistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);

  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const loadHistory = useCallback(async () => {
    if (!uid) {
      setHistory([]);
      setLoaded(true);
      setError(null);
      setActionError(null);
      return;
    }

    setLoaded(false);
    setError(null);
    setActionError(null);
    try {
      const response = await togetherApi.history(30);
      setHistory(response.items ?? []);
    } catch {
      setError(
        tt(
          "playHistory.errorBody",
          "Не удалось собрать ваши совместные истории. Попробуй еще раз."
        )
      );
    } finally {
      setLoaded(true);
    }
  }, [tt, uid]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory, reloadKey]);

  const cards = useMemo(
    () =>
      history.map((item) => ({
        ...item,
        id: item.sessionId,
      })),
    [history]
  );

  const openDetail = useCallback(
    (sessionId: string) => {
      navigation.navigate("PlaySessionDetail", { sessionId });
    },
    [navigation]
  );

  const openChat = useCallback(
    async (item: TogetherHistoryItem) => {
      if (openingChatId === item.sessionId) return;
      if (isTerminalClosedStatus(item.status)) return;
      if (hasExistingThread(item)) {
        setOpeningChatId(item.sessionId);
        setTimeout(() => {
          setOpeningChatId((prev) => (prev === item.sessionId ? null : prev));
        }, 1200);
        navigation.navigate("DMChat", {
          threadId: String(item.threadId),
          peerId: item.peer.id,
          peerName: item.peer.displayName,
          backTarget: "history",
          sourceContext: {
            source: "together",
            sourceSessionId: item.sessionId,
            artworkSummary: {
              activity: item.activity,
              ...(item.activity === "story_sparks"
                ? storyArtifactToDmSummary(item.storyArtifact ?? null, locale)
                : {}),
            },
          },
        });
        return;
      }
      if (!canRevealOpen(item)) return;

      setOpeningChatId(item.sessionId);
      setActionError(null);
      try {
        const response = await togetherApi.reveal(item.sessionId, "open");
        const nextRevealState = response.revealState;
        setHistory((current) =>
          current.map((entry) =>
            entry.sessionId === item.sessionId
              ? {
                  ...entry,
                  outcome: nextRevealState.outcome,
                  myDecision: nextRevealState.myDecision,
                  threadId: nextRevealState.threadId,
                  canOpenChat: nextRevealState.canOpenChat,
                  peerDecisionKnown: nextRevealState.peerDecisionKnown,
                  nextSessionId: nextRevealState.nextSessionId,
                  nextActivity: nextRevealState.nextActivity,
                }
              : entry
          )
        );

        if (nextRevealState.outcome !== "open_open" || !nextRevealState.threadId) {
          return;
        }
        navigation.navigate("DMChat", {
          threadId: nextRevealState.threadId,
          peerId: item.peer.id,
          peerName: item.peer.displayName,
          backTarget: "history",
          sourceContext: {
            source: "together",
            sourceSessionId: item.sessionId,
            artworkSummary: {
              activity: item.activity,
              ...(item.activity === "story_sparks"
                ? storyArtifactToDmSummary(item.storyArtifact ?? null, locale)
                : {}),
            },
          },
        });
      } catch {
        setActionError(
          tt(
            "playHistory.openChatFailed",
            "Не удалось открыть чат прямо сейчас. Попробуй ещё раз чуть позже."
          )
        );
      } finally {
        setOpeningChatId((prev) => (prev === item.sessionId ? null : prev));
      }
    },
    [locale, navigation, openingChatId, tt]
  );

  const goToStart = useCallback(() => {
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  const renderCard = useCallback(
    (item: TogetherHistoryItem & { id: string }) => {
      const outcomeLabel = getOutcomeLabel(item.outcome, tt);
      const relationshipText = getRelationshipText(item, tt);
      const opening = openingChatId === item.sessionId;
      const chatUnavailable = isTerminalClosedStatus(item.status);
      const showChatAction = hasExistingThread(item) || canRevealOpen(item);

      return (
        <Pressable
          key={item.sessionId}
          onPress={() => openDetail(item.sessionId)}
          style={styles.card}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTopText}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{item.peer.displayName}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusBadgeText}>{outcomeLabel}</Text>
                </View>
              </View>
              <Text style={styles.cardDate}>{formatDateTime(item.createdAt)}</Text>
            </View>
          </View>

          <Text style={styles.contextText}>
            {getHistoryContextText(item, tt, locale)}
          </Text>
          {item.activity === "story_sparks" && item.storyArtifact ? (
            <Text style={styles.storyPreviewText} numberOfLines={3}>
              {localizeStoryText(item.storyArtifact.summary, locale)}
            </Text>
          ) : null}
          <Text style={styles.relationshipText}>{relationshipText}</Text>

          <View style={styles.cardActions}>
            <Pressable
              onPress={() => openDetail(item.sessionId)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>
                {tt("playHistory.openStory", "Открыть историю")}
              </Text>
            </Pressable>
            {showChatAction && !chatUnavailable ? (
              <Pressable
                onPress={() => void openChat(item)}
                style={[styles.primaryButton, opening ? styles.buttonDisabled : null]}
                disabled={opening}
              >
                <Text style={styles.primaryButtonText}>
                  {opening
                    ? tt("playHistory.openingChat", "Открываем…")
                    : hasExistingThread(item)
                    ? tt("playHistory.openChat", "Открыть чат")
                    : tt("playHistory.chooseOpenChat", "Открыть чат")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [locale, openChat, openDetail, openingChatId, tt]
  );

  if (!uid) {
    return (
      <ScreenShell
        title={tt("playHistory.title", "Совместные истории")}
        background="togetherStory"
        showBack
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("playHistory.authTitle", "Нужен вход в аккаунт")}
            body={tt(
              "playHistory.authBody",
              "Истории Together доступны после входа в профиль."
            )}
            primaryAction={{ label: tt("common.openProfile", "Открыть профиль"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!loaded) {
    return (
      <ScreenShell title={tt("playHistory.title", "Совместные истории")} background="togetherStory" showBack>
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="albums-outline"
            title={tt("playHistory.loadingTitle", "Собираем истории")}
            body={tt(
              "playHistory.loadingBody",
              "Загружаем ваши совместные рисунки и решения."
            )}
          />
        </View>
      </ScreenShell>
    );
  }

  if (error) {
    return (
      <ScreenShell title={tt("playHistory.title", "Совместные истории")} background="togetherStory" showBack>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("playHistory.errorTitle", "Истории временно недоступны")}
            body={error}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: tt("common.backToTogether", "Вернуться во Вместе"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={tt("playHistory.title", "Совместные истории")} background="togetherStory" showBack>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerCard}>
          <Text style={styles.headerKicker}>
            {tt("playHistory.headerKicker", "Together")}
          </Text>
          <Text style={styles.headerTitle}>
            {tt("playHistory.headerTitle", "Истории из Together")}
          </Text>
          <Text style={styles.headerBody}>
            {tt(
              "playHistory.headerBody",
              "Здесь остаются совместные сессии, творческие вызовы и решения после результата."
            )}
          </Text>
        </View>

        {actionError ? <Text style={styles.actionError}>{actionError}</Text> : null}

        {cards.length ? (
          cards.map(renderCard)
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {tt("playHistory.emptyTitle", "Пока нет совместных историй")}
            </Text>
            <Text style={styles.emptyBody}>
              {tt(
                "playHistory.emptyBody",
                "Начни общий рисунок, и после завершения он появится здесь."
              )}
            </Text>
            <Pressable onPress={goToStart} style={styles.primaryButtonWide}>
              <Text style={styles.primaryButtonText}>
                {tt("playHistory.startNewSession", "Начать новую совместную сессию")}
              </Text>
            </Pressable>
          </View>
        )}
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
  scroll: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 42,
    gap: 14,
  },
  headerCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    gap: 8,
    backgroundColor: "rgba(10, 13, 26, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  headerKicker: {
    color: "#FFE0B8",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  headerTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  headerBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  actionError: {
    color: "#FFB4B4",
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    borderRadius: theme.shapes.card,
    padding: 16,
    gap: 12,
    backgroundColor: "rgba(13, 17, 31, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  cardTop: {
    gap: 6,
  },
  cardTopText: {
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  cardTitle: {
    flex: 1,
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  statusBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  statusBadgeText: {
    color: theme.colors.text,
    fontSize: 11,
    fontWeight: "800",
  },
  cardDate: {
    color: theme.colors.subtext,
    fontSize: 12,
  },
  contextText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  storyPreviewText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  relationshipText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  cardActions: {
    flexDirection: "row",
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  primaryButtonWide: {
    minHeight: 50,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: theme.shapes.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  emptyCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    gap: 12,
    backgroundColor: "rgba(13, 17, 31, 0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  emptyBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
});
