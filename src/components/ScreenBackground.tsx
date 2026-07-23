import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import BackgroundWrapper, {
  type BackgroundKey,
} from "@/components/BackgroundWrapper";

export type ScreenBackgroundVariant =
  | "default"
  | "hearts"
  | "togetherMain"
  | "togetherStory"
  | "togetherChat"
  | "smoke"
  | "nightCity"
  | "menu"
  | "ads"
  | "now"
  | "rooms"
  | "profile"
  | "aurora"
  | "sunset"
  | "deepSpace"
  | "authWarm"
  | "midnightWarm"
  | "profileWarm"
  | "chatWarm"
  | "inboxWarm"
  | "conversationWarm"
  | "nearbyWarm"
  | "menuWarm"
  | "utilityWarm"
  | "announcementWarm";

type Props = {
  variant?: ScreenBackgroundVariant;
  overlayOpacity?: number;
  blurRadius?: number;
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
  authWarm: {
    colors: ["#050816", "#090B17", "#171022", "#28172B"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#755C9A",
    blobBColor: "#A6636F",
    blobOpacity: 0.13,
  },
  midnightWarm: {
    colors: ["#050816", "#0B0813", "#1D0E1D", "#321528"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#9B3F68",
    blobBColor: "#B66A3C",
    blobOpacity: 0.16,
  },
  nearbyWarm: {
    colors: ["#050816", "#080B17", "#17101F", "#291725"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#A45F69",
    blobBColor: "#705C98",
    blobOpacity: 0.14,
  },
  profileWarm: {
    colors: ["#050816", "#0A0B17", "#1A1122", "#2B1829"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#865B86",
    blobBColor: "#A46661",
    blobOpacity: 0.14,
  },
  chatWarm: {
    colors: ["#050816", "#080A14", "#1A1020", "#2D1629"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#9B3F68",
    blobBColor: "#B66A3C",
    blobOpacity: 0.16,
  },
  inboxWarm: {
    colors: ["#050816", "#070D19", "#11182A", "#1A2438"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#6B5C9A",
    blobBColor: "#4A647A",
    blobOpacity: 0.14,
  },
  conversationWarm: {
    colors: ["#050816", "#070B16", "#101526", "#1A1C31"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#665A93",
    blobBColor: "#48657A",
    blobOpacity: 0.12,
  },
  menuWarm: {
    colors: ["#050816", "#090B15", "#15101D", "#221525"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#6F5A8F",
    blobBColor: "#965D66",
    blobOpacity: 0.12,
  },
  utilityWarm: {
    colors: ["#050816", "#080C16", "#101722", "#182431"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#506B7D",
    blobBColor: "#675985",
    blobOpacity: 0.10,
  },
  announcementWarm: {
    colors: ["#050816", "#090B16", "#19111F", "#2A1825"],
    start: { x: 0, y: 0 },
    end: { x: 1, y: 1 },
    blobAColor: "#A05E68",
    blobBColor: "#835B90",
    blobOpacity: 0.13,
  },
} as const;

function isGradientVariant(
  v: ScreenBackgroundVariant,
): v is keyof typeof gradientPresets {
  return Object.prototype.hasOwnProperty.call(gradientPresets, v);
}

function mapVariantToKey(variant: ScreenBackgroundVariant): BackgroundKey {
  switch (variant) {
    case "hearts":
      return "hearts";
    case "togetherMain":
      return "togetherMain";
    case "togetherStory":
      return "togetherStory";
    case "togetherChat":
      return "togetherChat";
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
  default: { overlayOpacity: 0.18, blurRadius: 2 },
  hearts: { overlayOpacity: 0.18, blurRadius: 2 },
  togetherMain: { overlayOpacity: 0.28, blurRadius: 0 },
  togetherStory: { overlayOpacity: 0.24, blurRadius: 0 },
  togetherChat: { overlayOpacity: 0.22, blurRadius: 0 },

  // image variants
  smoke: { overlayOpacity: 0.35, blurRadius: 3 },
  nightCity: { overlayOpacity: 0.33, blurRadius: 2 },
  menu: { overlayOpacity: 0.28, blurRadius: 5 },
  ads: { overlayOpacity: 0.18, blurRadius: 0 },
  now: { overlayOpacity: 0.18, blurRadius: 0 },
  rooms: { overlayOpacity: 0.20, blurRadius: 0 },
  profile: { overlayOpacity: 0.18, blurRadius: 0 },

  // gradient variants (blur is ignored, но оставляем для совместимости)
  aurora: { overlayOpacity: 0.22, blurRadius: 0 },
  sunset: { overlayOpacity: 0.22, blurRadius: 0 },
  deepSpace: { overlayOpacity: 0.28, blurRadius: 0 },
  authWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  midnightWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  nearbyWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  profileWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  chatWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  inboxWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  conversationWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  menuWarm: { overlayOpacity: 0.16, blurRadius: 0 },
  utilityWarm: { overlayOpacity: 0.14, blurRadius: 0 },
  announcementWarm: { overlayOpacity: 0.16, blurRadius: 0 },
};

export default function ScreenBackground({
  variant = "default",
  overlayOpacity,
  blurRadius,
  children,
}: Props) {
  const defaults = variantDefaults[variant] ?? variantDefaults.default;
  const resolvedOverlayOpacity = overlayOpacity ?? defaults.overlayOpacity;
  const resolvedBlurRadius = blurRadius ?? defaults.blurRadius;

  // Gradient backgrounds (for unique tab backgrounds)
  if (isGradientVariant(variant)) {
    const preset = gradientPresets[variant];
    const blobAColor = "blobAColor" in preset ? preset.blobAColor : "#22c55e";
    const blobBColor = "blobBColor" in preset ? preset.blobBColor : "#a855f7";
    const blobOpacity = "blobOpacity" in preset ? preset.blobOpacity : 0.18;

    return (
      <View style={styles.root}>
        <LinearGradient
          colors={preset.colors}
          start={preset.start}
          end={preset.end}
          style={StyleSheet.absoluteFillObject}
        />

        {/* Decorative blobs for "image-like" depth */}
        <View
          pointerEvents="none"
          style={[
            styles.blob,
            styles.blobA,
            { backgroundColor: blobAColor, opacity: blobOpacity },
          ]}
        />
        <View
          pointerEvents="none"
          style={[
            styles.blob,
            styles.blobB,
            { backgroundColor: blobBColor, opacity: blobOpacity },
          ]}
        />

        <View
          pointerEvents="none"
          style={[
            styles.overlay,
            { opacity: resolvedOverlayOpacity },
          ]}
        />

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
  blob: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: 420,
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
