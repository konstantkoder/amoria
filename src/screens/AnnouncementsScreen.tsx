import React from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import NearbyAnnouncementsSection from "@/components/nearby/NearbyAnnouncementsSection";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type AnnouncementsTabNavigationProp,
  type AnnouncementsTabRouteProp,
} from "@/navigation/appRoutes";
import {
  openAnnouncementDetail,
  openCreateAnnouncement,
  resetAnnouncementsRouteParams,
} from "@/navigation/nearbyNavigation";
import {
  nearbyAnnouncementsRepository,
  type NearbyAnnouncement,
  type NearbyAnnouncementCategory,
} from "@/services/nearbyAnnouncements";

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function AnnouncementsScreen() {
  const navigation = useNavigation<AnnouncementsTabNavigationProp>();
  const route = useRoute<AnnouncementsTabRouteProp>();
  const { t } = useLocale();
  const [announcements, setAnnouncements] = React.useState<NearbyAnnouncement[]>([]);
  const [announcementCategory, setAnnouncementCategory] = React.useState<
    NearbyAnnouncementCategory | "all"
  >("all");
  const [highlightedAnnouncementId, setHighlightedAnnouncementId] = React.useState<
    NearbyAnnouncement["id"] | null
  >(null);

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      void nearbyAnnouncementsRepository.listAnnouncements().then((next) => {
        if (!alive) return;
        setAnnouncements(next);
      });
      return () => {
        alive = false;
      };
    }, [])
  );

  React.useEffect(() => {
    const requestedHighlightId = route.params?.highlightAnnouncementId?.trim();
    if (!requestedHighlightId) return;

    setAnnouncementCategory("all");
    setHighlightedAnnouncementId(requestedHighlightId);
    resetAnnouncementsRouteParams(navigation);
  }, [navigation, route.params?.highlightAnnouncementId]);

  React.useEffect(() => {
    if (!highlightedAnnouncementId) return;
    const timeout = setTimeout(() => {
      setHighlightedAnnouncementId((current) =>
        current === highlightedAnnouncementId ? null : current
      );
    }, 3000);
    return () => clearTimeout(timeout);
  }, [highlightedAnnouncementId]);

  const visibleAnnouncements = React.useMemo(
    () =>
      announcementCategory === "all"
        ? announcements
        : announcements.filter((item) => item.category === announcementCategory),
    [announcementCategory, announcements]
  );

  return (
    <ScreenShell
      title={copyOrFallback(t, "tabs.announcements", "Announcements")}
      background="ads"
      overlayOpacity={0.18}
      blurRadius={0}
    >
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 6 }}>
        <NearbyAnnouncementsSection
          items={visibleAnnouncements}
          activeCategory={announcementCategory}
          highlightedId={highlightedAnnouncementId}
          onCategoryChange={setAnnouncementCategory}
          onOpen={(item) => {
            setHighlightedAnnouncementId(null);
            openAnnouncementDetail(navigation, item);
          }}
          onCreate={() => openCreateAnnouncement(navigation)}
        />
      </View>
    </ScreenShell>
  );
}
