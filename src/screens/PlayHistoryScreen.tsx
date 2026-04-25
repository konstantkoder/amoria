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
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import { getRuntimeLocale } from "@/i18n/translations";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import {
  formatActivitySignalLabel,
  getPlaySessionActivitySignal,
  useActivityFreshnessState,
} from "@/services/activityFreshness";
import {
  buildDmChatRouteParams,
  ensureDmThread,
  mapDmThreadToPeer,
  subscribeDmThreads,
  type DmThreadDoc,
} from "@/services/dm";
import {
  getPlayActivityLabel,
  getPlayActivityMetricLabel,
  getPlayRevealCopy,
  subscribeMyPlayHistory,
  type PlayHistoryItem,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";
import { theme } from "@/theme";

function formatDateTime(value: number) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return new Date(value).toLocaleString();
  }
}

type HistoryCard = PlayHistoryItem & {
  threadId?: string;
  signalLabel?: string;
  signalTone?: "fresh" | "recent";
};

function getHistoryContextText(
  item: HistoryCard,
  releaseText: (en: string, ru: string) => string,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  switch (item.activity) {
    case "daily_prompt":
      return (
        item.promptText?.trim() ||
        releaseText("Shared drawing around a prompt", "Общий рисунок по теме")
      );
    case "color_mood":
      return item.combinedPalette?.length
        ? tt("playHistory.contextColorMoodCount", "Shared palette: {count} colors", {
            count: String(item.combinedPalette.length),
          })
        : tt("playHistory.contextColorMood", "Shared palette");
    case "chain_draw":
      return releaseText("Shared drawing in turns", "Общий рисунок по очереди");
    case "draw":
    default:
      return releaseText("Shared drawing on one canvas", "Общий рисунок на одном холсте");
  }
}

function getHistoryRelationshipText(
  item: HistoryCard,
  tt: (key: string, fallback: string, params?: Record<string, string>) => string
) {
  if (item.revealOutcome === "open_open") {
    return tt(
      "playHistory.storyStatusOpen",
      "Эта история уже стала открытой связью. Отсюда можно вернуться и к самому моменту, и в личный разговор."
    );
  }

  if (item.revealOutcome === "waiting") {
    return tt(
      "playHistory.storyStatusWaiting",
      "История уже сохранена. Если открытие станет взаимным, личный разговор вырастет именно из этого общего момента."
    );
  }

  return tt(
    "playHistory.storyStatusStoryOnly",
    "Этот момент остался общей историей. Он сохранён здесь даже без личного разговора и никуда не исчезнет."
  );
}

