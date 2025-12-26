import React from "react";
import {
  ImageBackground,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import { backgrounds, type BackgroundKey } from "@/assets/backgrounds";
import { theme } from "@/theme";

type Props = {
  background: BackgroundKey;
  blurRadius?: number;
  /** 0..1, default 0 (OFF) */
  overlayOpacity?: number;
  overlayColor?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function BackgroundWrapper({
  background,
  blurRadius = 0,
  overlayOpacity = 0,
  overlayColor,
  style,
  children,
}: Props) {
  const bgSource = backgrounds[background];
  const safeOpacity = Math.min(Math.max(overlayOpacity ?? 0, 0), 1);
  const overlayValue =
    overlayColor ?? `rgba(0,0,0,${safeOpacity.toFixed(2)})`;

  return (
    <ImageBackground
      source={bgSource}
      style={[styles.root, style]}
      resizeMode="cover"
      blurRadius={blurRadius}
    >
      {safeOpacity > 0 ? (
        <View
          pointerEvents="none"
          style={[styles.overlay, { backgroundColor: overlayValue }]}
        />
      ) : null}
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.colors.background },
  overlay: { ...StyleSheet.absoluteFillObject },
});
