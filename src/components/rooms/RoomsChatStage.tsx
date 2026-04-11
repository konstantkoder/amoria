import React, { useCallback } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import RoomChatComposer from "@/components/rooms/RoomChatComposer";
import RoomMessageRow from "@/components/rooms/RoomMessageRow";
import type { RoomUiMessage, RoomsTranslate } from "@/components/rooms/types";
import { getRoomMeta, type RoomDoc, type RoomMember } from "@/services/rooms";
import { theme } from "@/theme";

type Props = {
  t: RoomsTranslate;
  uid: string | null;
  room: RoomDoc;
  activeMembers: RoomMember[];
  nicknameLabel: string;
  messages: RoomUiMessage[];
  listRef: React.RefObject<FlatList<RoomUiMessage> | null>;
  inputRef: React.RefObject<TextInput | null>;
  canSend: boolean;
  sending: boolean;
  safeAreaBottom: number;
  onRetrySend: (id: string) => void;
  onSend: () => void;
  onDraftChange: (value: string) => void;
  onRefreshPosition: () => void;
};

export default function RoomsChatStage({
  t,
  uid,
  room,
  activeMembers,
  nicknameLabel,
  messages,
  listRef,
  inputRef,
  canSend,
  sending,
  safeAreaBottom,
  onRetrySend,
  onSend,
  onDraftChange,
  onRefreshPosition,
}: Props) {
  const roomMeta = getRoomMeta(room.kind);
  const roomTitle = `${roomMeta.emoji} ${t(roomMeta.labelKey)}`;
  const area = room.radiusM ? ` · ~${Math.round(room.radiusM)} ${t("units.m")}` : "";

  const renderItem = useCallback(
    ({ item }: { item: RoomUiMessage }) => (
      <RoomMessageRow item={item} uid={uid} t={t} onRetry={onRetrySend} />
    ),
    [onRetrySend, t, uid]
  );

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text style={styles.title}>{roomTitle}</Text>
          <Text style={styles.subtitle}>
            {t("rooms.membersLine", {
              count: String(activeMembers.length),
              name: nicknameLabel,
            }) + area}
          </Text>
        </View>

        <TouchableOpacity activeOpacity={0.85} onPress={onRefreshPosition} style={styles.refreshButton}>
          <Ionicons name="navigate-outline" size={18} color={theme.colors.accent} />
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        inverted
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        onContentSizeChange={() => {
          listRef.current?.scrollToOffset({ offset: 0, animated: false });
        }}
      />

      <RoomChatComposer
        inputRef={inputRef}
        canSend={canSend}
        sending={sending}
        safeAreaBottom={safeAreaBottom}
        placeholder={t("rooms.messagePlaceholder")}
        onSend={onSend}
        onDraftChange={onDraftChange}
        onFocus={() =>
          requestAnimationFrame(() =>
            listRef.current?.scrollToOffset({ offset: 0, animated: true })
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTextWrap: {
    flex: 1,
  },
  title: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: "900",
  },
  subtitle: {
    color: "#A3A3A3",
    fontSize: 12,
    marginTop: 2,
  },
  refreshButton: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
});
