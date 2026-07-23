import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { visualSystem } from "@/theme/visualSystem";

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

export default function PrimaryActionButton({
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
  const geometry = compact
    ? visualSystem.buttons.compact
    : visualSystem.buttons.primary;

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
    return () => loop.stop();
  }, [inactive, pulse, subtleGlow]);

  const glowStyle = {
    opacity: pulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.08, 0.18],
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
        { minHeight: geometry.minHeight, borderRadius: geometry.borderRadius },
        inactive ? styles.outerDisabled : null,
        style,
      ]}
    >
      {subtleGlow && !inactive ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.glowRing, { borderRadius: geometry.borderRadius }, glowStyle]}
        />
      ) : null}
      <Pressable
        onPress={onPress}
        disabled={inactive}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        style={({ pressed }) => [
          styles.pressable,
          {
            minHeight: geometry.minHeight,
            borderRadius: geometry.borderRadius,
            paddingHorizontal: geometry.paddingHorizontal,
            gap: geometry.gap,
          },
          inactive ? styles.pressableDisabled : null,
          pressed && !inactive ? styles.pressed : null,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={
              inactive
                ? visualSystem.colors.disabledText
                : visualSystem.colors.primaryText
            }
          />
        ) : iconName ? (
          <Ionicons
            name={iconName}
            size={geometry.iconSize}
            color={
              inactive
                ? visualSystem.colors.disabledText
                : visualSystem.colors.primaryText
            }
          />
        ) : null}
        <Text
          style={[
            styles.label,
            {
              color: inactive
                ? visualSystem.colors.disabledText
                : visualSystem.colors.primaryText,
              fontSize: geometry.fontSize,
              lineHeight: geometry.lineHeight,
              fontWeight: geometry.fontWeight,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  outer: {
    shadowColor: visualSystem.colors.primaryBg,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  outerDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  glowRing: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: visualSystem.colors.primaryBg,
  },
  pressable: {
    borderWidth: 1,
    borderColor: visualSystem.colors.primaryBorder,
    backgroundColor: visualSystem.colors.primaryBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  pressableDisabled: {
    backgroundColor: visualSystem.colors.disabledBg,
    borderColor: visualSystem.colors.disabledBorder,
  },
  pressed: {
    backgroundColor: visualSystem.colors.primaryPressedBg,
    transform: [{ scale: 0.985 }],
  },
  label: {
    letterSpacing: 0.1,
  },
});
