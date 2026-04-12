import React from "react";

import ScreenShell from "@/components/ScreenShell";
import NearbyNowSection from "@/components/nearby/NearbyNowSection";
import { useLocale } from "@/contexts/LocaleContext";

export default function NowScreen() {
  const { t } = useLocale();

  return (
    <ScreenShell
      title={t("nearby.segment.now")}
      background="now"
      overlayOpacity={0.18}
      blurRadius={0}
    >
      <NearbyNowSection showHero showRoomsBridge />
    </ScreenShell>
  );
}
