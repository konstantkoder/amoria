import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { auth, db } from "@/config/firebaseConfig";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type DmChatRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import { markDmThreadSeen } from "@/services/activityFreshness";
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
  const navigation = useNavigation<RootStackNavigationProp<"DMChat">>();
  const { t } = useLocale();
  const tt = useCallback(
    (key: string, fallback: string, params?: Record<string, string>) => {
      const value = t(key, params);
      return value === key ? fallback : value;
    },
    [t]
  );
  const route = useRoute<DmChatRouteProp>();
  const myId = auth?.currentUser?.uid ?? "";
  const routePeerId = String(route.params?.peerId ?? "");
  const threadId = String(
    route.params?.threadId ?? (myId && routePeerId ? buildDmThreadId(myId, routePeerId) : "")
  );
  const routePeerName = String(route.params?.peerName ?? "").trim();
  const peerId = routePeerId || "";
  const backTarget = route.params?.backTarget;
  const backSessionId = String(route.params?.backSessionId ?? "");
  const routeSourceContext = route.params?.sourceContext;

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
    if (sendResetTimeoutRef.current) {
      clearTimeout(sendResetTimeoutRef.current);
      sendResetTimeoutRef.current = null;
    }
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
    if (!threadId) return;
    if (threadLoading && !msgs.length) return;
    if (!thread && !msgs.length) return;
    void markDmThreadSeen(threadId);
  }, [msgs.length, thread, threadId, threadLoading]);

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
        setSubscriptionError(
          tt(
            "dm.errorBody",
            "Не удалось подключить этот разговор прямо сейчас. Попробуй ещё раз."
          )
        );
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
        setSubscriptionError(
          tt(
            "dm.errorBody",
            "Не удалось подключить этот разговор прямо сейчас. Попробуй ещё раз."
          )
        );
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
  const sourceContext = useMemo(() => {
    if (routeSourceContext?.source === "play" || routeSourceContext?.source === "announcement") {
      return routeSourceContext;
    }
    if (thread?.source === "play" || thread?.source === "announcement") {
      return {
        source: thread.source,
        ...(thread.sourceSessionId ? { sourceSessionId: thread.sourceSessionId } : {}),
        ...(thread.artworkSummary ? { artworkSummary: thread.artworkSummary } : {}),
      };
    }
    return null;
  }, [routeSourceContext, thread?.artworkSummary, thread?.source, thread?.sourceSessionId]);
  const sourceSessionId = String(sourceContext?.sourceSessionId ?? "");
  const sourceActivity = sourceContext?.artworkSummary?.activity;
  const sourceStrokeCount = sourceContext?.artworkSummary?.strokeCount;
  const storySessionId =
    backTarget === "sessionDetail"
      ? String(backSessionId || sourceSessionId || "")
      : "";

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
  const openSourceStory = useCallback(() => {
    if (!sourceSessionId) return;
    navigation.navigate("PlaySessionDetail", { sessionId: sourceSessionId });
  }, [navigation, sourceSessionId]);
  const sourceEyebrow = useMemo(
    () => {
      if (sourceContext?.source === "play") {
        return tt("dm.sourceEyebrow", "Общая история этого разговора");
      }
      if (sourceContext?.source === "announcement") {
        return tt("dm.sourceAnnouncementEyebrow", "Контекст объявления");
      }
      return "";
    },
    [sourceContext?.source, tt]
  );
  const sourceTitle = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt("dm.sourceAnnouncement", "Личный разговор после объявления");
    }
    if (sourceContext?.source !== "play") return "";
    if (sourceActivity === "color_mood") {
      return tt("dm.sourcePlayColorMood", "Ваш личный разговор после общей палитры");
    }
    if (sourceActivity === "daily_prompt") {
      return tt("dm.sourcePlayDailyPrompt", "Ваш личный разговор после общей темы дня");
    }
    if (sourceActivity === "chain_draw") {
      return tt("dm.sourcePlayChainDraw", "Ваш личный разговор после рисунка по очереди");
    }
    return tt("dm.sourcePlay", "Ваш личный разговор после совместной сессии");
  }, [sourceActivity, sourceContext?.source, tt]);
  const sourceMeta = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt(
        "dm.sourceAnnouncementBody",
        "Этот чат открыт из объявления. Здесь продолжается личный ответ автору без отдельного раздела связи."
      );
    }
    if (sourceContext?.source !== "play") return "";
    if (sourceActivity === "color_mood") {
      return tt(
        "dm.sourcePaletteReady",
        "Общая палитра уже сохранена в истории этого разговора. Она остаётся в общем контексте, а здесь начинается ваше личное продолжение."
      );
    }
    if (sourceStrokeCount != null) {
      return tt(
        "dm.sourceStrokeCount",
        "Общий результат уже сохранён в истории этого разговора. Он остаётся вашим общим контекстом, а здесь разговор продолжается уже лично. Штрихов: {count}",
        { count: String(sourceStrokeCount) }
      );
    }
    return tt(
      "dm.contextReady",
      "Общий момент уже сохранён в истории этого разговора. К нему можно вернуться в любой момент, а здесь продолжается ваш личный разговор."
    );
  }, [sourceActivity, sourceContext?.source, sourceStrokeCount, tt]);
  const isLoading = threadLoading || messagesLoading;
  const threadMissing = !isLoading && !subscriptionError && !thread && mergedMsgs.length === 0;
  const isEmpty = !isLoading && mergedMsgs.length === 0;
  const canShowComposer = Boolean(db && myId && threadId && peer.uid) && !subscriptionError && !threadMissing;
  const screenTitleName = peer.name || routePeerName || "";
  const screenTitle = screenTitleName
    ? t("dm.title", { name: screenTitleName })
    : tt("dm.genericTitle", "Разговор");
  const missingChatBody = useMemo(() => {
    if (backTarget === "sessionDetail" || backTarget === "history") {
      return tt(
        "dm.notFoundFromStoryBody",
        "Для этой общей истории личный разговор пока не загрузился. Попробуй ещё раз чуть позже или спокойно вернись к самой истории."
      );
    }
    if (backTarget === "inbox") {
      return tt(
        "dm.notFoundFromInboxBody",
        "Этот личный разговор пока не открылся из списка. Вернись к диалогам или попробуй открыть его чуть позже."
      );
    }
    return tt(
      "dm.notFoundBody",
      "Мы не нашли этот разговор в текущем контексте. Возможно, старая ссылка уже устарела или он ещё не успел появиться."
    );
  }, [backTarget, tt]);
  const emptyBackLabel = useMemo(() => {
    if (backTarget === "history") {
      return tt("playDetail.goToHistory", "Вернуться к историям");
    }
    if (backTarget === "sessionDetail") {
      return tt("dm.backToSessionStory", "Вернуться к общей истории");
    }
    if (backTarget === "inbox") {
      return tt("dm.backToInbox", "Вернуться к чатам");
    }
    return tt("common.back", "Назад");
  }, [backTarget, tt]);
  const fallbackBack = useCallback(() => {
    if (backTarget === "history") {
      navigation.navigate("PlayHistory");
      return true;
    }
    if (backTarget === "inbox") {
      navigation.navigate("Tabs", { screen: "Inbox" });
      return true;
    }
    return false;
  }, [backTarget, navigation]);
  const handleBack = useCallback(() => {
    if (backTarget === "sessionDetail" && storySessionId) {
      const routes = navigation.getState().routes;
      const previousRoute = routes[routes.length - 2];
      if (previousRoute?.name === "PlaySessionDetail" && navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      navigation.replace("PlaySessionDetail", { sessionId: storySessionId });
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    if (fallbackBack()) {
      return;
    }
    navigation.navigate("Tabs", { screen: "Together" });
  }, [backTarget, fallbackBack, navigation, storySessionId]);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack])
  );

  const renderSourceCard = useCallback(
    () =>
      sourceTitle ? (
        <View style={styles.sourceCard}>
          {sourceEyebrow ? (
            <Text style={styles.sourceEyebrow}>{sourceEyebrow}</Text>
          ) : null}
          <Text style={styles.sourceTitle}>{sourceTitle}</Text>
          <Text style={styles.sourceMeta}>{sourceMeta}</Text>
          {sourceSessionId ? (
            <TouchableOpacity
              onPress={openSourceStory}
              style={styles.sourceLink}
              activeOpacity={0.85}
            >
              <Text style={styles.sourceLinkText}>
                {tt("dm.openSourceStory", "Открыть общую историю")}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null,
    [openSourceStory, sourceEyebrow, sourceMeta, sourceSessionId, sourceTitle, tt]
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
      <ScreenShell title={screenTitle} background="togetherChat" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title={tt("dm.unavailableTitle", "Разговор недоступен")}
            body={tt("dm.unavailableBody", "Не удалось открыть личный разговор без корректного идентификатора диалога.")}
            primaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
            secondaryAction={{
              label: tt("common.backToTogether", "Вернуться во Вместе"),
              onPress: () => navigation.navigate("Tabs", { screen: "Together" }),
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  if (!myId) {
    return (
      <ScreenShell title={screenTitle} background="togetherChat" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="person-circle-outline"
            title={tt("dm.authRequiredTitle", "Личный разговор доступен после входа")}
            body={tt("dm.authRequiredBody", "Войди в аккаунт, чтобы открыть личный разговор и продолжить уже открытую связь.")}
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

  if (!db) {
    return (
      <ScreenShell title={screenTitle} background="togetherChat" showBack onBack={handleBack}>
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("dm.errorTitle", "Разговор временно недоступен")}
            body={tt("dm.offlineBody", "Мы не смогли подключить этот личный разговор прямо сейчас. Попробуй позже или вернись назад.")}
            primaryAction={{ label: tt("common.back", "Назад"), onPress: handleBack }}
            secondaryAction={{
              label: tt("common.backToTogether", "Вернуться во Вместе"),
              onPress: () => navigation.navigate("Tabs", { screen: "Together" }),
            }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={screenTitle} background="togetherChat" showBack onBack={handleBack}>
      {isLoading ? (
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="chatbubble-ellipses-outline"
            title={screenTitle}
            body={tt("dm.loading", "Подключаем личный разговор…")}
          />
        </View>
      ) : subscriptionError ? (
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("dm.errorTitle", "Разговор временно недоступен")}
            body={subscriptionError}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: emptyBackLabel, onPress: handleBack }}
          />
        </View>
      ) : threadMissing ? (
        <View style={styles.centerState}>
          <CoreStateCard
            icon="chatbox-ellipses-outline"
            title={tt("dm.notReadyTitle", "Разговор пока не прикрепился")}
            body={missingChatBody}
            primaryAction={{ label: tt("common.retry", "Повторить"), onPress: () => setReloadKey((prev) => prev + 1) }}
            secondaryAction={{ label: emptyBackLabel, onPress: handleBack }}
          />
        </View>
      ) : isEmpty ? (
        <View style={styles.centerState}>
          {renderSourceCard()}
          <CoreStateCard
            icon="chatbubbles-outline"
            title={tt("dm.emptyTitle", "Личный разговор уже открыт")}
            body={
              sourceTitle
                ? tt(
                    "dm.emptyBodyWithSourceCoreLoop",
                    "Вы уже не с нуля: общий опыт сохранён в истории связи, а первый личный шаг можно сделать прямо ниже."
                  )
                : tt(
                    "dm.emptyBodyCoreLoop",
                    "Разговор уже открыт. Можно написать первым ниже и мягко задать тон этому личному продолжению."
                  )
            }
            primaryAction={{
              label:
                sourceSessionId && backTarget !== "sessionDetail"
                  ? tt("dm.openSourceStory", "Открыть общую историю")
                  : emptyBackLabel,
              onPress:
                sourceSessionId && backTarget !== "sessionDetail"
                  ? openSourceStory
                  : handleBack,
            }}
            secondaryAction={
              sourceSessionId && backTarget !== "sessionDetail"
                ? { label: emptyBackLabel, onPress: handleBack }
                : undefined
            }
          />
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
              onPress={send}
              disabled={!canSend || sending}
              style={[styles.sendBtn, !canSend || sending ? styles.sendBtnDisabled : null]}
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
  sourceLink: {
    alignSelf: "flex-start",
    marginTop: 12,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: theme.shapes.pill,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  sourceLinkText: {
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
