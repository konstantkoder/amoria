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
import { useNavigation, useRoute } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type NearbyRoomChatRouteProp,
  type RootStackNavigationProp,
} from "@/navigation/appRoutes";
import * as nearbyApi from "@/services/api/nearbyApi";
import { ApiError } from "@/services/api/apiClient";
import { reportClientError, sanitizeErrorForReport } from "@/services/api/clientErrorsApi";
import type { NearbyRoomMessage } from "@/services/api/types";
import { theme } from "@/theme";

type RenderRoomMessage = NearbyRoomMessage;

function tt(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  params?: Record<string, string>
) {
  return t(key, params);
}

function messageTime(value: string) {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function messageKey(message: Pick<NearbyRoomMessage, "clientMessageId" | "id">) {
  return String(message.clientMessageId || message.id);
}

function mergeMessages(
  current: RenderRoomMessage[],
  incoming: RenderRoomMessage[]
) {
  const byKey = new Map<string, RenderRoomMessage>();
  for (const message of current) {
    byKey.set(messageKey(message), message);
  }
  for (const message of incoming) {
    byKey.set(messageKey(message), message);
  }

  return Array.from(byKey.values()).sort(
    (left, right) => messageTime(right.createdAt) - messageTime(left.createdAt)
  );
}

function createClientMessageId(roomId: string) {
  return [
    "nearby-room",
    roomId,
    Date.now(),
    Math.random().toString(36).slice(2, 10),
  ].join(":");
}

function formatMessageTime(value: string, locale: string) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatSenderLabel(
  fromUserId: string,
  myId: string,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (fromUserId && fromUserId === myId) {
    return tt(t, "common.you");
  }

  const safeId = String(fromUserId ?? "").trim();
  const shortId = safeId ? safeId.slice(0, 8) : "";
  return tt(t, "nearby.rooms.sender", {
    id: shortId || "room",
  });
}

export default function NearbyRoomChatScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"NearbyRoomChat">>();
  const route = useRoute<NearbyRoomChatRouteProp>();
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const myId = String(user?.id ?? "").trim();
  const roomId = String(route.params?.roomId ?? "").trim();
  const title = String(route.params?.title ?? "").trim();
  const screenTitle = title || tt(t, "nearby.rooms.title");

  const mountedRef = useRef(true);
  const sendInFlightRef = useRef(false);
  const loadInFlightRef = useRef(false);
  const inputRef = useRef<TextInput>(null);
  const [messages, setMessages] = useState<RenderRoomMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadMessages = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (loadInFlightRef.current) return;
      if (!roomId) {
        setMessages([]);
        setLoading(false);
        setRefreshing(false);
        setErrorText("");
        return;
      }

      loadInFlightRef.current = true;
      if (mode === "refresh") {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setErrorText("");

      try {
        const response = await nearbyApi.listNearbyRoomMessages(roomId);
        if (!mountedRef.current) return;
        setMessages(mergeMessages([], response.items ?? []));
      } catch (error) {
        if (!mountedRef.current) return;
        const safe = sanitizeErrorForReport(error);
        void reportClientError({ screen: "NearbyRoomChat", action: "load", code: safe.code, message: safe.message, stack: safe.stack });
        setErrorText(tt(t, "nearby.rooms.loadFailed"));
      } finally {
        loadInFlightRef.current = false;
        if (!mountedRef.current) return;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [roomId, t]
  );

  useEffect(() => {
    void loadMessages("initial");
  }, [loadMessages]);

  const handleBack = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }
    navigation.navigate("Tabs", { screen: "Nearby" });
  }, [navigation]);

  const send = useCallback(async () => {
    const nextText = text.trim();
    if (!roomId || !myId || !nextText || sending || sendInFlightRef.current) return;

    sendInFlightRef.current = true;
    setSending(true);
    setErrorText("");
    try {
      const response = await nearbyApi.sendNearbyRoomMessage(
        roomId,
        nextText,
        createClientMessageId(roomId)
      );
      if (!mountedRef.current) return;
      setMessages((current) => mergeMessages(current, [response.message]));
      setText("");
      inputRef.current?.clear?.();
      Keyboard.dismiss();
    } catch (error) {
      if (!mountedRef.current) return;
      const safe = sanitizeErrorForReport(error);
      void reportClientError({ screen: "NearbyRoomChat", action: "send", code: safe.code, message: safe.message, stack: safe.stack });
      setErrorText(
        error instanceof ApiError && error.code === "message_rate_limited"
          ? tt(t, "chat.rateLimitedBody")
          : tt(t, "nearby.rooms.sendFailed")
      );
    } finally {
      sendInFlightRef.current = false;
      if (mountedRef.current) {
        setSending(false);
      }
    }
  }, [myId, roomId, sending, t, text]);

  const canShowComposer = Boolean(roomId && myId && !loading && !errorText);
  const canSend = Boolean(canShowComposer && text.trim() && !sending);
  const isEmpty = !loading && !errorText && messages.length === 0;

  const renderItem = useCallback(
    ({ item }: { item: RenderRoomMessage }) => {
      const own = Boolean(myId && item.fromUserId === myId);
      const moderationLabel = item.moderationState === "held"
        ? tt(t, "chat.messageHeld")
        : item.moderationState === "needs_review"
          ? tt(t, "chat.messageUnderReview")
          : item.moderationState === "restricted"
            ? tt(t, "chat.messageRestricted")
            : item.moderationState === "removed"
              ? tt(t, "chat.messageRemoved")
              : "";
      return (
        <View style={[styles.messageWrap, own ? styles.messageWrapOwn : null]}>
          <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
            <Text style={[styles.senderLabel, own ? styles.senderLabelOwn : null]}>
              {formatSenderLabel(item.fromUserId, myId, t)}
            </Text>
            <Text style={styles.messageText}>{item.text}</Text>
            <Text style={[styles.messageTime, own ? styles.messageTimeOwn : null]}>
              {formatMessageTime(item.createdAt, locale)}
            </Text>
            {moderationLabel ? (
              <Text style={[styles.messageTime, own ? styles.messageTimeOwn : null]}>
                {moderationLabel}
              </Text>
            ) : null}
          </View>
        </View>
      );
    },
    [myId, t]
  );

  const headerCenter = useMemo(
    () => (
      <View style={styles.headerCenter}>
        <Ionicons
          name="chatbubbles-outline"
          size={18}
          color={theme.colors.textAccent}
        />
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode="tail">
            {screenTitle}
          </Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {tt(t, "nearby.rooms.collectiveChat")}
          </Text>
        </View>
      </View>
    ),
    [screenTitle, t]
  );

  if (!roomId) {
    return (
      <ScreenShell
        title={screenTitle}
        headerCenter={headerCenter}
        background="chatCanalV6"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title={tt(t, "nearby.rooms.unavailableTitle")}
            body={tt(
              t, "nearby.rooms.missingRoomId"
            )}
            primaryAction={{ label: tt(t, "common.back"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={screenTitle}
      headerCenter={headerCenter}
      background="chatCanalV6"
      showBack
      onBack={handleBack}
    >
      <KeyboardStickyView
        style={styles.chatLayout}
        offset={{ closed: 0, opened: 0 }}
      >
      {loading ? (
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="chatbubble-ellipses-outline"
            title={screenTitle}
            body={tt(t, "nearby.rooms.loadingMessages")}
          />
        </View>
      ) : errorText ? (
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt(t, "nearby.rooms.errorTitle")}
            body={errorText}
            primaryAction={{
              label: tt(t, "common.retry"),
              onPress: () => void loadMessages("initial"),
            }}
            secondaryAction={{ label: tt(t, "common.back"), onPress: handleBack }}
          />
        </View>
      ) : isEmpty ? (
        <View style={styles.centerState}>
          <CoreStateCard
            icon="chatbubbles-outline"
            title={tt(t, "nearby.rooms.emptyTitle")}
            body={tt(
              t, "nearby.rooms.emptyBody"
            )}
          />
        </View>
      ) : (
        <FlatList
          inverted
          data={messages}
          keyExtractor={(item) => messageKey(item)}
          renderItem={renderItem}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshing={refreshing}
          onRefresh={() => void loadMessages("refresh")}
          initialNumToRender={16}
          maxToRenderPerBatch={20}
          windowSize={10}
        />
      )}

      {canShowComposer ? (
        <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={tt(t, "nearby.rooms.messagePlaceholder")}
              placeholderTextColor="rgba(226,232,255,0.46)"
              style={styles.input}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              onPress={() => void send()}
              disabled={!canSend}
              activeOpacity={0.86}
              style={[styles.sendButton, !canSend ? styles.sendButtonDisabled : null]}
              accessibilityRole="button"
              accessibilityLabel={tt(t, "common.send")}
            >
              {sending ? (
                <ActivityIndicator size="small" color={theme.colors.primaryActionText} />
              ) : (
                <Text style={[styles.sendText, !canSend ? styles.sendTextDisabled : null]}>
                  {tt(t, "common.send")}
                </Text>
              )}
            </TouchableOpacity>
        </View>
      ) : null}
      </KeyboardStickyView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  chatLayout: {
    flex: 1,
  },
  headerCenter: {
    maxWidth: "100%",
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
  },
  headerCopy: {
    flexShrink: 1,
    alignItems: "flex-start",
  },
  headerTitle: {
    maxWidth: 190,
    color: theme.colors.text,
    fontSize: 14,
    fontWeight: "900",
  },
  headerSubtitle: {
    maxWidth: 190,
    color: theme.colors.subtext,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  messageWrap: {
    width: "100%",
    marginBottom: 6,
    alignItems: "flex-start",
  },
  messageWrapOwn: {
    alignItems: "flex-end",
  },
  bubble: {
    maxWidth: "84%",
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderColor: "transparent",
    gap: 4,
  },
  bubbleOwn: {
    backgroundColor: "rgba(230,185,118,0.09)",
    borderColor: "transparent",
  },
  bubbleOther: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  senderLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  senderLabelOwn: {
    color: "rgba(255,248,234,0.72)",
  },
  messageText: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: "600",
  },
  messageTime: {
    alignSelf: "flex-end",
    color: "rgba(255,255,255,0.58)",
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
  },
  messageTimeOwn: {
    color: "rgba(255,248,234,0.60)",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(5,8,22,0.48)",
  },
  input: {
    flex: 1,
    maxHeight: 118,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    color: theme.colors.text,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    minWidth: 86,
    minHeight: 48,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    backgroundColor: theme.colors.primaryActionBg,
    borderWidth: 1,
    borderColor: theme.colors.primaryActionBorder,
  },
  sendButtonDisabled: {
    backgroundColor: "rgba(201,120,104,0.12)",
    borderColor: "rgba(201,120,104,0.28)",
  },
  sendText: {
    color: theme.colors.primaryActionText,
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
  },
  sendTextDisabled: {
    color: "rgba(221,160,139,0.58)",
  },
});
