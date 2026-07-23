import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme/theme";
import { visualSystem } from "@/theme/visualSystem";

type Props = {
  recovery?: boolean;
  retrying?: boolean;
  onRetry?: () => void;
};

export default function StartupScreen({ recovery = false, retrying = false, onRetry }: Props) {
  const { t } = useLocale();

  return (
    <SafeAreaView style={styles.screen} testID={recovery ? "startup-recovery" : "startup-loading"}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.glow} />
      <View style={styles.content}>
        <View style={styles.mark}>
          <Text style={styles.markText}>A</Text>
        </View>
        <Text style={styles.brand}>AMORIA</Text>
        <Text style={styles.title}>
          {t(recovery ? "startup.recoveryTitle" : "startup.loadingTitle")}
        </Text>
        <Text style={styles.body}>
          {t(recovery ? "startup.recoveryBody" : "startup.loadingBody")}
        </Text>
        {recovery ? (
          <Pressable
            accessibilityRole="button"
            disabled={retrying}
            onPress={onRetry}
            style={({ pressed }) => [styles.retry, pressed && styles.retryPressed, retrying && styles.retryDisabled]}
          >
            {retrying ? (
              <ActivityIndicator color={visualSystem.colors.primaryText} />
            ) : null}
            <Text style={styles.retryText}>{t("common.retry")}</Text>
          </Pressable>
        ) : (
          <ActivityIndicator
            color={visualSystem.colors.accent}
            size="small"
            style={styles.indicator}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    top: -170,
    alignSelf: "center",
    backgroundColor: "rgba(117,92,154,0.16)",
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: 70,
    height: 70,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: visualSystem.colors.accentSoft,
    borderWidth: 1,
    borderColor: theme.colors.borderWarm,
  },
  markText: {
    color: visualSystem.colors.textWarm,
    fontSize: 34,
    fontWeight: "800",
  },
  brand: {
    marginTop: 18,
    color: visualSystem.colors.textWarm,
    fontSize: 13,
    letterSpacing: 4.5,
    fontWeight: "800",
  },
  title: {
    marginTop: 30,
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "800",
    textAlign: "center",
  },
  body: {
    marginTop: 10,
    maxWidth: 390,
    color: theme.colors.subtext,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  indicator: { marginTop: 28 },
  retry: {
    minWidth: 180,
    minHeight: 48,
    marginTop: 28,
    paddingHorizontal: 22,
    borderRadius: theme.buttons.primary.borderRadius,
    backgroundColor: theme.buttons.primary.backgroundColor,
    borderWidth: theme.buttons.primary.borderWidth,
    borderColor: theme.buttons.primary.borderColor,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  retryPressed: { opacity: 0.9 },
  retryDisabled: { opacity: 0.62 },
  retryText: {
    color: visualSystem.colors.primaryText,
    fontSize: 15,
    fontWeight: "900",
  },
});
