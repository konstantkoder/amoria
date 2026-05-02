import React from "react";
import { View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import CoreStateCard from "@/components/CoreStateCard";
import ScreenShell from "@/components/ScreenShell";
import NearbyAnnouncementsSection from "@/components/nearby/NearbyAnnouncementsSection";
import { useAuth } from "@/contexts/AuthContext";
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
import { getBlockedUserIds } from "@/services/safety";
import {
  isFirestoreMissingIndexError,
  logFirestoreMissingIndexError,
} from "@/utils/firestoreErrors";

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
  const { user: authUser } = useAuth();
  const { t } = useLocale();
  const currentUid = authUser?.id ?? "";
  const [announcements, setAnnouncements] = React.useState<NearbyAnnouncement[]>([]);
  const [blockedUserIds, setBlockedUserIds] = React.useState<string[]>([]);
  const [announcementCategory, setAnnouncementCategory] = React.useState<
    NearbyAnnouncementCategory | "all"
  >("all");
  const [highlightedAnnouncementId, setHighlightedAnnouncementId] = React.useState<
    NearbyAnnouncement["id"] | null
  >(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const getLoadError = React.useCallback(
    (error: unknown) => {
      if (isFirestoreMissingIndexError(error)) {
        logFirestoreMissingIndexError("Announcements list", error);
        return copyOrFallback(
          t,
          "common.serviceSetupError",
          "Сервис временно настраивается. Попробуйте позже."
        );
      }

      return copyOrFallback(
        t,
        "nearby.announcements.loadErrorBody",
        "Не удалось загрузить общие объявления из Firestore. Попробуй ещё раз позже."
      );
    },
    [t]
  );

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;
      setLoading(true);
      setLoadError(null);
      void Promise.all([
        nearbyAnnouncementsRepository.listAnnouncements(),
        currentUid ? getBlockedUserIds(currentUid) : Promise.resolve([]),
      ])
        .then(([next, blockedIds]) => {
          if (!alive) return;
          setAnnouncements(next);
          setBlockedUserIds(blockedIds);
        })
        .catch((error) => {
          if (!alive) return;
          setAnnouncements([]);
          setBlockedUserIds([]);
          setLoadError(getLoadError(error));
        })
        .finally(() => {
          if (!alive) return;
          setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, [currentUid, getLoadError])
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
    () => {
      const blocked = new Set(blockedUserIds);
      const activeAnnouncements = announcements.filter(
        (item) => item.status === "active" && !blocked.has(item.authorUid)
      );
      return announcementCategory === "all"
        ? activeAnnouncements
        : activeAnnouncements.filter((item) => item.category === announcementCategory);
    },
    [announcementCategory, announcements, blockedUserIds]
  );

  return (
    <ScreenShell
      title={copyOrFallback(t, "tabs.announcements", "Announcements")}
      background="ads"
      overlayOpacity={0.18}
      blurRadius={0}
    >
      <View style={{ flex: 1, paddingHorizontal: 16, paddingTop: 2, paddingBottom: 6 }}>
        {loading ? (
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 8 }}>
            <CoreStateCard
              loading
              icon="document-text-outline"
              title={copyOrFallback(t, "nearby.announcements.loadingTitle", "Загружаем объявления")}
              body={copyOrFallback(
                t,
                "nearby.announcements.loadingBody",
                "Подключаем общий список объявлений из Firestore."
              )}
            />
          </View>
        ) : loadError ? (
          <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 8 }}>
            <CoreStateCard
              icon="cloud-offline-outline"
              title={copyOrFallback(
                t,
                "nearby.announcements.loadErrorTitle",
                "Объявления временно недоступны"
              )}
              body={loadError}
              primaryAction={{
                label: copyOrFallback(t, "common.retry", "Повторить"),
                onPress: () => {
                  setLoading(true);
                  setLoadError(null);
                  void Promise.all([
                    nearbyAnnouncementsRepository.listAnnouncements(),
                    currentUid ? getBlockedUserIds(currentUid) : Promise.resolve([]),
                  ])
                    .then(([next, blockedIds]) => {
                      setAnnouncements(next);
                      setBlockedUserIds(blockedIds);
                    })
                    .catch((error) => {
                      setAnnouncements([]);
                      setBlockedUserIds([]);
                      setLoadError(getLoadError(error));
                    })
                    .finally(() => setLoading(false));
                },
              }}
            />
          </View>
        ) : (
          <NearbyAnnouncementsSection
            items={visibleAnnouncements}
            activeCategory={announcementCategory}
            highlightedId={highlightedAnnouncementId}
            blockedUserIds={blockedUserIds}
            onCategoryChange={setAnnouncementCategory}
            onOpen={(item) => {
              setHighlightedAnnouncementId(null);
              openAnnouncementDetail(navigation, item);
            }}
            onCreate={() => openCreateAnnouncement(navigation)}
          />
        )}
      </View>
    </ScreenShell>
  );
}