export default function PlayHistoryScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"PlayHistory">>();
  const { t } = useLocale();
  const releaseText = useCallback(
    (en: string, ru: string) => (getRuntimeLocale() === "ru" ? ru : en),
    []
  );
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const uid = auth?.currentUser?.uid ?? "";
  const freshnessState = useActivityFreshnessState();
  const [history, setHistory] = useState<PlayHistoryItem[]>([]);
  const [threads, setThreads] = useState<DmThreadDoc[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [threadsLoaded, setThreadsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openingChatId, setOpeningChatId] = useState<string | null>(null);
  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);
  const goToChats = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Inbox" });
  }, [navigation]);
  const handleLoadError = useCallback(() => {
    setError(
      tt(
        "playHistory.errorBody",
        "Не удалось собрать ваши совместные истории. Попробуй еще раз."
      )
    );
  }, [tt]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setHistory([]);
      setHistoryLoaded(true);
      setError(null);
      setActionError(null);
      return;
    }

    setHistoryLoaded(false);
    setError(null);
    setActionError(null);
    const unsubscribe = subscribeMyPlayHistory(
      db,
      uid,
      (next) => {
        if (!alive) return;
        setHistory(next);
        setHistoryLoaded(true);
      },
      () => {
        if (!alive) return;
        handleLoadError();
        setHistoryLoaded(true);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [handleLoadError, reloadKey, uid]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setThreads([]);
      setThreadsLoaded(true);
      return;
    }

    setThreadsLoaded(false);
    const unsubscribe = subscribeDmThreads(
      db,
      uid,
      (next) => {
        if (!alive) return;
        setThreads(next);
        setThreadsLoaded(true);
      },
      () => {
        if (!alive) return;
        handleLoadError();
        setThreadsLoaded(true);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [handleLoadError, reloadKey, uid]);

  const cards = useMemo<HistoryCard[]>(
    () => {
      const threadByPeerId = new Map<string, DmThreadDoc>();
      for (const thread of threads) {
        const peer = mapDmThreadToPeer(thread, uid);
        if (!peer?.uid || threadByPeerId.has(peer.uid)) continue;
        threadByPeerId.set(peer.uid, thread);
      }

      return history.map((item) => {
        const thread = threadByPeerId.get(item.peer.uid);
        const signal = getPlaySessionActivitySignal(
          item,
          freshnessState.playSessions[item.sessionId] ?? 0
        );
        return {
          ...item,
          ...(thread?.id ? { threadId: thread.id } : {}),
          ...(signal
            ? {
                signalLabel: formatActivitySignalLabel(signal, tt),
                signalTone: signal.tone,
              }
            : {}),
        };
      });
    },
    [freshnessState.playSessions, history, threads, tt, uid]
  );

  const isLoading = !historyLoaded || !threadsLoaded;

  const openDetail = useCallback(
    (sessionId: string) => {
      navigation.navigate("PlaySessionDetail", { sessionId });
    },
    [navigation]
  );

  const openChat = useCallback(
    async (card: HistoryCard) => {
      if (!db || !uid || card.revealOutcome !== "open_open") return;

      setOpeningChatId(card.id);
      try {
        const threadId =
          card.threadId ??
          (await ensureDmThread(db, uid, card.peer.uid, {
            memberNames: {
              [uid]: makeNickname(uid),
              [card.peer.uid]: card.peer.nickname,
            },
            source: "play",
            sourceSessionId: card.sessionId,
            artworkSummary: {
              activity: card.activity,
              strokeCount: card.strokeCount,
            },
          }));

        navigation.navigate(
          "DMChat",
          buildDmChatRouteParams({
            threadId,
            peerId: card.peer.uid,
            peerName: card.peer.nickname,
            backTarget: "history",
            sourceContext: {
              source: "play",
              sourceSessionId: card.sessionId,
              artworkSummary: {
                activity: card.activity,
                ...(card.strokeCount != null ? { strokeCount: card.strokeCount } : {}),
              },
            },
          })
        );
        setActionError(null);
      } catch {
        setActionError(
          tt(
            "playHistory.openChatFailed",
            "Не удалось открыть личный разговор прямо сейчас. Попробуй ещё раз чуть позже."
          )
        );
      } finally {
        setOpeningChatId((prev) => (prev === card.id ? null : prev));
      }
    },
    [navigation, tt, uid]
  );

  const goToStart = useCallback(() => {
    navigation.navigate("PlayMatch", { activity: "draw" });
  }, [navigation]);

  const renderCard = useCallback(
    (item: HistoryCard) => {
      const isColorMood = item.activity === "color_mood";
      const metricLabel = getPlayActivityMetricLabel(item.activity, "history");
      const revealCopy = getPlayRevealCopy(item.revealOutcome);
      const contextText = getHistoryContextText(item, releaseText, tt);
      const relationshipText = getHistoryRelationshipText(item, tt);

      return (
        <Pressable
          key={item.id}
          onPress={() => openDetail(item.sessionId)}
          style={styles.card}
        >
          <View style={styles.cardTop}>
            <View style={styles.cardTopText}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardTitle}>{item.peer.nickname}</Text>
                {item.signalLabel ? (
                  <View
                    style={[
                      styles.signalBadge,
                      item.signalTone === "fresh"
                        ? styles.signalBadgeFresh
                        : styles.signalBadgeRecent,
                    ]}
                  >
                    <Text
                      style={[
                        styles.signalBadgeText,
                        item.signalTone === "fresh"
                          ? styles.signalBadgeTextFresh
                          : styles.signalBadgeTextRecent,
                      ]}
                    >
                      {item.signalLabel}
                    </Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.cardActivity}>
                {getPlayActivityLabel(item.activity, "history")}
              </Text>
            </View>
            <Text style={styles.cardDate}>{formatDateTime(item.sortAt)}</Text>
          </View>

          <Text style={styles.cardContext}>{contextText}</Text>
          <Text style={styles.cardStatus}>{relationshipText}</Text>

          <View style={styles.metaGrid}>
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>
                {isColorMood
                  ? `${metricLabel}: ${String(item.combinedPalette?.length ?? 0)}`
                  : `${metricLabel}: ${String(item.strokeCount ?? 0)}`}
              </Text>
            </View>
            <View style={styles.metaChip}>
              <Text style={styles.metaText}>{revealCopy.shortLabel}</Text>
            </View>
          </View>

          <View style={styles.actionsRow}>
            <Pressable onPress={() => openDetail(item.sessionId)} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>
                {tt("playHistory.openStory", "Открыть историю")}
              </Text>
            </Pressable>
            {item.revealOutcome === "open_open" ? (
              <Pressable
                onPress={() => void openChat(item)}
                style={styles.secondaryButton}
                disabled={openingChatId === item.id}
              >
                <Text style={styles.secondaryButtonText}>
                  {openingChatId === item.id
                    ? tt("connections.openingChat", "Открываем чат…")
                    : tt("connections.openChat", "Открыть чат")}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      );
    },
    [openChat, openDetail, openingChatId, releaseText, tt]
  );

  const renderEmpty = () => (
    <View style={styles.centerBlock}>
      <CoreStateCard
        icon="albums-outline"
        title={tt("playHistory.emptyTitle", "Общие истории появятся здесь")}
        body={tt(
          "playHistory.emptyBody",
          "После первой совместной сессии её история останется здесь: с общим итогом, replay или палитрой и дальнейшим путём связи."
        )}
        primaryAction={{
          label: tt("playHistory.startCta", "Начать совместную сессию"),
          onPress: goToStart,
        }}
        secondaryAction={{
          label: t("connections.goToTogether"),
          onPress: goToTogether,
        }}
      />
    </View>
  );

  const renderError = () => (
    <View style={styles.centerBlock}>
      <CoreStateCard
        icon="cloud-offline-outline"
        title={tt("playHistory.errorTitle", "История временно недоступна")}
        body={error ?? tt("playHistory.errorBody", "Не удалось собрать ваши совместные истории. Попробуй еще раз.")}
        primaryAction={{
          label: tt("common.retry", "Повторить"),
          onPress: () => setReloadKey((prev) => prev + 1),
        }}
        secondaryAction={{
          label: t("connections.goToTogether"),
          onPress: goToTogether,
        }}
      />
    </View>
  );

  if (!uid) {
    return (
      <ScreenShell title={tt("playHistory.title", "Мои совместные истории")} background="togetherStory" showBack onBack={goToTogether}>
        <View style={styles.centerBlock}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("playHistory.authRequiredTitle", "Истории доступны после входа")}
            body={tt(
              "playHistory.authRequiredBody",
              "Войдите, чтобы вернуться к своим общим историям, открыть replay или палитру и продолжить путь в личный разговор, если связь уже открылась."
            )}
            primaryAction={{ label: t("menu.profile"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!db) {
    return (
      <ScreenShell title={tt("playHistory.title", "Мои совместные истории")} background="togetherStory" showBack onBack={goToTogether}>
        <View style={styles.centerBlock}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("playHistory.errorTitle", "История временно недоступна")}
            body={tt(
              "playHistory.offlineBody",
              "Сейчас не получается подключить ваши общие истории. Попробуй позже или вернись во Вместе."
            )}
            primaryAction={{ label: t("connections.goToTogether"), onPress: goToTogether }}
            secondaryAction={{ label: t("tabs.chats"), onPress: goToChats }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={tt("playHistory.title", "Мои совместные истории")}
      background="togetherStory"
      showBack
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        goToTogether();
      }}
    >
      {isLoading ? (
        <View style={styles.centerBlock}>
          <CoreStateCard
            loading
            icon="albums-outline"
            title={tt("playHistory.title", "Мои совместные истории")}
            body={tt("playHistory.loading", "Собираем ваши совместные истории…")}
          />
        </View>
      ) : error ? (
        renderError()
      ) : !cards.length ? (
        renderEmpty()
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {actionError ? (
            <View style={styles.inlineErrorCard}>
              <Text style={styles.inlineErrorTitle}>
                {tt("playHistory.inlineErrorTitle", "Личный разговор ещё не прикрепился к этой истории")}
              </Text>
              <Text style={styles.inlineErrorText}>{actionError}</Text>
            </View>
          ) : null}

          <View style={styles.heroCard}>
            <Text style={styles.heroKicker}>
              {tt("playHistory.heroKicker", "Совместные истории")}
            </Text>
            <Text style={styles.heroTitle}>{tt("playHistory.heroTitle", "Архив ваших завершённых сессий")}</Text>
            <Text style={styles.heroText}>
              {tt(
                "playHistory.heroBody",
                "Здесь остаётся всё, что уже произошло между вами: общий итог, путь к разговору и спокойный способ вернуться к каждой истории."
              )}
            </Text>
            <View style={styles.heroCountPill}>
              <Text style={styles.heroCountText}>
                {tt("playHistory.count", "Историй: {count}", {
                  count: String(cards.length),
                })}
              </Text>
            </View>
            <View style={styles.heroActions}>
              <Pressable onPress={goToStart} style={styles.heroPrimaryButton}>
                <Text style={styles.heroPrimaryButtonText}>
                  {tt("playHistory.startNewSession", "Начать новую совместную сессию")}
                </Text>
              </Pressable>
              <Pressable onPress={goToChats} style={styles.heroSecondaryButton}>
                <Text style={styles.heroSecondaryButtonText}>{t("tabs.chats")}</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionIntro}>
              <Text style={styles.sectionTitle}>
                {tt("playHistory.sectionTitle", "Истории, которые уже случились между вами")}
              </Text>
              <Text style={styles.sectionText}>
                {tt(
                  "playHistory.sectionBody",
                  "Открывай detail, возвращайся в разговор, если связь уже открылась, или начинай новую совместную сессию из этого же общего контекста."
                )}
              </Text>
            </View>
            {cards.map(renderCard)}
          </View>
        </ScrollView>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 40,
    gap: 20,
  },
  centerBlock: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  inlineErrorCard: {
    padding: 16,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(255, 77, 103, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 77, 103, 0.22)",
    gap: 6,
  },
  inlineErrorTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  inlineErrorText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  heroCard: {
    padding: 18,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(13, 18, 34, 0.9)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 21,
  },
  heroCountPill: {
    alignSelf: "flex-start",
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroCountText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  heroActions: {
    gap: 10,
  },
  heroPrimaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  heroPrimaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  heroSecondaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  heroSecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
  section: {
    gap: 12,
  },
  sectionIntro: {
    paddingHorizontal: 2,
    gap: 6,
  },
  sectionTitle: {
    color: theme.colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  sectionText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  card: {
    borderRadius: theme.shapes.card,
    padding: 17,
    backgroundColor: "rgba(16, 20, 38, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 12,
  },
  cardTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTopText: {
    flex: 1,
    gap: 4,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  cardTitle: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "800",
  },
  cardActivity: {
    color: theme.colors.accent,
    fontSize: 13,
    fontWeight: "700",
  },
  signalBadge: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
  },
  signalBadgeFresh: {
    backgroundColor: "rgba(255, 78, 138, 0.16)",
    borderColor: "rgba(255, 78, 138, 0.28)",
  },
  signalBadgeRecent: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: theme.colors.borderSubtle,
  },
  signalBadgeText: {
    fontSize: 11,
    fontWeight: "800",
  },
  signalBadgeTextFresh: {
    color: theme.colors.primary,
  },
  signalBadgeTextRecent: {
    color: theme.colors.text,
  },
  cardDate: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  cardContext: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  cardStatus: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaChip: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  metaText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "700",
  },
  actionsRow: {
    gap: 10,
  },
  primaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: "800",
  },
});
