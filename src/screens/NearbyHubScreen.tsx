import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";

import ScreenShell from "@/components/ScreenShell";
import NearbyAnnouncementsSection from "@/components/nearby/NearbyAnnouncementsSection";
import NearbyNowSection from "@/components/nearby/NearbyNowSection";
import NearbyRoomsSection from "@/components/nearby/NearbyRoomsSection";
import { useLocale } from "@/contexts/LocaleContext";
import {
  type NearbySection,
  type NearbyTabNavigationProp,
  type NearbyTabRouteProp,
} from "@/navigation/appRoutes";
import {
  openAnnouncementDetail,
  openCreateAnnouncement,
  resetNearbyRouteParams,
} from "@/navigation/nearbyNavigation";
import {
  nearbyAnnouncementsRepository,
  type NearbyAnnouncement,
  type NearbyAnnouncementCategory,
} from "@/services/nearbyAnnouncements";
import { theme } from "@/theme";

const SECTION_STORAGE_KEY = "amoria.nearby.activeSection.v1";

function isNearbySection(value: unknown): value is NearbySection {
  return value === "now" || value === "announcements" || value === "rooms";
}

function copyOrFallback(
  t: (key: string, params?: Record<string, string>) => string,
  key: string,
  fallback: string
) {
  const value = t(key);
  return value === key ? fallback : value;
}

export default function NearbyHubScreen() {
  const navigation = useNavigation<NearbyTabNavigationProp>();
  const route = useRoute<NearbyTabRouteProp>();
  const { t } = useLocale();
  const routeRequestRef = React.useRef(false);
  const [selectedSection, setSelectedSectionState] = React.useState<NearbySection>("now");
  const [announcements, setAnnouncements] = React.useState<NearbyAnnouncement[]>([]);
  const [announcementCategory, setAnnouncementCategory] = React.useState<
    NearbyAnnouncementCategory | "all"
  >("all");
  const [highlightedAnnouncementId, setHighlightedAnnouncementId] = React.useState<
    NearbyAnnouncement["id"] | null
  >(null);
  const [sectionReady, setSectionReady] = React.useState(false);
  routeRequestRef.current =
    isNearbySection(route.params?.section) || Boolean(route.params?.highlightAnnouncementId?.trim());

  const setSection = React.useCallback((next: NearbySection) => {
    setSelectedSectionState(next);
    if (next !== "announcements") {
      setHighlightedAnnouncementId(null);
    }
    AsyncStorage.setItem(SECTION_STORAGE_KEY, next).catch(() => {});
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SECTION_STORAGE_KEY);
        if (!alive) return;
        if (isNearbySection(stored) && !routeRequestRef.current) {
          setSelectedSectionState(stored);
        }
      } finally {
        if (alive) {
          setSectionReady(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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
    const requestedSection = route.params?.section;
    const requestedHighlightId = route.params?.highlightAnnouncementId?.trim();
    let shouldClearParams = false;

    if (isNearbySection(requestedSection)) {
      setSection(requestedSection);
      shouldClearParams = true;
    }

    if (requestedHighlightId) {
      setSection("announcements");
      setAnnouncementCategory("all");
      setHighlightedAnnouncementId(requestedHighlightId);
      shouldClearParams = true;
    }

    if (shouldClearParams) {
      resetNearbyRouteParams(navigation);
    }
  }, [navigation, route.params?.highlightAnnouncementId, route.params?.section, setSection]);

  React.useEffect(() => {
    if (!highlightedAnnouncementId) return;
    const timeout = setTimeout(() => {
      setHighlightedAnnouncementId((current) =>
        current === highlightedAnnouncementId ? null : current
      );
    }, 3000);
    return () => clearTimeout(timeout);
  }, [highlightedAnnouncementId]);

  const tabLabel = React.useMemo(() => copyOrFallback(t, "tabs.nearby", "Nearby"), [t]);

  const sectionItems = React.useMemo(
    () => [
      {
        id: "now" as const,
        label: copyOrFallback(t, "nearby.segment.now", "Сейчас"),
        body: copyOrFallback(
          t,
          "nearby.segment.nowBody",
          "Быстрый статусный слой и люди рядом."
        ),
      },
      {
        id: "announcements" as const,
        label: copyOrFallback(t, "nearby.segment.announcements", "Объявления"),
        body: copyOrFallback(
          t,
          "nearby.segment.announcementsBody",
          "Локальный marketplace для совместных планов."
        ),
      },
      {
        id: "rooms" as const,
        label: copyOrFallback(t, "nearby.segment.rooms", "Комнаты"),
        body: copyOrFallback(
          t,
          "nearby.segment.roomsBody",
          "Групповой geo-chat и живой контекст рядом."
        ),
      },
    ],
    [t]
  );

  const activeSectionCopy = sectionItems.find((item) => item.id === selectedSection) ?? sectionItems[0];
  const visibleAnnouncements = React.useMemo(
    () =>
      announcementCategory === "all"
        ? announcements
        : announcements.filter((item) => item.category === announcementCategory),
    [announcementCategory, announcements]
  );

  const renderSection = () => {
    if (selectedSection === "announcements") {
      return (
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
      );
    }

    if (selectedSection === "rooms") {
      return <NearbyRoomsSection />;
    }

    return <NearbyNowSection />;
  };

  return (
    <ScreenShell title={tabLabel} background="now" overlayOpacity={0.18} blurRadius={0}>
      <View style={styles.screen}>
        <View style={styles.topBlock}>
          <View style={styles.introRow}>
            <Text style={styles.introKicker}>
              {copyOrFallback(t, "nearby.heroKicker", "Локальная social layer")}
            </Text>
            <Text style={styles.introTitle}>
              {copyOrFallback(t, "nearby.heroTitle", "Всё рядом, в одном месте")}
            </Text>
          </View>

          <View style={styles.segmentCard}>
            <View style={styles.segmentRow}>
              {sectionItems.map((item) => {
                const active = selectedSection === item.id;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => setSection(item.id)}
                    style={[styles.segmentButton, active ? styles.segmentButtonActive : null]}
                    hitSlop={4}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        active ? styles.segmentTextActive : null,
                      ]}
                    >
                      {item.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.sectionNoteCard}>
            <Text style={styles.sectionNoteLabel}>
              {sectionReady
                ? activeSectionCopy.label
                : copyOrFallback(t, "nearby.loading", "Собираем Nearby…")}
            </Text>
            <Text style={styles.sectionNoteBody} numberOfLines={2}>
              {sectionReady
                ? activeSectionCopy.body
                : copyOrFallback(t, "nearby.heroBody", "Статус, объявления и комнаты рядом.")}
            </Text>
          </View>
        </View>

        <View style={styles.panelArea}>{renderSection()}</View>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
  },
  topBlock: {
    gap: 8,
    paddingBottom: 6,
  },
  introRow: {
    gap: 2,
    paddingHorizontal: 2,
  },
  introKicker: {
    color: theme.colors.accent,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.9,
  },
  introTitle: {
    color: theme.colors.text,
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "800",
  },
  segmentCard: {
    borderRadius: 18,
    padding: 4,
    backgroundColor: "rgba(10, 14, 26, 0.82)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 4,
  },
  segmentButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 6,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    backgroundColor: "rgba(255, 122, 60, 0.20)",
    borderColor: "rgba(255, 122, 60, 0.34)",
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  segmentText: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  segmentTextActive: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  sectionNoteCard: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: "rgba(16, 20, 38, 0.62)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 2,
  },
  sectionNoteLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionNoteBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 16,
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
  },
});
