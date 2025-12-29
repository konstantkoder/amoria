import React from "react";
import { StyleSheet, View, Text } from "react-native";
import BackgroundWrapper from "@/components/BackgroundWrapper";
import { type BackgroundKey } from "@/assets/backgrounds";

export type ScreenBackgroundVariant =
  | "default"
  | "hearts"
  | "smoke"
  | "nightCity"
  | "menu";

type Props = {
  variant?: ScreenBackgroundVariant;
  overlayOpacity?: number;
  blurRadius?: number;
  debugTint?: boolean;
  children: React.ReactNode;
};

const mapVariantToKey = (variant: ScreenBackgroundVariant): BackgroundKey => {
  switch (variant) {
    case "hearts":
      return "hearts";
    case "smoke":
      return "smoke";
    case "nightCity":
      return "nightCity";
    case "menu":
      return "menu";
    case "default":
    default:
      // Default to hearts to keep a visible background.
      return "hearts";
  }
};

const variantDefaults: Record<
  ScreenBackgroundVariant,
  { overlayOpacity: number; blurRadius: number }
> = {
  default: { overlayOpacity: 0.18, blurRadius: 0 },
  hearts: { overlayOpacity: 0.18, blurRadius: 0 },
  smoke: { overlayOpacity: 0.45, blurRadius: 4 },
  nightCity: { overlayOpacity: 0.33, blurRadius: 2 },
  menu: { overlayOpacity: 0.5, blurRadius: 3 },
};

export default function ScreenBackground({
  variant = "default",
  overlayOpacity,
  blurRadius,
  debugTint = false,
  children,
}: Props) {
  const key = mapVariantToKey(variant);
  const defaults = variantDefaults[variant] ?? variantDefaults.default;
  const resolvedOverlayOpacity = overlayOpacity ?? defaults.overlayOpacity;
  const resolvedBlurRadius = blurRadius ?? defaults.blurRadius;

  return (
    <BackgroundWrapper
      background={key}
      overlayOpacity={resolvedOverlayOpacity}
      blurRadius={resolvedBlurRadius}
    >
      {debugTint ? <View pointerEvents="none" style={styles.debug} /> : null}
      {debugTint ? (
        <Text style={styles.debugText}>BG KEY: {key}</Text>
      ) : null}
      {children}
    </BackgroundWrapper>
  );
}

const styles = StyleSheet.create({
  debug: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,0,255,0.08)",
  },
  debugText: {
    position: "absolute",
    top: 10,
    left: 10,
    color: "#fff",
    fontSize: 12,
    opacity: 0.8,
  },
});
