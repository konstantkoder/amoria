// NOTE: Modified copy of the original ScreenBackground component. We've
// adjusted the default overlay opacity and blur radius values for certain
// variants to create a more vibrant and polished look. In particular,
// the 'smoke' variant now has a lighter overlay, and the 'menu' variant
// feels less opaque. All other logic remains unchanged from the upstream
// version.

import React from "react";
import { StyleSheet, View, Text } from "react-native";
import BackgroundWrapper, { type BackgroundKey } from "@/components/BackgroundWrapper";

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
  // Smoke now uses a lighter overlay and a modest blur to let more of the
  // underlying image show through while still muting it enough for legible text.
  smoke: { overlayOpacity: 0.35, blurRadius: 3 },
  // Night city stays the same as default for consistency; screens using it
  // explicitly pass their own overlay and blur values.
  nightCity: { overlayOpacity: 0.33, blurRadius: 2 },
  // Menu variant is less opaque and slightly blurred so that the side drawer
  // feels translucent rather than heavily dimmed.
  menu: { overlayOpacity: 0.3, blurRadius: 3 },
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