import React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import BackgroundWrapper, {
  type BackgroundKey,
} from "@/components/BackgroundWrapper";
import { backgrounds } from "@/assets/backgrounds";

export type ScreenBackgroundVariant =
  | "default"
  | "hearts"
  | "smoke"
  | "nightCity"
  | "menu"
  | "feed"
  | "announcements"
  | "now"
  | "chats"
  | "rooms"
  | "profile";

type Props = {
  variant?: ScreenBackgroundVariant;
  overlayOpacity?: number;
  blurRadius?: number;
  debugTint?: boolean;
  screenLabel?: string;
  children: React.ReactNode;
};

type VariantConfig = {
  key: BackgroundKey;
  overlayOpacity: number;
  blurRadius: number;
};

const variantConfig: Record<ScreenBackgroundVariant, VariantConfig> = {
  default: { key: "hearts", overlayOpacity: 0.18, blurRadius: 0 },
  hearts: { key: "hearts", overlayOpacity: 0.18, blurRadius: 0 },
  feed: { key: "hearts", overlayOpacity: 0.16, blurRadius: 0 },
  now: { key: "hearts", overlayOpacity: 0.18, blurRadius: 0 },
  smoke: { key: "smoke", overlayOpacity: 0.22, blurRadius: 0 },
  announcements: { key: "smoke", overlayOpacity: 0.22, blurRadius: 0 },
  chats: { key: "smoke", overlayOpacity: 0.22, blurRadius: 0 },
  nightCity: { key: "nightCity", overlayOpacity: 0.3, blurRadius: 2 },
  rooms: { key: "nightCity", overlayOpacity: 0.3, blurRadius: 2 },
  menu: { key: "menu", overlayOpacity: 0.2, blurRadius: 0 },
  profile: { key: "menu", overlayOpacity: 0.2, blurRadius: 0 },
};

const resolveDefaultBackgroundKey = (): BackgroundKey => {
  if (Object.prototype.hasOwnProperty.call(backgrounds, "hearts")) return "hearts";
  if (Object.prototype.hasOwnProperty.call(backgrounds, "menu")) return "menu";
  const keys = Object.keys(backgrounds) as BackgroundKey[];
  return keys[0] ?? "menu";
};

const mapVariantToKey = (
  variant?: ScreenBackgroundVariant
): BackgroundKey => {
  const fallbackKey = resolveDefaultBackgroundKey();
  if (!variant) return fallbackKey;
  const config = variantConfig[variant];
  const candidateKey = config?.key;
  if (
    candidateKey &&
    Object.prototype.hasOwnProperty.call(backgrounds, candidateKey)
  ) {
    return candidateKey;
  }
  return fallbackKey;
};

export default function ScreenBackground({
  variant = "default",
  overlayOpacity,
  blurRadius,
  debugTint = false,
  screenLabel,
  children,
}: Props) {
  const config = variantConfig[variant] ?? variantConfig.default;
  const key = mapVariantToKey(variant);
  const resolvedOverlayOpacity = overlayOpacity ?? config.overlayOpacity;
  const resolvedBlurRadius = blurRadius ?? config.blurRadius;

  const debug = process.env.EXPO_PUBLIC_BG_DEBUG === "1";
  const showDebug = debug;
  const source = backgrounds[key];
  const resolvedUri =
    showDebug && source ? Image.resolveAssetSource(source)?.uri ?? "n/a" : "n/a";

  return (
    <BackgroundWrapper
      background={key}
      overlayOpacity={resolvedOverlayOpacity}
      blurRadius={resolvedBlurRadius}
    >
      {showDebug ? (
        <>
          <View pointerEvents="none" style={styles.debugTint} />
          <View pointerEvents="none" style={styles.debug}>
            <Text style={styles.debugText}>BG KEY: {key}</Text>
            <Text style={styles.debugText}>URI: {resolvedUri}</Text>
          </View>
        </>
      ) : null}
      {children}
    </BackgroundWrapper>
  );
}

const styles = StyleSheet.create({
  debugTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(255,0,255,0.08)",
  },
  debug: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(15,23,42,0.65)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  debugText: {
    color: "#fff",
    fontSize: 11,
    opacity: 0.9,
  },
});
