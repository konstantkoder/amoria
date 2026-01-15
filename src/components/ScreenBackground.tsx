import React from "react";
import { StyleSheet, View, Text } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import BackgroundWrapper, {
  type BackgroundKey,
} from "@/components/BackgroundWrapper";
import { useLocale } from "@/contexts/LocaleContext";

export type ScreenBackgroundVariant =
  | "default"
  | "hearts"
  | "smoke"
  | "nightCity"
  | "menu"
  | "ads"
  | "now"
  | "chats"
  | "rooms"
  | "profile"
  | "aurora"
  | "sunset"
  | "deepSpace";

type Props = {
  variant?: ScreenBackgroundVariant;
  overlayOpacity?: number;
  blurRadius?: number;
  debugTint?: boolean;
  screenLabel?: string;
  children: React.ReactNode;
};

const gradientPresets = {
  aurora: {
    colors: ["#0ea5e9", "#a855f7", "#22c55e", "#0b1020"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
  sunset: {
    colors: ["#f97316", "#ec4899", "#8b5cf6", "#0b1020"],
    start: { x: 0, y: 1 },
    end: { x: 1, y: 0 },
  },
  deepSpace: {
    colors: ["#050816", "#0b1020", "#111827", "#0b1020"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
  },
} as const;

function isGradientVariant(
  v: ScreenBackgroundVariant,
): v is keyof typeof gradientPresets {
  return v === "aurora" || v === "sunset" || v === "deepSpace";
}

function mapVariantToKey(variant: ScreenBackgroundVariant): BackgroundKey {
  switch (variant) {
    case "hearts":
      return "hearts";
    case "smoke":
      return "smoke";
    case "nightCity":
      return "nightCity";
    case "menu":
      return "menu";
    case "ads":
      return "ads";
    case "now":
      return "now";
    case "chats":
      return "chats";
    case "rooms":
      return "rooms";
    case "profile":
      return "profile";
    case "default":
    default:
      return "hearts";
  }
}

const variantDefaults: Record<
  ScreenBackgroundVariant,
  { overlayOpacity: number; blurRadius: number }
> = {
  default: { overlayOpacity: 0.18, blurRadius: 0 },
  hearts: { overlayOpacity: 0.18, blurRadius: 0 },

  // image variants
  smoke: { overlayOpacity: 0.35, blurRadius: 3 },
  nightCity: { overlayOpacity: 0.33, blurRadius: 2 },
  menu: { overlayOpacity: 0.28, blurRadius: 5 },
  ads: { overlayOpacity: 0.18, blurRadius: 0 },
  now: { overlayOpacity: 0.18, blurRadius: 0 },
  chats: { overlayOpacity: 0.18, blurRadius: 0 },
  rooms: { overlayOpacity: 0.20, blurRadius: 0 },
  profile: { overlayOpacity: 0.18, blurRadius: 0 },

  // gradient variants (blur is ignored, но оставляем для совместимости)
  aurora: { overlayOpacity: 0.22, blurRadius: 0 },
  sunset: { overlayOpacity: 0.22, blurRadius: 0 },
  deepSpace: { overlayOpacity: 0.28, blurRadius: 0 },
};

export default function ScreenBackground({
  variant = "default",
  overlayOpacity,
  blurRadius,
  debugTint = false,
  screenLabel,
  children,
}: Props) {
  const { t } = useLocale();
  const defaults = variantDefaults[variant] ?? variantDefaults.default;
  const resolvedOverlayOpacity = overlayOpacity ?? defaults.overlayOpacity;
  const resolvedBlurRadius = blurRadius ?? defaults.blurRadius;
  const debugLabel = screenLabel ?? variant;
  const debugText = t("debug.backgroundLabel", { label: debugLabel });

  // Gradient backgrounds (for unique tab backgrounds)
  if (isGradientVariant(variant)) {
    const preset = gradientPresets[variant];

    return (
      <View style={styles.root}>
        <LinearGradient
          colors={preset.colors}
          start={preset.start}
          end={preset.end}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Decorative blobs for "image-like" depth */}
        <View pointerEvents="none" style={[styles.blob, styles.blobA]} />
        <View pointerEvents="none" style={[styles.blob, styles.blobB]} />

        <View
          pointerEvents="none"
          style={[
            styles.overlay,
            { opacity: resolvedOverlayOpacity },
          ]}
        />

        {debugTint ? <View pointerEvents="none" style={styles.debug} /> : null}
        {debugTint ? <Text style={styles.debugText}>{debugText}</Text> : null}

        {children}
      </View>
    );
  }

  // Image backgrounds (existing behavior)
  const key = mapVariantToKey(variant);

  return (
    <BackgroundWrapper
      background={key}
      overlayOpacity={resolvedOverlayOpacity}
      blurRadius={resolvedBlurRadius}
    >
      {debugTint ? <View pointerEvents="none" style={styles.debug} /> : null}
      {debugTint ? <Text style={styles.debugText}>{debugText}</Text> : null}
      {children}
    </BackgroundWrapper>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
  },
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
  blob: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 420,
    opacity: 0.18,
  },
  blobA: {
    top: -120,
    left: -80,
    backgroundColor: "#22c55e",
  },
  blobB: {
    bottom: -140,
    right: -100,
    backgroundColor: "#a855f7",
  },
});
