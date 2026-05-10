import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  BackHandler,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type AlertButton,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import UserAvatar from "@/components/UserAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type DmChatRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import * as chatApi from "@/services/api/chatApi";
import * as safetyApi from "@/services/api/safetyApi";
import type { SafetyReportReason } from "@/services/api/safetyApi";
import type { MessageDto } from "@/services/api/types";
import * as wsClient from "@/services/realtime/wsClient";
import { theme } from "@/theme";

type RenderMessage = MessageDto & {
  pending?: boolean;
  failed?: boolean;
};

function buildReportReasonButtons(
  tt: (key: string, fallback: string, params?: Record<string, string>) => string,
  onSelect: (reason: SafetyReportReason) => void
): AlertButton[] {
  return [
    {
      text: tt("safety.reason.spam", "Спам"),
      onPress: () => onSelect("spam"),
    },
    {
      text: tt("safety.reason.harassment", "Оскорбления или преследование"),
      onPress: () => onSelect("harassment"),
    },
    {
      text: tt("safety.reason.sexualServices", "Сексуальные услуги или оплатная встреча"),
      onPress: () => onSelect("sexual_services"),
    },
    {
      text: tt("safety.reason.scam", "Мошенничество"),
      onPress: () => onSelect("scam"),
    },
    {
      text: tt("safety.reason.other", "Другое"),
      onPress: () => onSelect("other"),
    },
    {
      text: tt("common.cancel", "Отмена"),
      style: "cancel",
    },
  ];
}

function messageTime(value: string) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function messageKey(message: Pick<MessageDto, "clientMessageId" | "id">) {
  return String(message.clientMessageId || message.id);
}

function mergeMessages(current: RenderMessage[], incoming: RenderMessage[]) {
  const byKey = new Map<string, RenderMessage>();
  for (const message of current) {
    byKey.set(messageKey(message), message);
  }
  for (const message of incoming) {
    byKey.set(messageKey(message), {
      ...byKey.get(messageKey(message)),
      ...message,
      pending: message.pending,
      failed: message.failed,
    });
  }

  return Array.from(byKey.values()).sort(
    (left, right) => messageTime(right.createdAt) - messageTime(left.createdAt)
  );
}

function isTogetherSource(source: unknown): boolean {
  return source === "together" || source === "play";
}

function readThreadMessage(payload: wsClient.RealtimeMessage): MessageDto | null {
  const candidate =
    payload.message && typeof payload.message === "object"
      ? payload.message
      : payload;
  if (!candidate || typeof candidate !== "object") return null;

  const value = candidate as Partial<MessageDto>;
  const id = String(value.id ?? "").trim();
  const threadId = String(value.threadId ?? payload.threadId ?? "").trim();
  const fromUserId = String(value.fromUserId ?? "").trim();
  const text = String(value.text ?? "").trim();
  const createdAt = String(value.createdAt ?? "").trim();
  const clientMessageId = String(value.clientMessageId ?? id).trim();
  if (!id || !threadId || !fromUserId || !text || !createdAt || !clientMessageId) {
    return null;
  }

  return {
    id,
    threadId,
    fromUserId,
    text,
    createdAt,
    clientMessageId,
  };
}

