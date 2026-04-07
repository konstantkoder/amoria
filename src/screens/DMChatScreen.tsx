import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  buildDmThreadId,
  mapDmThreadToPeer,
  sendDmMessage,
  subscribeDmMessages,
  subscribeDmThreads,
  type DmMessageDoc,
  type DmThreadDoc,
} from "@/services/dm";
import { theme } from "@/theme";

type RenderMessage = DmMessageDoc & { failed?: boolean };

export default function DMChatScreen() {
  const navigation = useNavigation<any>();
  const { t } = useLocale();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const route = useRoute<any>();
  const myId = auth?.currentUser?.uid ?? "";
  const routePeerId = String(route.params?.peerId ?? "");
  const threadId = String(
    route.params?.threadId ?? (myId && routePeerId ? buildDmThreadId(myId, routePeerId) : "")
  );
  const routePeerName = String(route.params?.peerName ?? "").trim();
  const peerId = routePeerId || "";
  const backTarget = String(route.params?.backTarget ?? "");
  const backSessionId = String(route.params?.backSessionId ?? "");

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [thread, setThread] = useState<DmThreadDoc | null>(null);
  const [msgs, setMsgs] = useState<DmMessageDoc[]>([]);
  const [failedById, setFailedById] = useState<Record<string, true>>({});
  const [threadLoading, setThreadLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);
  const [subscriptionError, setSubscriptionError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const textRef = useRef("");
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<RenderMessage>>(null);
  const sendGuardRef = useRef(false);
  const mountedRef = useRef(true);
  const activeThreadRef = useRef(threadId);
  const sendResetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (sendResetTimeoutRef.current) {
        clearTimeout(sendResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    activeThreadRef.current = threadId;
    sendGuardRef.current = false;
    setSending(false);
    setThread(null);
    setMsgs([]);
    setFailedById({});
    setThreadLoading(Boolean(db && myId && threadId));
    setMessagesLoading(Boolean(db && threadId));
    setSubscriptionError(null);
    textRef.current = "";
    setText("");
    inputRef.current?.setNativeProps?.({ text: "" });
    inputRef.current?.clear?.();
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [myId, routePeerName, threadId]);

  useEffect(() => {
    if (!db || !myId || !threadId) {
      setThread(null);
      setThreadLoading(false);
      return;
    }

    setThreadLoading(true);
    setSubscriptionError(null);
    const unsubscribe = subscribeDmThreads(
      db,
      myId,
      (threads) => {
        if (!mountedRef.current || activeThreadRef.current !== threadId) return;
        setThread(threads.find((item) => item.id === threadId) ?? null);
        setThreadLoading(false);
      },
      () => {
        if (!mountedRef.current || activeThreadRef.current !== threadId) return;
        setSubscriptionError(tt("dm.errorBody", "We couldn't connect this chat right now. Try again."));
        setThreadLoading(false);
      }
    );

    return unsubscribe;
  }, [myId, threadId, tt, reloadKey]);

  useEffect(() => {
    if (!db || !threadId) {
      setMsgs([]);
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    setSubscriptionError(null);
    return subscribeDmMessages(
      db,
      threadId,
      (next) => {
        if (!mountedRef.current || activeThreadRef.current !== threadId) return;
        setMsgs(next);
        setMessagesLoading(false);
      },
      () => {
        if (!mountedRef.current || activeThreadRef.current !== threadId) return;
        setSubscriptionError(tt("dm.errorBody", "We couldn't connect this chat right now. Try again."));
        setMessagesLoading(false);
      }
    );
  }, [threadId, tt, reloadKey]);

  useEffect(() => {
    if (!msgs.length) return;
    setFailedById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const message of msgs) {
        if (next[message.clientId] && !message.pending) {
          delete next[message.clientId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [msgs]);

  const peer = useMemo(() => {
    if (!thread) {
      return {
        uid: peerId,
        name: routePeerName || t("common.user"),
      };
    }
    return mapDmThreadToPeer(thread, myId) ?? {
      uid: peerId,
      name: routePeerName || t("common.user"),
    };
  }, [myId, peerId, routePeerName, t, thread]);

  const mergedMsgs = useMemo(() => {
    const byId = new Map<string, RenderMessage>();
    for (const message of msgs) {
      const key = String(message.clientId || message.id);
      byId.set(key, {
        ...message,
        failed: Boolean(failedById[key]),
      });
    }
    return Array.from(byId.values()).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  }, [failedById, msgs]);

  const send = useCallback(() => {
    const value = (textRef.current || "").trim();
    if (!value || !db || !threadId || !myId || !peer.uid) return;
    if (sendGuardRef.current) return;

    const targetThreadId = threadId;
    const targetPeerId = peer.uid;
    const clientId = `m_${myId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    sendGuardRef.current = true;

    if (mountedRef.current) {
      setSending(true);
    }

    textRef.current = "";
    setText("");
    inputRef.current?.setNativeProps?.({ text: "" });
    inputRef.current?.clear?.();

    setFailedById((prev) => {
      if (!prev[clientId]) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });

    void sendDmMessage(db, targetThreadId, myId, targetPeerId, value, clientId)
      .catch(() => {
        if (!mountedRef.current || activeThreadRef.current !== targetThreadId) return;
        setFailedById((prev) => ({ ...prev, [clientId]: true }));
      })
      .finally(() => {
        if (mountedRef.current && activeThreadRef.current === targetThreadId) {
          setSending(false);
        }
        sendResetTimeoutRef.current = setTimeout(() => {
          if (activeThreadRef.current === targetThreadId) {
            sendGuardRef.current = false;
          }
        }, 250);
      });
  }, [db, myId, peer.uid, threadId]);

  const retrySend = useCallback(
    (clientId: string) => {
      if (!db || !threadId || !myId) return;
      const target = msgs.find((message) => String(message.clientId || message.id) === clientId);
      if (!target?.text) return;

      setFailedById((prev) => {
        if (!prev[clientId]) return prev;
        const next = { ...prev };
        delete next[clientId];
        return next;
      });

      void sendDmMessage(db, threadId, target.from || myId, target.to || peer.uid, target.text, clientId).catch(
        () => {
          if (!mountedRef.current || activeThreadRef.current !== threadId) return;
          setFailedById((prev) => ({ ...prev, [clientId]: true }));
        }
      );
    },
    [db, msgs, myId, peer.uid, threadId]
  );

  const handleTextChange = useCallback((value: string) => {
    textRef.current = value;
    setText(value);
  }, []);

  const canSend = text.trim().length > 0;
  const sourceTitle = thread?.source === "play" ? tt("dm.sourcePlay", "You opened after drawing together") : "";
  const strokeCount = thread?.artworkSummary?.strokeCount;
  const isLoading = threadLoading || messagesLoading;
  const isEmpty = !isLoading && mergedMsgs.length === 0;
  const screenTitleName = peer.name || routePeerName || "";
  const screenTitle = screenTitleName ? t("dm.title", { name: screenTitleName }) : tt("dm.genericTitle", "Chat");
  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (backTarget === "history") {
      navigation.navigate("PlayHistory");
      return;
    }
    if (backTarget === "connections") {
      navigation.navigate("Tabs", { screen: "Connections" });
      return;
    }
    if (backTarget === "inbox") {
      navigation.navigate("Tabs", { screen: "Inbox" });
      return;
    }
    if (backTarget === "sessionDetail" && backSessionId) {
      navigation.navigate("PlaySessionDetail", { sessionId: backSessionId });
      return;
    }
    navigation.navigate("Tabs", { screen: "Together" });
  }, [backSessionId, backTarget, navigation]);

  const renderSourceCard = useCallback(
    () =>
      sourceTitle ? (
        <View style={styles.sourceCard}>
          <Text style={styles.sourceTitle}>{sourceTitle}</Text>
          <Text style={styles.sourceMeta}>
            {strokeCount != null
              ? tt("dm.sourceStrokeCount", "Strokes: {count}", { count: String(strokeCount) })
              : tt("dm.contextReady", "The connection context is already saved.")}
          </Text>
          {thread?.sourceSessionId ? (
            <TouchableOpacity
              onPress={() => navigation.navigate("PlaySessionDetail", { sessionId: thread.sourceSessionId })}
              style={styles.sourceLink}
              activeOpacity={0.85}
            >
              <Text style={styles.sourceLinkText}>Открыть совместную историю</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null,
    [navigation, sourceTitle, strokeCount, thread?.sourceSessionId, tt]
  );

  const renderItem = useCallback(
    ({ item }: { item: RenderMessage }) => {
      const failed = item.failed === true;
      const pending = !failed && item.pending === true;
      const isOwn = item.from === myId;

      return (
        <TouchableOpacity
          activeOpacity={failed ? 0.85 : 1}
          disabled={!failed}
          onPress={() => retrySend(String(item.clientId || item.id))}
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

  if (!threadId) {
    return (
      <ScreenShell title={screenTitle} background="nightCity" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>{tt("dm.unavailableTitle", "Chat unavailable")}</Text>
          <Text style={styles.emptyText}>
            {tt("dm.unavailableBody", "We couldn't open the conversation without a valid thread identifier.")}
          </Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={screenTitle} background="nightCity" showBack onBack={handleBack}>
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.emptyText}>{tt("dm.loading", "Подключаем чат…")}</Text>
        </View>
      ) : subscriptionError ? (
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>{tt("dm.errorTitle", "The chat is temporarily unavailable")}</Text>
          <Text style={styles.emptyText}>{subscriptionError}</Text>
          <TouchableOpacity onPress={() => setReloadKey((prev) => prev + 1)} style={styles.retryButton}>
            <Text style={styles.retryText}>{tt("common.retry", "Retry")}</Text>
          </TouchableOpacity>
        </View>
      ) : isEmpty ? (
        <View style={styles.centerState}>
          {renderSourceCard()}
          <Text style={styles.emptyTitle}>{tt("dm.emptyTitle", "The connection is open")}</Text>
          <Text style={styles.emptyText}>
            {tt("dm.emptyBody", "There are no messages yet. Say hi first and continue the connection from here.")}
          </Text>
          <TouchableOpacity onPress={handleBack} style={styles.retryButton}>
            <Text style={styles.retryText}>
              {backTarget === "history"
                ? "Вернуться к истории"
                : backTarget === "sessionDetail"
                  ? "Вернуться к истории сессии"
                : backTarget === "connections"
                  ? "Вернуться в связи"
                  : "Вернуться назад"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          key={threadId}
          inverted
          data={mergedMsgs}
          keyExtractor={(item) => String(item.clientId || item.id)}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={16}
          maxToRenderPerBatch={20}
          windowSize={10}
          removeClippedSubviews
          ListFooterComponent={renderSourceCard()}
        />
      )}

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
            onPress={send}
            disabled={!canSend || sending}
            style={[styles.sendBtn, !canSend || sending ? styles.sendBtnDisabled : null]}
          >
            <Text style={styles.sendTxt}>{t("common.send")}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardStickyView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  listContent: {
    padding: 16,
    gap: 8,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 12,
  },
  sourceCard: {
    alignSelf: "center",
    borderRadius: theme.shapes.cardInner,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
    backgroundColor: "rgba(17, 20, 36, 0.74)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  sourceTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
    textAlign: "center",
  },
  sourceMeta: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "600",
    textAlign: "center",
  },
  sourceLink: {
    alignSelf: "center",
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  sourceLinkText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  emptyTitle: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: "800",
    textAlign: "center",
  },
  emptyText: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  msgWrap: {
    width: "100%",
    marginBottom: 8,
  },
  msgWrapOwn: {
    alignItems: "flex-end",
  },
  msgWrapPeer: {
    alignItems: "flex-start",
  },
  msg: {
    maxWidth: "82%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
  },
  msgOwn: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  msgPeer: {
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#E5E7EB",
  },
  msgText: {
    fontSize: 15,
    lineHeight: 20,
  },
  msgTextOwn: {
    color: "#FFFFFF",
  },
  msgTextPeer: {
    color: "#111827",
  },
  msgPending: {
    opacity: 0.7,
  },
  msgFailed: {
    borderColor: "#fca5a5",
    backgroundColor: "#fff5f5",
  },
  msgStatus: {
    marginTop: 4,
    fontSize: 11,
    color: "#6b7280",
  },
  msgFailedText: {
    color: "#dc2626",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: "rgba(255,255,255,0.96)",
    color: "#111827",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  sendBtn: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    minHeight: 48,
    justifyContent: "center",
    borderRadius: 14,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendTxt: {
    color: "#fff",
    fontWeight: "800",
  },
  retryButton: {
    marginTop: 6,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: theme.shapes.pill,
  },
  retryText: {
    color: "#fff",
    fontWeight: "800",
  },
});
