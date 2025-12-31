import React from "react";
import {
  ImageBackground,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import { backgrounds, type BackgroundKey } from "../assets/backgrounds";

export type { BackgroundKey };

type Props = {
  background: BackgroundKey;
  blurRadius?: number;
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
  const shouldRenderOverlay = safeOpacity > 0;

  return (
    <ImageBackground
      source={bgSource}
      style={[styles.root, style]}
      resizeMode="cover"
      blurRadius={blurRadius}
    >
      {shouldRenderOverlay ? (
        <View style={[styles.overlay, { backgroundColor: overlayValue }]} />
      ) : null}
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  // DO NOT paint a solid backgroundColor here — it can visually "eat" your image.
  root: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
});
