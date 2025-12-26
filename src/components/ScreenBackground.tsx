import React from "react";
import BackgroundWrapper from "@/components/BackgroundWrapper";
import type { BackgroundKey } from "@/assets/backgrounds";

export type ScreenBackgroundVariant =
  | "default"
  | "hearts"
  | "smoke"
  | "nightCity"
  | "softDarkGradient";

type Props = {
  variant?: ScreenBackgroundVariant;
  /** optional: if you want a bit darker readability; default 0 (OFF) */
  overlayOpacity?: number;
  /** optional: blur background a bit */
  blurRadius?: number;
  children: React.ReactNode;
};

const variantToBackground: Record<ScreenBackgroundVariant, BackgroundKey> = {
  default: "softDarkGradient",
  softDarkGradient: "softDarkGradient",
  hearts: "hearts",
  smoke: "smoke",
  nightCity: "nightCity",
};

export default function ScreenBackground({
  variant = "default",
  overlayOpacity = 0,
  blurRadius = 0,
  children,
}: Props) {
  const background = variantToBackground[variant] ?? "softDarkGradient";

  return (
    <BackgroundWrapper
      background={background}
      overlayOpacity={overlayOpacity}
      blurRadius={blurRadius}
    >
      {children}
    </BackgroundWrapper>
  );
}
