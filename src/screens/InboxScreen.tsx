import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { auth, db } from "@/config/firebaseConfig";
import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import UserAvatar from "@/components/UserAvatar";
import {
  formatActivitySignalLabel,
  getDmThreadActivitySignal,
  useActivityFreshnessState,
} from "@/services/activityFreshness";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import {
  buildDmChatRouteParams,
  mapDmThreadToPeer,
  subscribeDmThreads,
  type DmSourceContext,
  type DmThreadDoc,
} from "@/services/dm";
import { nearbyAnnouncementsRepository } from "@/services/nearbyAnnouncements";
import { getNowPostById } from "@/services/now";
import { getBlockedUserIds } from "@/services/safety";
import { getUserProfileById } from "@/services/user";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getPlayColorMoodCombinedPalette,
  getPlaySessionById,
  getPlaySessionPrompt,
  type PlayActivity,
} from "@/services/playSessions";
import { theme } from "@/theme";

type InboxSourceKey = "play" | "announcement" | "nearby" | "direct";

type InboxThreadCard = {
  id: string;
  peerId: string;
  peerName: string;
  avatarUrl?: string;
  sourceKey: InboxSourceKey;
  sourceId?: string;
  sourceContext?: DmSourceContext;
  sourcePreviewText?: string;
  sourceDetailHint?: string;
  activity?: PlayActivity;
  conversationLabel: string;
  previewText: string;
  dateLabel: string;
  sortAt: number;
  signalLabel?: string;
  signalTone?: "fresh" | "recent";
};

