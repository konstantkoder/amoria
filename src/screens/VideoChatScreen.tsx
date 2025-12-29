import React from "react";
import { StyleSheet, Text, View } from "react-native";

import ScreenShell from "@/components/ScreenShell";
import { theme } from "@/theme";

export default function VideoChatScreen() {
  return (
    <ScreenShell
      title="Видеочат"
      background="nightCity"
      debugTint={false}
      showBack
    >
      <View style={styles.container}>
        <Text style={styles.message}>Видеочат скоро будет доступен</Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  message: {
    color: theme.colors.text,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
});
