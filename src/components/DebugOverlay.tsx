import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useLocale } from "@/contexts/LocaleContext";
import { translateMaybeKey } from "@/utils/i18n";

type DebugOverlayProps = {
  firebaseConfigured: boolean;
  lastError?: string | null;
};

export default function DebugOverlay({
  firebaseConfigured,
  lastError,
}: DebugOverlayProps) {
  const { t } = useLocale();
  if (!__DEV__) return null;
  const configuredLabel = firebaseConfigured
    ? t("common.true")
    : t("common.false");
  const lastErrorLabel = lastError
    ? translateMaybeKey(lastError, t, ["debug.", "auth.", "common."])
    : t("common.none");

  return (
    <View pointerEvents="none" style={styles.container}>
      <Text style={styles.title}>{t("debug.title")}</Text>
      <Text style={styles.line}>
        {t("debug.firebaseConfigured", { value: configuredLabel })}
      </Text>
      <Text style={styles.line}>
        {t("debug.lastError", { value: lastErrorLabel })}
      </Text>
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