function formatThreadDate(value: number) {
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

function getThreadSourceKey(thread: DmThreadDoc): InboxSourceKey {
  if (thread.source === "play") return "play";
  if (thread.source === "announcement") return "announcement";
  if (thread.source === "nearby") return "nearby";
  return "direct";
}

function getThreadSourceContext(thread: DmThreadDoc): DmSourceContext | undefined {
  if (
    thread.source !== "play" &&
    thread.source !== "announcement" &&
    thread.source !== "nearby"
  ) {
    return undefined;
  }

  return {
    source: thread.source,
    ...(thread.sourceSessionId?.trim()
      ? { sourceSessionId: thread.sourceSessionId.trim() }
      : {}),
    ...(thread.artworkSummary ? { artworkSummary: thread.artworkSummary } : {}),
  };
}

function mapThreadToCard(
  thread: DmThreadDoc,
  uid: string,
  fallbackName: string,
  previewFallback: string,
  conversationActiveLabel: string,
  conversationReadyLabel: string,
  seenAt: number,
  formatSignal: (thread: DmThreadDoc) => string
): InboxThreadCard | null {
  const peer = mapDmThreadToPeer(thread, uid);
  if (!peer) return null;

  const sortAt = thread.lastMessageAt ?? thread.updatedAt ?? thread.createdAt;
  const signal = getDmThreadActivitySignal(thread, seenAt);
  const hasPreview = Boolean(thread.lastMessageText?.trim());
  const sourceKey = getThreadSourceKey(thread);
  const sourceContext = getThreadSourceContext(thread);
  const sourceId = thread.sourceSessionId?.trim() ?? "";
  return {
    id: thread.id,
    peerId: peer.uid,
    peerName: peer.name || fallbackName,
    sourceKey,
    ...(sourceId ? { sourceId } : {}),
    ...(sourceContext ? { sourceContext } : {}),
    ...(thread.artworkSummary?.activity
      ? { activity: thread.artworkSummary.activity }
      : {}),
    conversationLabel: hasPreview ? conversationActiveLabel : conversationReadyLabel,
    previewText: thread.lastMessageText?.trim() || previewFallback,
    dateLabel: formatThreadDate(sortAt),
    sortAt,
    ...(signal ? { signalLabel: formatSignal(thread), signalTone: signal.tone } : {}),
  };
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { t } = useLocale();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const uid = auth?.currentUser?.uid ?? "";
  const freshnessState = useActivityFreshnessState();
  const [threads, setThreads] = useState<DmThreadDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [peerAvatarByUid, setPeerAvatarByUid] = useState<Record<string, string>>({});
  const [sourcePreviewByThreadId, setSourcePreviewByThreadId] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setThreads([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const unsubscribe = subscribeDmThreads(
      db,
      uid,
      (threads) => {
        if (!alive) return;
        setThreads(threads);
        setLoading(false);
      },
      () => {
        if (!alive) return;
        setError(
          tt(
            "inbox.errorBody",
            "Не удалось подключить ваши личные разговоры прямо сейчас. Попробуй ещё раз."
          )
        );
        setLoading(false);
      }
    );

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [reloadKey, tt, uid]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid) {
      setBlockedUserIds([]);
      return () => {
        alive = false;
      };
    }

    void getBlockedUserIds(uid)
      .then((ids) => {
        if (!alive) return;
        setBlockedUserIds(ids);
      })
      .catch(() => {
        if (!alive) return;
        setBlockedUserIds([]);
      });

    return () => {
      alive = false;
    };
  }, [reloadKey, uid]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid || !threads.length) {
      setPeerAvatarByUid({});
      return () => {
        alive = false;
      };
    }

    const peerIds = Array.from(
      new Set(
        threads
          .map((thread) => mapDmThreadToPeer(thread, uid)?.uid ?? "")
          .filter(Boolean)
      )
    );

    void Promise.all(
      peerIds.map(async (peerId) => {
        const profile = await getUserProfileById(peerId).catch(() => null);
        return [peerId, profile?.avatarUrl ?? ""] as const;
      })
    ).then((entries) => {
      if (!alive) return;
      setPeerAvatarByUid(Object.fromEntries(entries));
    });

    return () => {
      alive = false;
    };
  }, [threads, uid]);

  useEffect(() => {
    let alive = true;
    if (!db || !uid || !threads.length) {
      setSourcePreviewByThreadId({});
      return () => {
        alive = false;
      };
    }

    const sourceThreads = threads.filter((thread) => {
      const sourceId = thread.sourceSessionId?.trim();
      return Boolean(sourceId && getThreadSourceKey(thread) !== "direct");
    });

    if (!sourceThreads.length) {
      setSourcePreviewByThreadId({});
      return () => {
        alive = false;
      };
    }

    void Promise.all(
      sourceThreads.map(async (thread) => {
        const sourceId = thread.sourceSessionId?.trim() ?? "";
        if (!sourceId) return [thread.id, ""] as const;

        try {
          if (thread.source === "play") {
            const session = await getPlaySessionById(db, sourceId);
            if (!session) return [thread.id, ""] as const;

            const prompt = getPlaySessionPrompt(session)?.text?.trim() ?? "";
            if (prompt) return [thread.id, prompt] as const;

            if (session.activity === "color_mood") {
              const paletteSize = getPlayColorMoodCombinedPalette(session).length;
              if (paletteSize > 0) {
                return [
                  thread.id,
                  tt("inbox.contextColorMoodPalette", "Mood palette: {count} colors", {
                    count: String(paletteSize),
                  }),
                ] as const;
              }
            }
          }

          if (thread.source === "announcement") {
            const announcement = await nearbyAnnouncementsRepository.getAnnouncementById(sourceId);
            return [thread.id, announcement?.title?.trim() ?? ""] as const;
          }

          if (thread.source === "nearby") {
            const post = await getNowPostById(db, sourceId);
            return [thread.id, post?.text?.trim() ?? ""] as const;
          }
        } catch {
          return [thread.id, ""] as const;
        }

        return [thread.id, ""] as const;
      })
    ).then((entries) => {
      if (!alive) return;
      setSourcePreviewByThreadId(
        Object.fromEntries(entries.filter(([, preview]) => Boolean(preview)))
      );
    });

    return () => {
      alive = false;
    };
  }, [threads, tt, uid]);

  const cards = useMemo(
    () =>
      threads
        .map((thread) =>
          mapThreadToCard(
            thread,
            uid,
            t("common.user"),
            tt(
              "inbox.previewFallbackCoreLoop",
              "Разговор уже открыт. Можно написать первым и продолжить то, что уже случилось между вами."
            ),
            tt("inbox.conversationActiveLabel", "Что уже происходит в разговоре"),
            tt("inbox.conversationReadyLabel", "Личный разговор уже открыт"),
            freshnessState.dmThreads[thread.id] ?? 0,
            (currentThread) =>
              formatActivitySignalLabel(
                getDmThreadActivitySignal(
                  currentThread,
                  freshnessState.dmThreads[currentThread.id] ?? 0
                ),
                tt
              )
          )
        )
        .filter((item): item is InboxThreadCard => Boolean(item))
        .map((item) => ({
          ...item,
          avatarUrl: peerAvatarByUid[item.peerId] ?? "",
          sourcePreviewText: sourcePreviewByThreadId[item.id] ?? "",
          sourceDetailHint:
            item.sourceKey === "play" && item.sourceId
              ? tt("inbox.openStoryHint", "The shared story can be opened inside the chat.")
              : item.sourceKey === "announcement" && item.sourceId
                ? tt("inbox.openAnnouncementHint", "The announcement can be opened inside the chat.")
                : "",
        }))
        .filter((item) => !blockedUserIds.includes(item.peerId))
        .sort((a, b) => b.sortAt - a.sortAt),
    [
      blockedUserIds,
      freshnessState.dmThreads,
      peerAvatarByUid,
      sourcePreviewByThreadId,
      t,
      threads,
      tt,
      uid,
    ]
  );
  const sourceLabels = useMemo(
    () => ({
      play: {
        draw: tt("inbox.sourcePlay", "После общего рисунка"),
        chain_draw: tt("inbox.sourcePlayChainDraw", "После рисунка по очереди"),
        daily_prompt: tt("inbox.sourcePlayDailyPrompt", "После общей темы дня"),
        color_mood: tt("inbox.sourcePlayColorMood", "После палитры настроения"),
      },
      announcement: tt("inbox.sourceAnnouncement", "После объявления"),
      nearby: tt("inbox.sourceNearby", "Из Рядом"),
      direct: tt("inbox.sourceDefault", "Личный чат"),
    }),
    [tt]
  );
  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);
  const goToAnnouncements = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Announcements" });
  }, [navigation]);
  const goToNearby = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Nearby" });
  }, [navigation]);

  const renderHeroCard = () => (
    <View style={styles.heroCard}>
      <View style={styles.heroHeaderRow}>
        <Text style={styles.heroTitle}>
          {tt("inbox.activeTitleCoreLoop", "Чаты")}
        </Text>
        <Text style={styles.heroCount}>{cards.length}</Text>
      </View>
      <Text style={styles.heroText}>
        {tt(
          "inbox.subheaderCoreLoop",
          "Здесь собираются личные переписки после «Вместе», Объявлений и Рядом. Карточка показывает, откуда появился разговор, если такой контекст уже есть."
        )}
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyStateCard}>
      <View style={styles.emptyStateIcon}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.accent} />
      </View>
      <Text style={styles.emptyStateTitle}>
        {tt("inbox.emptyTitleCoreLoop", "Здесь появятся ваши личные разговоры")}
      </Text>
      <Text style={styles.emptyStateText}>
        {tt(
          "inbox.emptyBodyCoreLoop",
          "Здесь появятся личные разговоры после Вместе, Объявлений и Рядом."
        )}
      </Text>
      <View style={styles.emptyActions}>
        <Pressable
          onPress={goToTogether}
          style={styles.emptyPrimaryButton}
        >
          <Text style={styles.emptyPrimaryButtonText}>
            {tt("inbox.goToTogether", "Во Вместе")}
          </Text>
        </Pressable>
        <Pressable
          onPress={goToAnnouncements}
          style={styles.emptySecondaryButton}
        >
          <Text style={styles.emptySecondaryButtonText}>
            {tt("inbox.goToAnnouncements", "В Объявления")}
          </Text>
        </Pressable>
        <Pressable
          onPress={goToNearby}
          style={styles.emptySecondaryButton}
        >
          <Text style={styles.emptySecondaryButtonText}>
            {tt("inbox.goToNearby", "В Рядом")}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderCard = useCallback(
    ({ item }: { item: InboxThreadCard }) => (
      <Pressable
        onPress={() =>
          navigation.navigate(
            "DMChat",
            buildDmChatRouteParams({
              threadId: item.id,
              peerId: item.peerId,
              peerName: item.peerName,
              backTarget: "inbox",
              ...(item.sourceContext ? { sourceContext: item.sourceContext } : {}),
            })
          )
        }
        style={{
          backgroundColor:
            item.signalTone === "fresh" ? "rgba(23, 18, 34, 0.96)" : "rgba(14, 18, 32, 0.94)",
          borderRadius: 22,
          padding: 16,
          borderWidth: 1,
          borderColor:
            item.signalTone === "fresh" ? "rgba(255, 78, 138, 0.30)" : "rgba(255,255,255,0.10)",
          gap: 10,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <UserAvatar avatarUrl={item.avatarUrl} label={item.peerName} size={34} />
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: 16,
                  fontWeight: "800",
                }}
              >
                {item.peerName}
              </Text>
              {item.signalLabel ? (
                <View
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: theme.shapes.pill,
                    backgroundColor:
                      item.signalTone === "fresh"
                        ? "rgba(255, 78, 138, 0.16)"
                        : "rgba(255,255,255,0.06)",
                    borderWidth: 1,
                    borderColor:
                      item.signalTone === "fresh"
                        ? "rgba(255, 78, 138, 0.28)"
                        : "rgba(255,255,255,0.08)",
                  }}
                >
                  <Text
                    style={{
                      color: item.signalTone === "fresh" ? theme.colors.primary : theme.colors.text,
                      fontSize: 11,
                      fontWeight: "800",
                    }}
                  >
                    {item.signalLabel}
                  </Text>
                </View>
              ) : null}
            </View>
            <View
              style={{
                alignSelf: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: theme.shapes.pill,
                backgroundColor: "rgba(255, 122, 60, 0.10)",
                borderWidth: 1,
                borderColor: "rgba(255, 122, 60, 0.18)",
              }}
            >
              <Text style={{ color: theme.colors.accent, fontSize: 12, fontWeight: "800" }}>
                {item.sourceKey === "play"
                  ? sourceLabels.play[item.activity ?? "draw"]
                  : item.sourceKey === "announcement"
                    ? sourceLabels.announcement
                    : item.sourceKey === "nearby"
                      ? sourceLabels.nearby
                      : sourceLabels.direct}
              </Text>
            </View>
          </View>
          <Text
            style={{
              color: theme.colors.muted,
              fontSize: 12,
              fontWeight: "700",
            }}
          >
            {item.dateLabel}
          </Text>
        </View>

        <Text
          style={{
            color: theme.colors.muted,
            fontSize: 11,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.8,
          }}
        >
          {item.conversationLabel}
        </Text>

        <Text
          style={{
            color: item.signalTone === "fresh" ? theme.colors.text : theme.colors.subtext,
            fontSize: 13,
            lineHeight: 20,
          }}
          numberOfLines={2}
        >
          {item.previewText}
        </Text>

        {item.sourcePreviewText ? (
          <View style={styles.sourcePreviewBox}>
            <Text style={styles.sourcePreviewLabel}>
              {tt("inbox.sourcePreviewLabel", "Context")}
            </Text>
            <Text style={styles.sourcePreviewText} numberOfLines={2}>
              {item.sourcePreviewText}
            </Text>
            {item.sourceDetailHint ? (
              <Text style={styles.sourceDetailHint}>{item.sourceDetailHint}</Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>
    ),
    [navigation, sourceLabels, tt]
  );

  if (!uid) {
    return (
      <ScreenShell
        title={t("tabs.chats")}
        background="togetherChat"
      >
        <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: "center" }}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("inbox.authRequiredTitle", "Чаты доступны после входа")}
            body={tt(
              "inbox.authRequiredBodyCoreLoop",
              "Войдите, чтобы увидеть свои личные разговоры и доступный контекст после «Вместе», Объявлений или Рядом."
            )}
            primaryAction={{ label: t("menu.profile"), onPress: () => navigation.navigate("Profile") }}
            secondaryAction={{ label: tt("inbox.goToTogether", "Во Вместе"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!db) {
    return (
      <ScreenShell
        title={t("tabs.chats")}
        background="togetherChat"
      >
        <View style={{ flex: 1, paddingHorizontal: 16, justifyContent: "center" }}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("inbox.errorTitle", "Чаты временно недоступны")}
            body={tt(
              "inbox.offlineBodyCoreLoop",
              "Сейчас не получается открыть личные разговоры. Попробуй позже или вернись во «Вместе»."
            )}
            primaryAction={{ label: tt("inbox.goToTogether", "Во Вместе"), onPress: goToTogether }}
            secondaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("tabs.chats")}
      background="togetherChat"
    >
      <View
        style={[styles.screenContent, { paddingBottom: insets.bottom + 8 }]}
      >
        {renderHeroCard()}

        {loading ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            <CoreStateCard
              loading
              icon="chatbubbles-outline"
              title={t("tabs.chats")}
              body={tt("inbox.loading", "Подключаем ваши личные разговоры…")}
            />
          </View>
        ) : error ? (
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 12,
            }}
          >
            <CoreStateCard
              icon="cloud-offline-outline"
              title={tt("inbox.errorTitle", "Чаты временно недоступны")}
              body={error}
              primaryAction={{
                label: tt("common.retry", "Повторить"),
                onPress: () => setReloadKey((prev) => prev + 1),
              }}
              secondaryAction={{
                label: tt("inbox.goToTogether", "Во Вместе"),
                onPress: goToTogether,
              }}
            />
          </View>
        ) : cards.length ? (
          <FlatList
            data={cards}
            keyExtractor={(item) => item.id}
            renderItem={renderCard}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          renderEmptyState()
        )}
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  heroCard: {
    marginBottom: 12,
    gap: 8,
    padding: 16,
    borderRadius: theme.shapes.card,
    backgroundColor: "rgba(12, 16, 30, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  heroHeaderRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  heroCount: {
    color: theme.colors.muted,
    fontSize: 12,
  },
  heroText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyStateCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(14, 18, 32, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 12,
  },
  emptyStateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 122, 60, 0.10)",
    borderWidth: 1,
    borderColor: "rgba(255, 122, 60, 0.18)",
  },
  emptyStateTitle: {
    color: theme.colors.text,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  emptyStateText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 19,
  },
  emptyActions: {
    gap: 8,
  },
  emptyPrimaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    marginTop: 2,
  },
  emptyPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  emptySecondaryButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
  },
  emptySecondaryButtonText: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  sourcePreviewBox: {
    gap: 4,
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  sourcePreviewLabel: {
    color: theme.colors.muted,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  sourcePreviewText: {
    color: theme.colors.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  sourceDetailHint: {
    color: theme.colors.subtext,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  listContent: {
    paddingTop: 2,
    paddingBottom: 12,
    gap: 10,
  },
});
