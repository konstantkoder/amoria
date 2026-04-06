import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useRoute } from "@react-navigation/native";
import { auth, db } from "@/config/firebaseConfig";
import { theme } from "@/theme";
import ScreenShell from "@/components/ScreenShell";
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

export default function DMChatScreen() {
  const { t } = useLocale();
  const route = useRoute<any>();
  const myId = auth?.currentUser?.uid ?? "";
  const routePeerId = String(route.params?.peerId ?? "");
  const threadId = String(
    route.params?.threadId ?? (myId && routePeerId ? buildDmThreadId(myId, routePeerId) : "")
  );
  const routePeerName = String(route.params?.peerName ?? t("common.user"));
  const peerId = routePeerId || "";

  const [text, setText] = useState("");
  const textRef = useRef("");
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlatList<DmMessageDoc & { failed?: boolean }>>(null);
  const sendGuardRef = useRef(false);
  const mountedRef = useRef(true);
  const activeThreadRef = useRef(threadId);
  const [sending, setSending] = useState(false);

  const [thread, setThread] = useState<DmThreadDoc | null>(null);
  const [msgs, setMsgs] = useState<DmMessageDoc[]>([]);
  const [failedById, setFailedById] = useState<Record<string, true>>({});
  const [threadLoading, setThreadLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
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
    textRef.current = "";
    setText("");
    inputRef.current?.setNativeProps?.({ text: "" });
    inputRef.current?.clear?.();
    inputRef.current?.blur?.();
    Keyboard.dismiss();
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false });
  }, [myId, threadId]);

  useEffect(() => {
    if (!db || !myId || !threadId) {
      setThread(null);
      setThreadLoading(false);
      return;
    }

    setThreadLoading(true);
    const unsubscribe = subscribeDmThreads(db, myId, (threads) => {
      if (!mountedRef.current || activeThreadRef.current !== threadId) return;
      setThread(threads.find((item) => item.id === threadId) ?? null);
      setThreadLoading(false);
    });

    return unsubscribe;
  }, [myId, threadId]);

  useEffect(() => {
    if (!db || !threadId) {
      setMsgs([]);
      setMessagesLoading(false);
      return;
    }

    setMessagesLoading(true);
    return subscribeDmMessages(db, threadId, (next) => {
      if (!mountedRef.current || activeThreadRef.current !== threadId) return;
      setMsgs(next);
      setMessagesLoading(false);
    });
  }, [threadId]);

  useEffect(() => {
    if (!msgs.length) return;
    setFailedById((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const m of msgs) {
        if (next[m.id] && !m.pending) {
          delete next[m.id];
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
        name: routePeerName,
      };
    }
    return mapDmThreadToPeer(thread, myId) ?? { uid: peerId, name: routePeerName };
  }, [myId, peerId, routePeerName, thread]);

  const mergedMsgs = useMemo(() => {
    const map = new Map<string, DmMessageDoc & { failed?: boolean }>();
    for (const m of msgs) {
      const id = String(m.id);
      map.set(id, {
        ...m,
        failed: Boolean(failedById[id]),
      });
    }
    const deduped = Array.from(map.values());
    deduped.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    return deduped;
  }, [msgs, failedById]);

  const send = useCallback(() => {
    const value = (textRef.current || "").trim();
    if (!value || !db || !threadId || !myId || !peer.uid) return;
    if (sendGuardRef.current) return;
    const targetThreadId = threadId;
    const targetPeerId = peer.uid;
    sendGuardRef.current = true;

    if (mountedRef.current) {
      setSending(true);
    }

    textRef.current = "";
    setText("");
    inputRef.current?.setNativeProps?.({ text: "" });
    inputRef.current?.clear?.();
    inputRef.current?.blur?.();
    Keyboard.dismiss();

    const clientId = `m_${myId}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setFailedById((prev) => {
      if (!prev[clientId]) return prev;
      const next = { ...prev };
      delete next[clientId];
      return next;
    });

    void sendDmMessage(db, targetThreadId, myId, targetPeerId, value, clientId)
      .then(() => {
        if (!mountedRef.current || activeThreadRef.current !== targetThreadId) return;
        setFailedById((prev) => {
          if (!prev[clientId]) return prev;
          const next = { ...prev };
          delete next[clientId];
          return next;
        });
      })
      .catch(() => {
        if (!mountedRef.current || activeThreadRef.current !== targetThreadId) return;
        setFailedById((prev) => ({ ...prev, [clientId]: true }));
      })
      .finally(() => {
        if (mountedRef.current && activeThreadRef.current === targetThreadId) {
          setSending(false);
        }
        setTimeout(() => {
          if (activeThreadRef.current === targetThreadId) {
            sendGuardRef.current = false;
          }
        }, 250);
      });
  }, [db, myId, peer.uid, threadId]);

  const retrySend = useCallback(
    (clientId: string) => {
      if (!db || !threadId || !myId) return;
      const target = msgs.find((m) => String(m.id) === clientId);
      if (!target?.text) return;
      const targetThreadId = threadId;

      setFailedById((prev) => {
        if (!prev[clientId]) return prev;
        const next = { ...prev };
        delete next[clientId];
        return next;
      });

      void sendDmMessage(
        db,
        targetThreadId,
        target.from || myId,
        target.to || peer.uid,
        target.text,
        clientId
      ).catch(() => {
        if (!mountedRef.current || activeThreadRef.current !== targetThreadId) return;
        setFailedById((prev) => ({ ...prev, [clientId]: true }));
      });
    },
    [db, msgs, myId, peer.uid, threadId]
  );

  const handleTextChange = useCallback((v: string) => {
    textRef.current = v;
    setText(v);
  }, []);

  const canSend = text.trim().length > 0;
  const sourceTitle =
    thread?.source === "play" ? "Вы познакомились через Нарисовать вместе" : "";
  const strokeCount = thread?.artworkSummary?.strokeCount;
  const isLoading = threadLoading || messagesLoading;
  const isEmpty = !isLoading && mergedMsgs.length === 0;

  const renderItem = useCallback(
    ({ item }: { item: DmMessageDoc & { failed?: boolean } }) => {
      const failed = item.failed === true;
      const pending = !failed && item.pending === true;
      const isOwn = item.from === myId;

      return (
        <TouchableOpacity
          activeOpacity={failed ? 0.85 : 1}
          disabled={!failed}
          onPress={() => retrySend(item.id)}
          style={[
            styles.msgWrap,
            isOwn ? styles.msgWrapOwn : styles.msgWrapPeer,
          ]}
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
              <Text style={[styles.msgStatus, styles.msgFailedText]}>
                {t("common.failed")}
              </Text>
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
      <ScreenShell title={t("dm.title", { name: routePeerName })} background="nightCity" showBack>
        <View style={styles.centerState}>
          <Text style={styles.emptyTitle}>Чат недоступен</Text>
          <Text style={styles.emptyText}>
            Не удалось открыть чат без актуального идентификатора диалога.
          </Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={t("dm.title", { name: peer.name })}
      background="nightCity"
      showBack
    >
      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={theme.colors.accent} />
          <Text style={styles.emptyText}>Подключаем диалог…</Text>
        </View>
      ) : isEmpty ? (
        <View style={styles.centerState}>
          {sourceTitle ? (
            <View style={styles.sourceCard}>
              <Text style={styles.sourceTitle}>{sourceTitle}</Text>
              {strokeCount != null ? (
                <Text style={styles.sourceMeta}>Штрихов: {strokeCount}</Text>
              ) : null}
            </View>
          ) : null}
          <Text style={styles.emptyTitle}>Диалог открыт</Text>
          <Text style={styles.emptyText}>
            Здесь пока нет сообщений. Можно написать первым и продолжить контакт.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          key={threadId}
          inverted
          data={mergedMsgs}
          keyExtractor={(item) => String(item.id)}
          style={{ flex: 1 }}
          contentContainerStyle={styles.listContent}
          renderItem={renderItem}
          ListFooterComponent={
            sourceTitle ? (
              <View style={styles.sourceCard}>
                <Text style={styles.sourceTitle}>{sourceTitle}</Text>
                {strokeCount != null ? (
                  <Text style={styles.sourceMeta}>Штрихов: {strokeCount}</Text>
                ) : null}
              </View>
            ) : null
          }
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
          />
          <TouchableOpacity
            onPress={send}
            disabled={!canSend || sending}
            style={[
              styles.sendBtn,
              !canSend || sending ? styles.sendBtnDisabled : null,
            ]}
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
    borderRadius: theme.shapes.cardInner,
    padding: 14,
    marginBottom: 10,
    backgroundColor: "rgba(17, 20, 36, 0.86)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  sourceTitle: {
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4,
  },
  sourceMeta: {
    color: theme.colors.subtext,
    fontSize: 12,
    fontWeight: "600",
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
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 10,
    gap: 8,
  },
  input: {
    flex: 1,
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
});
