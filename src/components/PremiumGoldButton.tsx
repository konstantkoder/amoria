import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { theme } from "@/theme";

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  iconName?: keyof typeof Ionicons.glyphMap;
  compact?: boolean;
  subtleGlow?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export default function PremiumGoldButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  iconName,
  compact = false,
  subtleGlow = false,
  accessibilityLabel,
  style,
}: Props) {
  const pulse = useRef(new Animated.Value(0)).current;
  const inactive = disabled || loading;

  useEffect(() => {
    if (!subtleGlow || inactive) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1050,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1050,
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();

    return () => {
      loop.stop();
    };
  }, [inactive, pulse, subtleGlow]);

  const glowStyle = {
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.12, 0.28],
    }),
    transform: [
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1, 1.035],
        }),
      },
    ],
  };

  return (
    <Animated.View
      style={[
        styles.outer,
        compact ? styles.outerCompact : null,
        inactive ? styles.outerDisabled : null,
        style,
      ]}
    >
      {subtleGlow && !inactive ? (
        <Animated.View pointerEvents="none" style={[styles.glowRing, glowStyle]} />
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={({ pressed }) => [
          styles.pressable,
          compact ? styles.pressableCompact : null,
          pressed && !inactive ? styles.pressed : null,
        ]}
      >
        <LinearGradient
          colors={[theme.colors.goldLight, theme.colors.gold, theme.colors.goldDeep]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.gradient, compact ? styles.gradientCompact : null]}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.goldText} />
          ) : iconName ? (
            <Ionicons name={iconName} size={compact ? 16 : 18} color={theme.colors.goldText} />
          ) : null}
          <Text style={[styles.label, compact ? styles.labelCompact : null]} numberOfLines={1}>
            {label}
          </Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    minHeight: 48,
    borderRadius: 18,
    shadowColor: "#F5C24D",
    shadowOpacity: 0.22,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  outerCompact: {
    minHeight: 42,
  },
  outerDisabled: {
    opacity: 0.55,
    shadowOpacity: 0,
    elevation: 0,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    backgroundColor: "rgba(245,194,77,0.22)",
  },
  pressable: {
    minHeight: 48,
    borderRadius: 18,
    overflow: "hidden",
  },
  pressableCompact: {
    minHeight: 42,
  },
  pressed: {
    opacity: 0.92,
    transform: [{ scale: 0.985 }],
  },
  gradient: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,239,190,0.78)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  gradientCompact: {
    minHeight: 42,
    paddingHorizontal: 14,
  },
  label: {
    color: "#201306",
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  labelCompact: {
    fontSize: 14,
  },
});
