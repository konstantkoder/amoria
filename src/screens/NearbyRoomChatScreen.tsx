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
import type { NearbyRoomMessage } from "@/services/api/types";
import { theme } from "@/theme";

type RenderRoomMessage = NearbyRoomMessage;

function tt(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string,
  params?: Record<string, string>
) {
  const value = t(key, params);
  if (value !== key) return value;
  return Object.entries(params ?? {}).reduce(
    (text, [paramKey, paramValue]) => text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), paramValue),
    fallback
  );
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

function formatMessageTime(value: string) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatSenderLabel(
  fromUserId: string,
  myId: string,
  t: (key: string, params?: Record<string, string>) => string
) {
  if (fromUserId && fromUserId === myId) {
    return tt(t, "common.you", "Вы");
  }

  const safeId = String(fromUserId ?? "").trim();
  const shortId = safeId ? safeId.slice(0, 8) : "";
  return tt(t, "nearby.rooms.sender", "Участник {id}", {
    id: shortId || "room",
  });
}

export default function NearbyRoomChatScreen() {
  const navigation = useNavigation<RootStackNavigationProp<"NearbyRoomChat">>();
  const route = useRoute<NearbyRoomChatRouteProp>();
  const { user } = useAuth();
  const { t } = useLocale();
  const myId = String(user?.id ?? "").trim();
  const roomId = String(route.params?.roomId ?? "").trim();
  const title = String(route.params?.title ?? "").trim();
  const screenTitle = title || tt(t, "nearby.rooms.title", "Активности рядом");

  const mountedRef = useRef(true);
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
      if (!roomId) {
        setMessages([]);
        setLoading(false);
        setRefreshing(false);
        setErrorText("");
        return;
      }

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
        setErrorText(
          error instanceof Error
            ? error.message
            : tt(
                t,
                "nearby.rooms.loadFailed",
                "Не удалось загрузить сообщения чата активности."
              )
        );
      } finally {
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
    if (!roomId || !myId || !nextText || sending) return;

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
      setErrorText(
        error instanceof Error
          ? error.message
          : tt(t, "nearby.rooms.sendFailed", "Не удалось отправить сообщение.")
      );
    } finally {
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
      return (
        <View style={[styles.messageWrap, own ? styles.messageWrapOwn : null]}>
          <View style={[styles.bubble, own ? styles.bubbleOwn : styles.bubbleOther]}>
            <Text style={styles.senderLabel}>
              {formatSenderLabel(item.fromUserId, myId, t)}
            </Text>
            <Text style={styles.messageText}>{item.text}</Text>
            <Text style={styles.messageTime}>{formatMessageTime(item.createdAt)}</Text>
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
            {tt(t, "nearby.rooms.collectiveChat", "Чат активности")}
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
        background="chatWarm"
        showBack
        onBack={handleBack}
      >
        <View style={styles.centerState}>
          <CoreStateCard
            icon="alert-circle-outline"
            title={tt(t, "nearby.rooms.unavailableTitle", "Активность недоступна")}
            body={tt(
              t,
              "nearby.rooms.missingRoomId",
              "Не удалось открыть активность без корректного идентификатора."
            )}
            primaryAction={{ label: tt(t, "common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell
      title={screenTitle}
      headerCenter={headerCenter}
      background="chatWarm"
      showBack
      onBack={handleBack}
    >
      {loading ? (
        <View style={styles.centerState}>
          <CoreStateCard
            loading
            icon="chatbubble-ellipses-outline"
            title={screenTitle}
            body={tt(t, "nearby.rooms.loadingMessages", "Загружаем сообщения...")}
          />
        </View>
      ) : errorText ? (
        <View style={styles.centerState}>
          <CoreStateCard
            icon="cloud-offline-outline"
            title={tt(t, "nearby.rooms.errorTitle", "Чат временно недоступен")}
            body={errorText}
            primaryAction={{
              label: tt(t, "common.retry", "Повторить"),
              onPress: () => void loadMessages("initial"),
            }}
            secondaryAction={{ label: tt(t, "common.back", "Назад"), onPress: handleBack }}
          />
        </View>
      ) : isEmpty ? (
        <View style={styles.centerState}>
          <CoreStateCard
            icon="chatbubbles-outline"
            title={tt(t, "nearby.rooms.emptyTitle", "Сообщений пока нет")}
            body={tt(
              t,
              "nearby.rooms.emptyBody",
              "Напишите первым в чат активности."
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
        <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
          <View style={styles.inputRow}>
            <TextInput
              ref={inputRef}
              value={text}
              onChangeText={setText}
              placeholder={tt(t, "nearby.rooms.messagePlaceholder", "Сообщение в чат активности")}
              placeholderTextColor={theme.colors.muted}
              style={styles.input}
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              onPress={() => void send()}
              disabled={!canSend}
              activeOpacity={0.86}
              style={[styles.sendButton, !canSend ? styles.sendButtonDisabled : null]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.sendText}>{tt(t, "common.send", "Отправить")}</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardStickyView>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: "rgba(12, 16, 30, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 4,
  },
  bubbleOwn: {
    backgroundColor: "rgba(232, 66, 138, 0.90)",
    borderColor: "rgba(255,184,104,0.44)",
  },
  bubbleOther: {
    backgroundColor: "rgba(12, 16, 30, 0.88)",
  },
  senderLabel: {
    color: "rgba(255,255,255,0.68)",
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
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
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(7, 11, 21, 0.92)",
  },
  input: {
    flex: 1,
    maxHeight: 118,
    minHeight: 44,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    color: theme.colors.text,
    paddingHorizontal: 13,
    paddingVertical: 10,
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    minWidth: 86,
    minHeight: 44,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
    backgroundColor: theme.colors.primary,
  },
  sendButtonDisabled: {
    opacity: 0.55,
  },
  sendText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
