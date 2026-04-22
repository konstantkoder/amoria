import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "@/theme";

type Props = {
  inputRef: React.RefObject<TextInput | null>;
  canSend: boolean;
  sending: boolean;
  safeAreaBottom: number;
  placeholder: string;
  onSend: () => void;
  onDraftChange: (value: string) => void;
  onFocus: () => void;
};

export default function RoomChatComposer({
  inputRef,
  canSend,
  sending,
  safeAreaBottom,
  placeholder,
  onSend,
  onDraftChange,
  onFocus,
}: Props) {
  return (
    <KeyboardStickyView offset={{ closed: 0, opened: 0 }}>
      <View style={[styles.container, { paddingBottom: safeAreaBottom + 10 }]}>
        <View style={styles.inputShell}>
          <TextInput
            ref={inputRef}
            onChangeText={onDraftChange}
            placeholder={placeholder}
            placeholderTextColor="rgba(255,255,255,0.55)"
            onFocus={onFocus}
            style={styles.input}
            multiline
            blurOnSubmit={false}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onSend}
          disabled={!canSend || sending}
          style={[
            styles.sendButton,
            !canSend || sending ? styles.sendButtonDisabled : styles.sendButtonReady,
          ]}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "rgba(8, 11, 22, 0.88)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  inputShell: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  input: {
    color: theme.colors.text,
    fontSize: 16,
    lineHeight: 20,
    padding: 0,
    textAlignVertical: "top",
    maxHeight: 120,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  sendButtonDisabled: {
    opacity: 0.6,
    backgroundColor: "rgba(255,255,255,0.10)",
    borderColor: "rgba(255,255,255,0.10)",
  },
  sendButtonReady: {
    opacity: 1,
    backgroundColor: theme.colors.primary,
    borderColor: "rgba(255,255,255,0.16)",
  },
});
