import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { theme } from "@/theme";
import { formatAgoShort } from "@/utils/timeAgo";
import { translateMaybeKey } from "@/utils/i18n";
import { formatNickname } from "@/utils/nickname";
import type { RoomUiMessage, RoomsTranslate } from "@/components/rooms/types";

type Props = {
  item: RoomUiMessage;
  uid: string | null;
  t: RoomsTranslate;
  onRetry: (id: string) => void;
};

export default React.memo(function RoomMessageRow({
  item,
  uid,
  t,
  onRetry,
}: Props) {
  const isMe = item.uid === uid;
  const failed = item.failed === true;
  const pending = !failed && item.pending === true;
  const formatted = formatNickname(item.nicknameCode, t);
  const displayName =
    formatted === item.nicknameCode
      ? translateMaybeKey(item.nicknameCode, t, ["common."])
      : formatted;

  const bubble = (
    <View
      style={[
        styles.bubble,
        isMe ? styles.ownBubble : styles.peerBubble,
        pending ? styles.pendingBubble : null,
      ]}
    >
      <Text style={styles.messageText}>{item.text}</Text>
    </View>
  );

  return (
    <View style={[styles.wrap, isMe ? styles.wrapOwn : styles.wrapPeer]}>
      <Text style={[styles.metaText, isMe ? styles.metaTextOwn : null]}>
        {isMe ? t("common.you") : displayName} • {formatAgoShort(item.createdAt, t)}
      </Text>

      {failed ? (
        <TouchableOpacity activeOpacity={0.85} onPress={() => onRetry(item.id)}>
          {bubble}
        </TouchableOpacity>
      ) : (
        bubble
      )}

      {failed ? (
        <Text style={styles.failedText}>{t("common.failed")}</Text>
      ) : pending ? (
        <Text style={styles.pendingText}>{t("common.sending")}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: {
    maxWidth: "82%",
    marginBottom: 10,
  },
  wrapOwn: {
    alignSelf: "flex-end",
  },
  wrapPeer: {
    alignSelf: "flex-start",
  },
  metaText: {
    color: "#A3A3A3",
    fontSize: 11,
    marginBottom: 4,
  },
  metaTextOwn: {
    textAlign: "right",
  },
  bubble: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
  },
  ownBubble: {
    backgroundColor: "rgba(109, 40, 217, 0.24)",
    borderColor: "rgba(255, 78, 138, 0.24)",
  },
  peerBubble: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.08)",
  },
  pendingBubble: {
    opacity: 0.55,
  },
  messageText: {
    color: theme.colors.text,
    fontSize: 14,
    lineHeight: 20,
  },
  failedText: {
    color: "#FCA5A5",
    fontSize: 11,
    marginTop: 4,
  },
  pendingText: {
    color: "#A1A1AA",
    fontSize: 11,
    marginTop: 4,
  },
});
