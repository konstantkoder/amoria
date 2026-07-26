import React from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Image,
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
  const breathing = React.useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = React.useState(false);

  React.useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  React.useEffect(() => {
    breathing.stopAnimation();
    breathing.setValue(0);
    if (reduceMotion || recovery) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(breathing, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(breathing, {
          toValue: 0,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [breathing, recovery, reduceMotion]);

  const markScale = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.98, 1.025],
  });
  const haloOpacity = breathing.interpolate({
    inputRange: [0, 1],
    outputRange: [0.16, 0.28],
  });

  return (
    <SafeAreaView style={styles.screen} testID={recovery ? "startup-recovery" : "startup-loading"}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.background} />
      <View style={styles.content}>
        <Animated.View style={[styles.halo, { opacity: reduceMotion ? 0.2 : haloOpacity }]} />
        <Animated.View
          style={{ transform: [{ scale: reduceMotion ? 1 : markScale }] }}
        >
          <Image
            source={require("../../assets/brand/amoria_startup_mark_1024.png")}
            resizeMode="contain"
            style={styles.mark}
            accessible={false}
          />
        </Animated.View>
        <Text style={styles.brand}>Amoria</Text>
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
  halo: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: "rgba(230,185,118,0.18)",
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  mark: {
    width: 92,
    height: 92,
  },
  brand: {
    marginTop: 16,
    color: visualSystem.colors.textWarm,
    fontSize: 28,
    lineHeight: 34,
    fontFamily: "serif",
    fontWeight: "600",
  },
  title: {
    marginTop: 24,
    color: theme.colors.text,
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "600",
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
  indicator: { marginTop: 16 },
  retry: {
    minWidth: 180,
    minHeight: 56,
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
    fontWeight: "700",
  },
});
