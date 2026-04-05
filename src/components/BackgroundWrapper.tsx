import React from "react";
import {
  ImageBackground,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";

import { backgrounds, type BackgroundKey } from "@/assets/backgrounds";

export type { BackgroundKey };

type Props = {
  background: BackgroundKey;
  blurRadius?: number;
  overlayOpacity?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

export default function BackgroundWrapper({
  background,
  blurRadius = 0,
  overlayOpacity = 0.22,
  style,
  children,
}: Props) {
  const [retryCount, setRetryCount] = React.useState(0);
  const [useFallback, setUseFallback] = React.useState(false);
  React.useEffect(() => {
    setRetryCount(0);
    setUseFallback(false);
  }, [background]);

  const safeOpacity = Math.min(Math.max(overlayOpacity, 0), 1);
  const bgSource = backgrounds[background];

  if (!bgSource) {
    return (
      <View style={[styles.root, style, { backgroundColor: "#000" }]}>
        {children}
      </View>
    );
  }

  const fallbackSource = backgrounds.nightCity ?? bgSource;
  const source = useFallback ? fallbackSource : bgSource;
  const activeSource = source;

  return (
    <ImageBackground
      source={activeSource}
      defaultSource={activeSource}
      key={`${background}:${useFallback ? "fallback" : "main"}:${retryCount}`}
      resizeMode="cover"
      blurRadius={blurRadius}
      fadeDuration={0}
      style={[styles.root, style]}
      imageStyle={styles.image}
      onError={(e) => {
        const msg = String(e?.nativeEvent?.error ?? "");
        if (msg.includes("Problem decoding into existing bitmap")) {
          return;
        }
        setRetryCount((current) => {
          const next = current + 1;
          if (next >= 2) {
            setUseFallback(true);
          }
          return next;
        });
      }}
    >
      <View
        pointerEvents="none"
        style={[styles.overlay, { opacity: safeOpacity }]}
      />
      {children}
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000000" },
  image: { opacity: 1, backgroundColor: "#000000" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
});
