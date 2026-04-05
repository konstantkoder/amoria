import React from "react";
import { StyleSheet, Text, View } from "react-native";

import ScreenShell from "@/components/ScreenShell";
import { theme } from "@/theme";
import { useLocale } from "@/contexts/LocaleContext";

export default function VideoChatScreen() {
  const { t } = useLocale();
  return (
    <ScreenShell
      title={t("videoChat.title")}
      background="nightCity"
      showBack
    >
      <View style={styles.container}>
        <Text style={styles.message}>{t("videoChat.comingSoon")}</Text>
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
