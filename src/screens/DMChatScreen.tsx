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
import { nearbyAnnouncementsRepository } from "@/services/nearbyAnnouncements";
import { getNowPostById } from "@/services/now";
import {
  getPlayColorMoodCombinedPalette,
  getPlaySessionById,
  getPlaySessionPrompt,
} from "@/services/playSessions";
import {
  blockUser,
  createReport,
  getBlockedUserIds,
  type SafetyReportReason,
} from "@/services/safety";
import { getUserProfileById } from "@/services/user";
import { theme } from "@/theme";
import {
  isFirestoreMissingIndexError,
  logFirestoreMissingIndexError,
} from "@/utils/firestoreErrors";

type RenderMessage = DmMessageDoc & { failed?: boolean };

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
  const [blockedUserIds, setBlockedUserIds] = useState<string[]>([]);
  const [safetyBusy, setSafetyBusy] = useState(false);
  const [peerAvatarUrl, setPeerAvatarUrl] = useState("");
  const [peerProfileName, setPeerProfileName] = useState("");
  const [sourceDetailText, setSourceDetailText] = useState("");

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
    let alive = true;
    if (!db || !myId) {
      setBlockedUserIds([]);
      return () => {
        alive = false;
      };
    }

    void getBlockedUserIds(myId)
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
      (error) => {
        if (!mountedRef.current || activeThreadRef.current !== threadId) return;
        if (isFirestoreMissingIndexError(error)) {
          logFirestoreMissingIndexError("DMChat dmThreads", error);
          setSubscriptionError(
            tt(
              "common.serviceSetupError",
              "Сервис временно настраивается. Попробуйте позже."
            )
          );
          setThreadLoading(false);
          return;
        }

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
      (error) => {
        if (!mountedRef.current || activeThreadRef.current !== threadId) return;
        if (isFirestoreMissingIndexError(error)) {
          logFirestoreMissingIndexError("DMChat messages", error);
          setSubscriptionError(
            tt(
              "common.serviceSetupError",
              "Сервис временно настраивается. Попробуйте позже."
            )
          );
          setMessagesLoading(false);
          return;
        }

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

  const amoriaUserLabel = tt("profile.amoriaUser", "Пользователь Amoria");
  const peer = useMemo(() => {
    if (!thread) {
      return {
        uid: peerId,
        name: routePeerName || amoriaUserLabel,
      };
    }
    return mapDmThreadToPeer(thread, myId) ?? {
      uid: peerId,
      name: routePeerName || amoriaUserLabel,
    };
  }, [amoriaUserLabel, myId, peerId, routePeerName, thread]);
  const peerBlocked = useMemo(
    () => Boolean(peer.uid && blockedUserIds.includes(peer.uid)),
    [blockedUserIds, peer.uid]
  );
  useEffect(() => {
    let alive = true;
    if (!peer.uid) {
      setPeerAvatarUrl("");
      setPeerProfileName("");
      return () => {
        alive = false;
      };
    }

    void getUserProfileById(peer.uid)
      .then((profile) => {
        if (!alive) return;
        setPeerAvatarUrl(profile?.avatarUrl ?? "");
        setPeerProfileName(profile?.displayName?.trim() ?? "");
      })
      .catch(() => {
        if (!alive) return;
        setPeerAvatarUrl("");
        setPeerProfileName("");
      });

    return () => {
      alive = false;
    };
  }, [peer.uid]);
  const sourceContext = useMemo(() => {
    if (
      routeSourceContext?.source === "play" ||
      routeSourceContext?.source === "announcement" ||
      routeSourceContext?.source === "nearby"
    ) {
      return routeSourceContext;
    }
    if (
      thread?.source === "play" ||
      thread?.source === "announcement" ||
      thread?.source === "nearby"
    ) {
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

  useEffect(() => {
    let alive = true;
    if (!db || !sourceContext?.source || !sourceSessionId) {
      setSourceDetailText("");
      return () => {
        alive = false;
      };
    }

    async function loadSourceDetail() {
      try {
        if (!db) return "";

        if (sourceContext.source === "play") {
          const session = await getPlaySessionById(db, sourceSessionId);
          if (!session) return "";

          const prompt = getPlaySessionPrompt(session)?.text?.trim() ?? "";
          if (prompt) return prompt;

          if (session.activity === "color_mood") {
            const paletteSize = getPlayColorMoodCombinedPalette(session).length;
            if (paletteSize > 0) {
              return tt("dm.sourceColorMoodPaletteContext", "Mood palette: {count} colors", {
                count: String(paletteSize),
              });
            }
          }
        }

        if (sourceContext.source === "announcement") {
          const announcement = await nearbyAnnouncementsRepository.getAnnouncementById(
            sourceSessionId
          );
          return announcement?.title?.trim() ?? "";
        }

        if (sourceContext.source === "nearby") {
          const post = await getNowPostById(db, sourceSessionId);
          return post?.text?.trim() ?? "";
        }
      } catch {
        return "";
      }

      return "";
    }

    void loadSourceDetail().then((value) => {
      if (!alive) return;
      setSourceDetailText(value);
    });

    return () => {
      alive = false;
    };
  }, [sourceContext?.source, sourceSessionId, tt]);

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
    if (!value || !db || !threadId || !myId || !peer.uid || peerBlocked) return;
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
  }, [db, myId, peer.uid, peerBlocked, threadId]);

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

  const canSend = text.trim().length > 0 && !peerBlocked;
  const canOpenSourceDetail = Boolean(
    sourceSessionId &&
      (sourceContext?.source === "play" || sourceContext?.source === "announcement")
  );
  const sourceActionLabel = useMemo(() => {
    if (sourceContext?.source === "play") {
      return tt("dm.openSourceStory", "Открыть общую историю");
    }
    if (sourceContext?.source === "announcement") {
      return tt("dm.openSourceAnnouncement", "Открыть объявление");
    }
    return "";
  }, [sourceContext?.source, tt]);
  const openSourceDetail = useCallback(() => {
    if (!sourceSessionId) return;
    if (sourceContext?.source === "play") {
      navigation.navigate("PlaySessionDetail", { sessionId: sourceSessionId });
      return;
    }
    if (sourceContext?.source === "announcement") {
      navigation.navigate("AnnouncementDetail", { announcementId: sourceSessionId });
    }
  }, [navigation, sourceContext?.source, sourceSessionId]);
  const sourceEyebrow = useMemo(
    () => {
      if (sourceContext?.source === "play") {
        return tt("dm.sourceEyebrow", "Общая история этого разговора");
      }
      if (sourceContext?.source === "announcement") {
        return tt("dm.sourceAnnouncementEyebrow", "Контекст объявления");
      }
      if (sourceContext?.source === "nearby") {
        return tt("dm.sourceNearbyEyebrow", "Контекст Рядом");
      }
      return "";
    },
    [sourceContext?.source, tt]
  );
  const sourceTitle = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt("dm.sourceAnnouncement", "Вы начали разговор после объявления");
    }
    if (sourceContext?.source === "nearby") {
      return tt("dm.sourceNearby", "Вы начали разговор из Рядом");
    }
    if (sourceContext?.source !== "play") return "";
    if (sourceActivity === "color_mood") {
      return tt("dm.sourcePlayColorMood", "Вы начали разговор после палитры настроения");
    }
    return tt("dm.sourcePlay", "Вы начали разговор после общего рисунка");
  }, [sourceActivity, sourceContext?.source, tt]);
  const headerSourceLabel = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      return tt("inbox.sourceAnnouncement", "После объявления");
    }
    if (sourceContext?.source === "nearby") {
      return tt("inbox.sourceNearby", "Из Рядом");
    }
    if (sourceContext?.source !== "play") return "";
    if (sourceActivity === "color_mood") {
      return tt("inbox.sourcePlayColorMood", "После палитры настроения");
    }
    return tt("inbox.sourcePlay", "После общего рисунка");
  }, [sourceActivity, sourceContext?.source, tt]);
  const sourceMeta = useMemo(() => {
    if (sourceContext?.source === "announcement") {
      if (sourceDetailText) {
        return tt(
          "dm.sourceAnnouncementBodyWithTitle",
          "This chat opened from the announcement “{title}”. The personal reply continues here in Chats.",
          { title: sourceDetailText }
        );
      }
      return tt(
        "dm.sourceAnnouncementBody",
        "Этот чат открыт из объявления. Личный ответ продолжается здесь, в Чатах."
      );
    }
    if (sourceContext?.source === "nearby") {
      if (sourceDetailText) {
        return tt(
          "dm.sourceNearbyBodyWithText",
          "This chat opened from the nearby status “{text}”. The chat continues here in Chats.",
          { text: sourceDetailText }
        );
      }
      return tt(
        "dm.sourceNearbyBody",
        "Этот чат открыт из Рядом. Переписка продолжается здесь, в Чатах."
      );
    }
    if (sourceContext?.source !== "play") return "";
    if (sourceActivity === "color_mood") {
      if (sourceDetailText) {
        return tt(
          "dm.sourceColorMoodDetail",
          "The shared palette is saved as context: {context}. The chat continues here.",
          { context: sourceDetailText }
        );
      }
      return tt(
        "dm.sourcePaletteReady",
        "Общая палитра уже сохранена в истории этого разговора. Она остаётся в общем контексте, а здесь начинается ваше личное продолжение."
      );
    }
    if (sourceDetailText) {
      return tt(
        "dm.sourcePlayBodyWithPrompt",
        "You started this conversation after the shared drawing challenge “{prompt}”. The shared story stays linked while the chat continues here.",
        { prompt: sourceDetailText }
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
      "Общий момент уже сохранён в истории этого чата. К нему можно вернуться в любой момент, а переписка продолжается здесь."
    );
  }, [
    sourceActivity,
    sourceContext?.source,
    sourceDetailText,
    sourceStrokeCount,
    tt,
  ]);
  const isLoading = threadLoading || messagesLoading;
  const threadMissing = !isLoading && !subscriptionError && !thread && mergedMsgs.length === 0;
  const isEmpty = !isLoading && mergedMsgs.length === 0;
  const canShowComposer =
    Boolean(db && myId && threadId && peer.uid) &&
    !peerBlocked &&
    !subscriptionError &&
    !threadMissing;
  const screenTitleName =
    peer.name === "profile.amoriaUser" ? routePeerName || "" : peer.name || routePeerName || "";
  const peerDisplayName = peerProfileName || screenTitleName || amoriaUserLabel;
  const screenTitle = screenTitleName
    ? t("dm.title", { name: peerDisplayName })
    : tt("dm.genericTitle", "Разговор");
  const openPeerProfile = useCallback(() => {
    if (!peer.uid) return;
    navigation.navigate("UserProfile", {
      userId: peer.uid,
      peerName: peerDisplayName,
      ...(threadId ? { threadId } : {}),
      ...(sourceContext ? { sourceContext } : {}),
    });
  }, [navigation, peer.uid, peerDisplayName, sourceContext, threadId]);
  const chatHeader = peer.uid ? (
    <TouchableOpacity
      onPress={openPeerProfile}
      style={styles.chatHeader}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={tt("dm.openPeerProfile", "Профиль собеседника")}
    >
      <UserAvatar avatarUrl={peerAvatarUrl} label={peerDisplayName} size={34} />
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
  const missingChatBody = useMemo(() => {
    if (backTarget === "sessionDetail" || backTarget === "history") {
      return tt(
        "dm.notFoundFromStoryBody",
        "Для этой общей истории чат пока не загрузился. Попробуй ещё раз чуть позже или спокойно вернись к самой истории."
      );
    }
    if (backTarget === "inbox") {
      return tt(
        "dm.notFoundFromInboxBody",
        "Этот чат пока не открылся из списка. Вернись к «Чатам» или попробуй открыть его чуть позже."
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

  const reportChat = useCallback(
    async (reason: SafetyReportReason) => {
      if (!threadId || !peer.uid || safetyBusy) return;

      setSafetyBusy(true);
      try {
        await createReport({
          targetType: "dmThread",
          targetId: threadId,
          targetOwnerUid: peer.uid,
          reason,
        });
        Alert.alert(
          tt("safety.reportSentTitle", "Жалоба отправлена"),
          tt("safety.reportSentBody", "Спасибо. Жалоба сохранена и будет доступна для проверки.")
        );
      } catch {
        Alert.alert(
          tt("safety.reportErrorTitle", "Жалоба не отправилась"),
          tt(
            "safety.reportErrorBody",
            "Не удалось сохранить жалобу в Firestore. Попробуй ещё раз позже."
          )
        );
      } finally {
        setSafetyBusy(false);
      }
    },
    [peer.uid, safetyBusy, threadId, tt]
  );

  const handleReportChat = useCallback(() => {
    Alert.alert(
      tt("safety.reportTitle", "Пожаловаться"),
      tt("safety.reportBody", "Выбери причину жалобы."),
      buildReportReasonButtons(tt, (reason) => void reportChat(reason))
    );
  }, [reportChat, tt]);

  const handleBlockPeer = useCallback(() => {
    if (!peer.uid || peer.uid === myId) return;
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
            void blockUser(peer.uid, "dm")
              .then(() => {
                setBlockedUserIds((current) =>
                  current.includes(peer.uid) ? current : [...current, peer.uid]
                );
                Alert.alert(
                  tt("safety.userBlockedTitle", "Пользователь заблокирован"),
                  tt(
                    "safety.userBlockedBody",
                    "Этот пользователь скрыт из релизных списков на вашем аккаунте."
                  )
                );
              })
              .catch(() => {
                Alert.alert(
                  tt("safety.blockErrorTitle", "Не удалось заблокировать"),
                  tt(
                    "safety.blockErrorBody",
                    "Блокировка не сохранилась в Firestore. Попробуй ещё раз позже."
                  )
                );
              })
              .finally(() => setSafetyBusy(false));
          },
        },
      ]
    );
  }, [myId, peer.uid, tt]);

  const renderSourceCard = useCallback(
    () =>
      sourceTitle ? (
        <View style={styles.sourceCard}>
          {sourceEyebrow ? (
            <Text style={styles.sourceEyebrow}>{sourceEyebrow}</Text>
          ) : null}
          <Text style={styles.sourceTitle}>{sourceTitle}</Text>
          <Text style={styles.sourceMeta}>{sourceMeta}</Text>
          {canOpenSourceDetail && sourceActionLabel ? (
            <TouchableOpacity
              onPress={openSourceDetail}
              style={styles.sourceLink}
              activeOpacity={0.85}
            >
              <Text style={styles.sourceLinkText}>
                {sourceActionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null,
    [
      canOpenSourceDetail,
      openSourceDetail,
      sourceActionLabel,
      sourceEyebrow,
      sourceMeta,
      sourceTitle,
    ]
  );

  const renderPeerCard = useCallback(
    () =>
      peer.uid ? (
        <TouchableOpacity
          onPress={openPeerProfile}
          style={styles.peerCard}
          activeOpacity={0.85}
        >
          <UserAvatar avatarUrl={peerAvatarUrl} label={peerDisplayName} size={42} />
          <View style={styles.peerCopy}>
            <Text style={styles.peerName}>{peerDisplayName}</Text>
            <Text style={styles.peerMeta}>
              {tt("dm.openPeerProfile", "Профиль собеседника")}
            </Text>
          </View>
          <Text style={styles.peerActionText}>{tt("menu.profile", "Профиль")}</Text>
        </TouchableOpacity>
      ) : null,
    [openPeerProfile, peer.uid, peerAvatarUrl, peerDisplayName, tt]
  );

  const renderSafetyCard = useCallback(
    () =>
      peer.uid ? (
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
                  "Можно пожаловаться на разговор или заблокировать пользователя. Действие сохранится в Firestore."
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
            {!peerBlocked && peer.uid !== myId ? (
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
      peer.uid,
      peerBlocked,
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
            body={tt("dm.authRequiredBody", "Войди в аккаунт, чтобы открыть чат и продолжить уже открытую связь.")}
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
      <ScreenShell
        title={screenTitle}
        headerCenter={chatHeader}
        background="togetherChat"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt("dm.errorTitle", "Разговор временно недоступен")}
            body={tt("dm.offlineBody", "Мы не смогли подключить этот чат прямо сейчас. Попробуй позже или вернись назад.")}
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
    <ScreenShell
      title={screenTitle}
      headerCenter={chatHeader}
      background="togetherChat"
      showBack
      onBack={handleBack}
    >
      {isLoading ? (
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="chatbubble-ellipses-outline"
            title={screenTitle}
            body={tt("dm.loading", "Подключаем чат…")}
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
                : sourceTitle
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
                canOpenSourceDetail && backTarget !== "sessionDetail"
                  ? sourceActionLabel
                  : emptyBackLabel,
              onPress:
                canOpenSourceDetail && backTarget !== "sessionDetail"
                  ? openSourceDetail
                  : handleBack,
            }}
            secondaryAction={
              canOpenSourceDetail && backTarget !== "sessionDetail"
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
