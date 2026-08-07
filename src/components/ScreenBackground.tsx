import React from "react";

import BackgroundWrapper from "@/components/BackgroundWrapper";

export type ScreenBackgroundVariant =
  | "startLighthouseV6"
  | "togetherObservatoryV6"
  | "togetherSearchLighthouseV6"
  | "nearbyHarborV6"
  | "chatCanalV6"
  | "profileArchGardenV6"
  | "drawerLanternStreetV6";

type Props = {
  variant?: ScreenBackgroundVariant;
  blurRadius?: number;
  children: React.ReactNode;
};

export default function ScreenBackground({
  variant = "startLighthouseV6",
  blurRadius = 0,
  children,
}: Props) {
  return (
    <BackgroundWrapper
      background={variant}
      blurRadius={blurRadius}
    >
      {children}
    </BackgroundWrapper>
  );
}