export default function DMChatScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"DMChat">>();
  const route = useRoute<DmChatRouteProp>();
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );

  const myId = authUser?.id ?? "";
  const threadId = String(route.params?.threadId ?? "").trim();
  const peerId = String(route.params?.peerId ?? "").trim();
  const routePeerName = String(route.params?.peerName ?? "").trim();
  const backTarget = route.params?.backTarget;
  const backSessionId = String(route.params?.backSessionId ?? "").trim();
  const sourceContext = route.params?.sourceContext ?? null;

  const [messages, setMessages] = useState<RenderMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [safetyBusy, setSafetyBusy] = useState(false);

  const textRef = useRef("");
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<RenderMessage>>(null);
  const mountedRef = useRef(true);

  const amoriaUserLabel = tt("profile.amoriaUser", "Пользователь Amoria");
  const peerDisplayName = routePeerName || amoriaUserLabel;
  const peerBlocked = Boolean(peerId && blockedUserIds.includes(peerId));

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setMessages([]);
    setText("");
    textRef.current = "";
    inputRef.current?.clear?.();
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [threadId]);

  const loadMessages = useCallback(async () => {
    if (!threadId || !myId) {
      setMessages([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await chatApi.listMessages(threadId, 50);
      setMessages(mergeMessages([], response.items ?? []));
      await chatApi.markRead(threadId).catch(() => undefined);
    } catch {
      setError(
        tt(
          "dm.errorBody",
          "Не удалось подключить этот разговор прямо сейчас. Попробуй ещё раз."
        )
      );
    } finally {
      setLoading(false);
    }
  }, [myId, threadId, tt]);

  useEffect(() => {
    void loadMessages();
  }, [loadMessages, reloadKey]);

  useEffect(() => {
    let alive = true;
    if (!threadId || !myId) return () => {
      alive = false;
    };

    wsClient.connect();
    wsClient.subscribeThread(threadId);
    const unsubscribe = wsClient.onMessage((payload) => {
      if (!alive || payload.type !== "thread.message") return;

      const message = readThreadMessage(payload);
      if (!message || message.threadId !== threadId) return;

      setMessages((current) => mergeMessages(current, [message]));
      void chatApi.markRead(threadId, message.id).catch(() => undefined);
    });

    return () => {
      alive = false;
      unsubscribe();
      wsClient.unsubscribeThread(threadId);
    };
  }, [myId, threadId]);

  useEffect(() => {
    let alive = true;
    if (!myId) {
      setBlockedUserIds([]);
      return () => {
        alive = false;
      };
    }

    void safetyApi.listBlockedUserIds()
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
  }, [myId, reloadKey]);

  const retry = useCallback(() => {
    wsClient.disconnect();
    setReloadKey((prev) => prev + 1);
  }, []);

  const sourceTitle = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt("dm.sourceAnnouncement", "Вы начали разговор после объявления");
    }
    if (sourceContext?.source === "nearby") {
      return tt("dm.sourceNearby", "Вы начали разговор из Рядом");
    }
    if (isTogetherSource(sourceContext?.source)) {
      return tt("dm.sourceTogether", "Вы начали разговор после Вместе");
    }
    return "";
  }, [sourceContext?.source, tt]);

  const headerSourceLabel = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt("inbox.sourceAnnouncement", "После объявления");
    }
    if (sourceContext?.source === "nearby") {
      return tt("inbox.sourceNearby", "Из Рядом");
    }
    if (isTogetherSource(sourceContext?.source)) {
      return tt("inbox.sourceTogether", "После Вместе");
    }
    return "";
  }, [sourceContext?.source, tt]);

  const screenTitle = peerDisplayName
    ? t("dm.title", { name: peerDisplayName })
    : tt("dm.genericTitle", "Разговор");

  const handleBack = useCallback(() => {
    if (backTarget === "inbox") {
      navigation.navigate("Tabs", { screen: "Inbox" });
      return;
    }

    if (backTarget === "history") {
      navigation.navigate("PlayHistory");
      return;
    }

    if (backTarget === "sessionDetail") {
      if (backSessionId) {
        navigation.navigate("PlaySessionDetail", { sessionId: backSessionId });
      } else {
        navigation.navigate("Tabs", { screen: "Together" });
      }
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate("Tabs", { screen: "Together" });
  }, [backSessionId, backTarget, navigation]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const openPeerProfile = useCallback(() => {
    if (!peerId) return;
    navigation.navigate("UserProfile", {
      userId: peerId,
      peerName: peerDisplayName,
      ...(threadId ? { threadId } : {}),
      ...(sourceContext ? { sourceContext } : {}),
    });
  }, [navigation, peerDisplayName, peerId, sourceContext, threadId]);

  const chatHeader = peerId ? (
    <TouchableOpacity
      onPress={openPeerProfile}
      style={styles.chatHeader}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={tt("dm.openPeerProfile", "Профиль собеседника")}
    >
      <UserAvatar avatarUrl="" label={peerDisplayName} size={34} />
      <View style={styles.chatHeaderCopy}>
        <Text style={styles.chatHeaderName} numberOfLines={1}>
          {peerDisplayName}
        </Text>
        {headerSourceLabel ? (
          <Text style={styles.chatHeaderSource} numberOfLines={1}>
            {headerSourceLabel}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  ) : null;

  const handleTextChange = useCallback((value: string) => {
    textRef.current = value;
    setText(value);
  }, []);

  const send = useCallback(async () => {
    const value = textRef.current.trim();
    if (!value || !threadId || !myId || peerBlocked) return;

    const clientMessageId = `m_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const optimistic: RenderMessage = {
      id: clientMessageId,
      threadId,
      fromUserId: myId,
      text: value,
      createdAt: new Date().toISOString(),
      clientMessageId,
      pending: true,
    };

    textRef.current = "";
    setText("");
    inputRef.current?.clear?.();
    setSending(true);
    setMessages((current) => mergeMessages(current, [optimistic]));

    try {
      const sent = await chatApi.sendMessage(threadId, clientMessageId, value);
      if (!mountedRef.current) return;
      setMessages((current) => mergeMessages(current, [sent]));
      await chatApi.markRead(threadId, sent.id).catch(() => undefined);
    } catch {
      if (!mountedRef.current) return;
      setMessages((current) =>
        mergeMessages(
          current.filter((message) => messageKey(message) !== clientMessageId),
          [{ ...optimistic, pending: false, failed: true }]
        )
      );
    } finally {
      if (mountedRef.current) {
        setSending(false);
      }
    }
  }, [myId, peerBlocked, threadId]);

  const retrySend = useCallback(
    (clientMessageId: string) => {
      const target = messages.find(
        (message) => message.clientMessageId === clientMessageId && message.failed
      );
      if (!target) return;
      textRef.current = target.text;
      setText(target.text);
      setMessages((current) =>
        current.filter((message) => messageKey(message) !== clientMessageId)
      );
      void send();
    },
    [messages, send]
  );

  const reportChat = useCallback(
    async (reason: SafetyReportReason) => {
      if (!threadId || !peerId || safetyBusy) return;

      setSafetyBusy(true);
      try {
        await safetyApi.report({
          targetType: "thread",
          targetId: threadId,
          targetOwnerUserId: peerId,
          reason,
        });
        Alert.alert(
          tt("safety.reportSentTitle", "Жалоба отправлена"),
          tt("safety.reportSentBody", "Спасибо. Жалоба сохранена и будет доступна для проверки.")
        );
      } catch {
        Alert.alert(
          tt("safety.reportErrorTitle", "Жалоба не отправилась"),
          tt("safety.reportErrorBody", "Не удалось сохранить жалобу. Попробуй ещё раз позже.")
        );
      } finally {
        setSafetyBusy(false);
      }
    },
    [peerId, safetyBusy, threadId, tt]
  );

  const handleReportChat = useCallback(() => {
    Alert.alert(
      tt("safety.reportTitle", "Пожаловаться"),
      tt("safety.reportBody", "Выбери причину жалобы."),
      buildReportReasonButtons(tt, (reason) => void reportChat(reason))
    );
  }, [reportChat, tt]);

  const handleBlockPeer = useCallback(() => {
    if (!peerId || peerId === myId) return;
    Alert.alert(
      tt("safety.blockTitle", "Заблокировать пользователя?"),
      tt(
        "safety.blockBody",
        "Вы больше не будете видеть его объявления в обычном списке, а личные чаты будут скрыты из вкладки «Чаты»."
      ),
      [
        {
          text: tt("common.cancel", "Отмена"),
          style: "cancel",
        },
        {
          text: tt("safety.blockConfirm", "Заблокировать"),
          style: "destructive",
          onPress: () => {
            setSafetyBusy(true);
            void safetyApi.blockUser(peerId)
              .then(() => {
                setBlockedUserIds((current) =>
                  current.includes(peerId) ? current : [...current, peerId]
                );
                setReloadKey((prev) => prev + 1);
              })
              .catch(() => {
                Alert.alert(
                  tt("safety.blockErrorTitle", "Не удалось заблокировать"),
                  tt("safety.blockErrorBody", "Попробуй ещё раз позже.")
                );
              })
              .finally(() => setSafetyBusy(false));
          },
        },
      ]
    );
  }, [myId, peerId, tt]);

  const renderSourceCard = useCallback(
    () =>
      sourceTitle ? (
        <View style={styles.sourceCard}>
          <Text style={styles.sourceEyebrow}>
            {tt("dm.sourceEyebrow", "Контекст разговора")}
          </Text>
          <Text style={styles.sourceTitle}>{sourceTitle}</Text>
          <Text style={styles.sourceMeta}>
            {tt(
              "dm.contextReady",
              "Общий момент сохранён как контекст, а переписка продолжается здесь."
            )}
          </Text>
        </View>
      ) : null,
    [sourceTitle, tt]
  );

  const renderPeerCard = useCallback(
    () =>
      peerId ? (
        <TouchableOpacity
          onPress={openPeerProfile}
          style={styles.peerCard}
          activeOpacity={0.85}
        >
          <UserAvatar avatarUrl="" label={peerDisplayName} size={42} />
          <View style={styles.peerCopy}>
            <Text style={styles.peerName}>{peerDisplayName}</Text>
            <Text style={styles.peerMeta}>
              {tt("dm.openPeerProfile", "Профиль собеседника")}
            </Text>
          </View>
          <Text style={styles.peerActionText}>{tt("menu.profile", "Профиль")}</Text>
        </TouchableOpacity>
      ) : null,
    [openPeerProfile, peerDisplayName, peerId, tt]
  );

  const renderSafetyCard = useCallback(
    () =>
      peerId ? (
        <View style={styles.safetyCard}>
          <Text style={styles.safetyTitle}>
            {peerBlocked
              ? tt("safety.chatBlockedTitle", "Пользователь заблокирован")
              : tt("safety.chatSafetyTitle", "Безопасность разговора")}
          </Text>
          <Text style={styles.safetyBody}>
            {peerBlocked
              ? tt(
                  "safety.cannotMessageBlockedUser",
                  "Вы заблокировали этого пользователя. История разговора остаётся доступной, но новые сообщения отключены."
                )
              : tt(
                  "safety.chatSafetyBody",
                  "Можно пожаловаться на разговор или заблокировать пользователя."
                )}
          </Text>
          <View style={styles.safetyActions}>
            <TouchableOpacity
              onPress={handleReportChat}
              disabled={safetyBusy}
              style={[styles.safetyButton, safetyBusy ? styles.safetyButtonDisabled : null]}
              activeOpacity={0.85}
            >
              <Text style={styles.safetyButtonText}>
                {tt("safety.report", "Пожаловаться")}
              </Text>
            </TouchableOpacity>
            {!peerBlocked && peerId !== myId ? (
              <TouchableOpacity
                onPress={handleBlockPeer}
                disabled={safetyBusy}
                style={[styles.safetyButton, safetyBusy ? styles.safetyButtonDisabled : null]}
                activeOpacity={0.85}
              >
                <Text style={styles.safetyButtonText}>
                  {tt("safety.blockUser", "Заблокировать пользователя")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null,
    [
      handleBlockPeer,
      handleReportChat,
      myId,
      peerBlocked,
      peerId,
      safetyBusy,
      tt,
    ]
  );

  const renderContextFooter = useCallback(
    () => (
      <>
        {renderPeerCard()}
        {renderSourceCard()}
        {renderSafetyCard()}
      </>
    ),
    [renderPeerCard, renderSafetyCard, renderSourceCard]
  );

  const renderItem = useCallback(
    ({ item }: { item: RenderMessage }) => {
      const isOwn = item.fromUserId === myId;
      const failed = item.failed === true;
      const pending = !failed && item.pending === true;

      return (
        <TouchableOpacity
          activeOpacity={failed ? 0.85 : 1}
          disabled={!failed}
          onPress={() => retrySend(item.clientMessageId)}
          style={[styles.msgWrap, isOwn ? styles.msgWrapOwn : styles.msgWrapPeer]}
        >
          <View
            style={[
              styles.msg,
              isOwn ? styles.msgOwn : styles.msgPeer,
              pending ? styles.msgPending : null,
              failed ? styles.msgFailed : null,
            ]}
          >
            <Text style={[styles.msgText, isOwn ? styles.msgTextOwn : styles.msgTextPeer]}>
              {item.text}
            </Text>
            {failed ? (
              <Text style={[styles.msgStatus, styles.msgFailedText]}>{t("common.failed")}</Text>
            ) : pending ? (
              <Text style={styles.msgStatus}>{t("common.sending")}</Text>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    },
    [myId, retrySend, t]
  );

  const canSend = text.trim().length > 0 && !peerBlocked && !sending;
  const canShowComposer = Boolean(myId && threadId) && !peerBlocked && !loading && !error;
  const isEmpty = !loading && !error && messages.length === 0;

  if (!threadId) {
    return (
      <ScreenShell
        title={screenTitle}
        headerCenter={chatHeader}
        background="togetherChat"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title={tt("dm.unavailableTitle", "Разговор недоступен")}
            body={tt("dm.unavailableBody", "Не удалось открыть чат без корректного идентификатора.")}
            primaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!myId) {
    return (
      <ScreenShell
        title={screenTitle}
        headerCenter={chatHeader}
        background="togetherChat"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("dm.authRequiredTitle", "Чат доступен после входа")}
            body={tt("dm.authRequiredBody", "Войди в аккаунт, чтобы открыть чат.")}
            primaryAction={{
              label: tt("common.openProfile", "Открыть профиль"),
              onPress: () => navigation.navigate("Profile"),
            }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={screenTitle}
      headerCenter={chatHeader}
      background="togetherChat"
      showBack
      onBack={handleBack}
    >
      {loading ? (
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="chatbubble-ellipses-outline"
            title={screenTitle}
            body={tt("dm.loading", "Подключаем чат…")}
          />
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("dm.errorTitle", "Разговор временно недоступен")}
            body={error}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: retry }}
            secondaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      ) : isEmpty ? (
        <View style={styles.centerState}>
          {renderContextFooter()}
          <CoreStateCard
            icon="chatbubbles-outline"
            title={
              peerBlocked
                ? tt("safety.chatBlockedTitle", "Пользователь заблокирован")
                : tt("dm.emptyTitle", "Чат уже открыт")
            }
            body={
              peerBlocked
                ? tt(
                    "safety.cannotMessageBlockedUser",
                    "Вы заблокировали этого пользователя. История разговора остаётся доступной, но новые сообщения отключены."
                  )
                : tt(
                    "dm.emptyBodyCoreLoop",
                    "Разговор уже открыт. Можно написать первым ниже."
                  )
            }
            primaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          key={threadId}
          inverted
          data={messages}
          keyExtractor={(item) => messageKey(item)}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews
          ListFooterComponent={renderContextFooter()}
        />
      )}

      {canShowComposer ? (
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={handleTextChange}
              placeholder={t("dm.messagePlaceholder")}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              onPress={() => void send()}
              disabled={!canSend}
              style={[styles.sendBtn, !canSend ? styles.sendBtnDisabled : null]}
            >
              <Text style={styles.sendTxt}>{t("common.send")}</Text>
            </TouchableOpacity>
          </View>
        </KeyboardStickyView>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  chatHeader: {
    maxWidth: "100%",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  chatHeaderCopy: {
    flexShrink: 1,
    alignItems: "flex-start",
  },
  chatHeaderName: {
    maxWidth: 150,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  chatHeaderSource: {
    maxWidth: 150,
    color: theme.colors.subtext,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 14,
  },
  sourceCard: {
    alignSelf: "stretch",
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginBottom: 10,
    backgroundColor: "rgba(12, 16, 30, 0.90)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  sourceEyebrow: {
    color: theme.colors.accent,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  sourceTitle: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 5,
    textAlign: "left",
  },
  sourceMeta: {
    color: theme.colors.subtext,
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    textAlign: "left",
  },
  peerCard: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 15,
    paddingVertical: 13,
    marginBottom: 10,
    backgroundColor: "rgba(12, 16, 30, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  peerCopy: {
    flex: 1,
    gap: 2,
  },
  peerName: {
    color: theme.colors.text,
    fontSize: 15,
    fontWeight: "800",
  },
  peerMeta: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "700",
  },
  peerActionText: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
  },
  safetyCard: {
    alignSelf: "stretch",
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 15,
    paddingVertical: 14,
    marginBottom: 10,
    backgroundColor: "rgba(12, 16, 30, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 8,
  },
  safetyTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
  },
  safetyBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 18,
  },
  safetyActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  safetyButton: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  safetyButtonDisabled: {
    opacity: 0.55,
  },
  safetyButtonText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  msgWrap: {
    width: "100%",
    marginBottom: 6,
  },
  msgWrapOwn: {
    alignItems: "flex-end",
  },
  msgWrapPeer: {
    alignItems: "flex-start",
  },
  msg: {
    maxWidth: "82%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
  },
  msgOwn: {
    backgroundColor: "rgba(255, 78, 138, 0.18)",
    borderColor: "rgba(255, 78, 138, 0.32)",
  },
  msgPeer: {
    backgroundColor: "rgba(15, 19, 34, 0.94)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  msgText: {
    fontSize: 15,
    lineHeight: 20,
  },
  msgTextOwn: {
    color: "#FFFFFF",
  },
  msgTextPeer: {
    color: theme.colors.text,
  },
  msgPending: {
    opacity: 0.7,
  },
  msgFailed: {
    borderColor: "#fca5a5",
    backgroundColor: "#fff5f5",
  },
  msgStatus: {
    marginTop: 5,
    fontSize: 11,
    color: theme.colors.muted,
  },
  msgFailedText: {
    color: "#dc2626",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 10,
    backgroundColor: "rgba(8, 11, 22, 0.90)",
    borderTopWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: "rgba(255,255,255,0.08)",
    color: theme.colors.text,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  sendBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 18,
    minHeight: 48,
    minWidth: 82,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendTxt: {
    color: "#fff",
    fontWeight: "800",
  },
});
