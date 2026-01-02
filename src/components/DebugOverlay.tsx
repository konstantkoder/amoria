import React from "react";
import { StyleSheet, Text, View } from "react-native";

type DebugOverlayProps = {
  firebaseConfigured: boolean;
  lastError?: string | null;
};

export default function DebugOverlay({
  firebaseConfigured,
  lastError,
}: DebugOverlayProps) {
  if (!__DEV__) return null;

  return (
    <View pointerEvents="none" style={styles.container}>
      <Text style={styles.title}>Debug</Text>
      <Text style={styles.line}>
        Firebase configured: {firebaseConfigured ? "true" : "false"}
      </Text>
      <Text style={styles.line}>Last error: {lastError ?? "none"}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 48,
    right: 12,
    padding: 10,
    borderRadius: 10,
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.35)",
    maxWidth: "90%",
    zIndex: 999,
  },
  title: { color: "#e2e8f0", fontSize: 11, fontWeight: "700" },
  line: { color: "#e2e8f0", fontSize: 11, marginTop: 4 },
});
