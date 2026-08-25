import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { type RootStackNavigationProp } from "@/navigation/appRoutes";
import * as chatApi from "@/services/api/chatApi";
import { listBlockedUserIds } from "@/services/api/safetyApi";
import type { ThreadDto } from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import { theme } from "@/theme";

type InboxSourceKey = "together" | "announcement" | "nearby" | "direct";

function formatThreadDate(value: string | null | undefined, locale: string) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "";

  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return new Intl.DateTimeFormat(locale).format(new Date(timestamp));
  }
}

function getSourceKey(thread: ThreadDto): InboxSourceKey {
  const type = String(thread.source?.type ?? "").trim();
  if (isTogetherSource(type)) return "together";
  if (type === "announcement" || type === "nearby") return type;
  return "direct";
}

function isTogetherSource(source: unknown): boolean {
  return source === "together" || source === "play";
}

export default function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<RootStackNavigationProp>();
  const { user: authUser } = useAuth();
  const { t, locale } = useLocale();
  const numberFormatter = React.useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const tt = useCallback(
    (key: string, params?: Record<string, string>) => t(key, params),
    [t]
  );
  const uid = authUser?.id ?? "";
  const [threads, setThreads] = useState<ThreadDto[]>([]);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const loadInbox = useCallback(async () => {
    if (!uid) {
      setThreads([]);
      setBlockedUserIds([]);
      wsClient.disconnect();
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [response, blockedIds] = await Promise.all([
        chatApi.listInbox(30),
        listBlockedUserIds().catch(() => []),
      ]);
      setThreads(response.items ?? []);
      setBlockedUserIds(blockedIds);
    } catch {
      setError(
        tt(
          "inbox.errorBody"
        )
      );
    } finally {
      setLoading(false);
    }
  }, [tt, uid]);

  useEffect(() => {
    let alive = true;

    void loadInbox();
    const unsubscribe = wsClient.onMessage((message) => {
      if (!alive || message.type !== "inbox.updated") return;
      void loadInbox();
    });

    if (uid) {
      wsClient.connect();
      wsClient.subscribeInbox();
    }

    return () => {
      alive = false;
      unsubscribe();
    };
  }, [loadInbox, reloadKey, uid]);

  useFocusEffect(
    useCallback(() => {
      void loadInbox();
      return undefined;
    }, [loadInbox])
  );

  const retry = useCallback(() => {
    wsClient.disconnect();
    setReloadKey((prev) => prev + 1);
  }, []);

  const sourceLabels = useMemo(
    () => ({
      together: tt("inbox.sourceTogether"),
      announcement: tt("inbox.sourceAnnouncement"),
      nearby: tt("inbox.sourceNearby"),
      direct: tt("inbox.sourceDefault"),
    }),
    [tt]
  );

  const goToTogether = useCallback(() => {
    navigation.navigate("Tabs", { screen: "Together" });
  }, [navigation]);

  const cards = useMemo(
    () => {
      const blocked = new Set(blockedUserIds);
      return threads
        .filter((thread) => !blocked.has(thread.peer.id))
        .sort((left, right) => {
        const leftTime = Date.parse(String(left.lastMessage?.createdAt ?? ""));
        const rightTime = Date.parse(String(right.lastMessage?.createdAt ?? ""));
        return (Number.isFinite(rightTime) ? rightTime : 0) -
          (Number.isFinite(leftTime) ? leftTime : 0);
      });
    },
    [blockedUserIds, threads]
  );

  const renderHeroCard = () => (
    <View style={styles.heroCard}>
      <View style={styles.heroHeaderRow}>
        <Text style={styles.heroTitle}>
          {tt("inbox.activeTitleCoreLoop")}
        </Text>
        <Text style={styles.heroCount}>{numberFormatter.format(cards.length)}</Text>
      </View>
      <Text style={styles.heroText}>
        {tt(
          "inbox.subheaderCoreLoop"
        )}
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyStateCard}>
      <View style={styles.emptyStateIcon}>
        <Ionicons name="chatbubble-ellipses-outline" size={22} color={theme.colors.textAccent} />
      </View>
      <Text style={styles.emptyStateTitle}>
        {tt("inbox.emptyTitleCoreLoop")}
      </Text>
      <Text style={styles.emptyStateText}>
        {tt(
          "inbox.emptyBodyCoreLoop"
        )}
      </Text>
      <View style={styles.emptyActions}>
        <Pressable onPress={goToTogether} style={styles.emptyPrimaryButton}>
          <Text style={styles.emptyPrimaryButtonText}>
            {tt("inbox.goToTogether")}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const renderCard = useCallback(
    ({ item }: { item: ThreadDto }) => {
      const sourceKey = getSourceKey(item);
      const peerName =
        item.peer.displayName?.trim() ||
        tt("profile.amoriaUser");
      const previewText =
        item.lastMessage?.text?.trim() ||
        tt("inbox.previewFallbackCoreLoop");

      return (
        <Pressable
          onPress={() =>
            navigation.navigate("DMChat", {
              threadId: item.id,
              peerId: item.peer.id,
              peerName,
              backTarget: "inbox",
              ...(item.source && sourceKey !== "direct"
                ? {
                    sourceContext: {
                      source: sourceKey,
                      sourceSessionId: item.source.sourceId,
                    },
                  }
                : {}),
            })
          }
          style={[
            styles.threadCard,
            item.unreadCount > 0 ? styles.threadCardUnread : null,
          ]}
        >
          <View style={styles.threadHeader}>
            <View style={styles.peerRow}>
              <UserAvatar avatarUrl={item.peer.avatarUrl ?? ""} label={peerName} size={44} />
              <View style={styles.peerCopy}>
                <Text style={styles.peerName} numberOfLines={1}>
                  {peerName}
                </Text>
                <Text style={styles.sourceLabel}>{sourceLabels[sourceKey]}</Text>
              </View>
            </View>
            <View style={styles.threadMeta}>
              <Text style={styles.dateLabel}>
                {formatThreadDate(item.lastMessage?.createdAt, locale)}
              </Text>
              {item.unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{numberFormatter.format(item.unreadCount)}</Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text
            style={[
              styles.previewText,
              item.unreadCount > 0 ? styles.previewTextUnread : null,
            ]}
            numberOfLines={2}
          >
            {previewText}
          </Text>
        </Pressable>
      );
    },
    [navigation, sourceLabels, tt]
  );

  if (!uid) {
    return (
      <ScreenShell title={t("tabs.chats")} background="chatCanalV6">
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("inbox.authRequiredTitle")}
            body={tt(
              "inbox.authRequiredBodyCoreLoop"
            )}
            primaryAction={{
              label: t("menu.profile"),
              onPress: () => navigation.navigate("Profile"),
            }}
            secondaryAction={{ label: tt("inbox.goToTogether"), onPress: goToTogether }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t("tabs.chats")} background="chatCanalV6">
      <View style={[styles.screenContent, { paddingBottom: insets.bottom + 8 }]}>
        {renderHeroCard()}

        {loading ? (
          <View style={styles.centerState}>
            <CoreStateCard
              loading
              icon="chatbubbles-outline"
              title={t("tabs.chats")}
              body={tt("inbox.loading")}
            />
          </View>
        ) : error ? (
          <View style={styles.centerState}>
            <CoreStateCard
              icon="cloud-offline-outline"
              title={tt("inbox.errorTitle")}
              body={error}
              primaryAction={{ label: tt("common.retry"), onPress: retry }}
              secondaryAction={{
                label: tt("inbox.goToTogether"),
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
  centerState: {
    flex: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  heroCard: {
    marginBottom: 12,
    gap: 8,
    padding: 16,
    backgroundColor: "transparent",
    borderWidth: 0,
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
  listContent: {
    paddingTop: 2,
    paddingBottom: 12,
    gap: 10,
  },
  threadCard: {
    minHeight: 72,
    backgroundColor: "transparent",
    padding: 12,
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(230,185,118,0.16)",
    gap: 10,
  },
  threadCardUnread: {
    backgroundColor: "transparent",
    borderBottomColor: "rgba(230,185,118,0.28)",
  },
  threadHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  peerRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  peerCopy: {
    flex: 1,
    gap: 4,
  },
  peerName: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "800",
  },
  sourceLabel: {
    color: theme.colors.textAccent,
    fontSize: 12,
    fontWeight: "800",
  },
  threadMeta: {
    alignItems: "flex-end",
    gap: 6,
  },
  dateLabel: {
    color: theme.colors.muted,
    fontSize: 12,
    fontWeight: "700",
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primaryActionBg,
  },
  unreadBadgeText: {
    color: theme.colors.primaryActionText,
    fontSize: 11,
    fontWeight: "700",
  },
  previewText: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 20,
  },
  previewTextUnread: {
    color: theme.colors.text,
    fontWeight: "700",
  },
  emptyStateCard: {
    padding: 18,
    backgroundColor: "transparent",
    borderWidth: 0,
    gap: 12,
  },
  emptyStateIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    borderWidth: 0,
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
    minHeight: theme.buttons.primary.height,
    borderRadius: theme.buttons.primary.borderRadius,
    paddingHorizontal: theme.buttons.primary.paddingHorizontal,
    paddingVertical: 12,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
    alignItems: "center",
    marginTop: 2,
  },
  emptyPrimaryButtonText: {
    color: theme.buttons.primary.textColor,
    fontSize: theme.buttons.primary.fontSize,
    lineHeight: theme.buttons.primary.lineHeight,
    fontWeight: theme.buttons.primary.fontWeight,
  },
});
