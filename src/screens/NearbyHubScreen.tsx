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
          "Моментный nearby pulse: короткий сигнал о том, что тебе нужно прямо сейчас и только на ближайший момент."
        ),
      },
      {
        id: "announcements" as const,
        label: copyOrFallback(t, "nearby.segment.announcements", "Объявления"),
        body: copyOrFallback(
          t,
          "nearby.segment.announcementsBody",
          "Оформленный запрос: кого ищешь, где это актуально и какой формат встречи или компании нужен."
        ),
      },
      {
        id: "rooms" as const,
        label: copyOrFallback(t, "nearby.segment.rooms", "Комнаты"),
        body: copyOrFallback(
          t,
          "nearby.segment.roomsBody",
          "Вход в живое общее пространство рядом: карта, место и общий чат."
        ),
      },
    ],
    [t]
  );
  const getSegmentTone = React.useCallback((section: NearbySection) => {
    switch (section) {
      case "announcements":
        return {
          button: styles.segmentButtonAnnouncementsActive,
          text: styles.segmentTextAnnouncementsActive,
        };
      case "rooms":
        return {
          button: styles.segmentButtonRoomsActive,
          text: styles.segmentTextRoomsActive,
        };
      case "now":
      default:
        return {
          button: styles.segmentButtonNowActive,
          text: styles.segmentTextNowActive,
        };
    }
  }, []);
  const sectionNoteTone = React.useMemo(() => {
    switch (selectedSection) {
      case "announcements":
        return {
          card: styles.sectionNoteAnnouncements,
          label: styles.sectionNoteLabelAnnouncements,
        };
      case "rooms":
        return {
          card: styles.sectionNoteRooms,
          label: styles.sectionNoteLabelRooms,
        };
      case "now":
      default:
        return {
          card: styles.sectionNoteNow,
          label: styles.sectionNoteLabelNow,
        };
    }
  }, [selectedSection]);

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
          <View style={styles.heroCard}>
            <View style={styles.introRow}>
              <Text style={styles.introKicker}>
                {copyOrFallback(t, "nearby.heroKicker", "Рядом")}
              </Text>
              <Text style={styles.introTitle}>
                {copyOrFallback(
                  t,
                  "nearby.heroTitle",
                  "Nearby делится на три разных сценария рядом"
                )}
              </Text>
              <Text style={styles.introBody}>
                {copyOrFallback(
                  t,
                  "nearby.heroBody",
                  "«Сейчас» — для того, что происходит прямо сейчас. «Объявления» — для более явного поиска человека, компании или плана. «Комнаты» — для живого общего пространства рядом."
                )}
              </Text>
            </View>

            <View style={styles.segmentCard}>
              <View style={styles.segmentRow}>
                {sectionItems.map((item) => {
                  const active = selectedSection === item.id;
                  const tone = getSegmentTone(item.id);
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() => setSection(item.id)}
                      style={[
                        styles.segmentButton,
                        active ? styles.segmentButtonActive : null,
                        active ? tone.button : null,
                      ]}
                      hitSlop={4}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          active ? styles.segmentTextActive : null,
                          active ? tone.text : null,
                        ]}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={[styles.sectionNoteCard, sectionNoteTone.card]}>
              <Text style={[styles.sectionNoteLabel, sectionNoteTone.label]}>
                {sectionReady
                  ? activeSectionCopy.label
                  : copyOrFallback(t, "nearby.loading", "Собираем Nearby…")}
              </Text>
              <Text style={styles.sectionNoteBody} numberOfLines={3}>
                {sectionReady
                  ? activeSectionCopy.body
                  : copyOrFallback(t, "nearby.heroBody", "Сигналы, объявления и комнаты рядом.")}
              </Text>
            </View>
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
    gap: 10,
    paddingBottom: 6,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 14,
    backgroundColor: "rgba(12, 16, 30, 0.86)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  introRow: {
    gap: 4,
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
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  introBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  segmentCard: {
    borderRadius: 20,
    padding: 5,
    backgroundColor: "rgba(7, 10, 20, 0.76)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 5,
  },
  segmentButton: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    shadowColor: theme.colors.accent,
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  segmentButtonNowActive: {
    backgroundColor: "rgba(70,224,200,0.16)",
    borderColor: "rgba(70,224,200,0.28)",
  },
  segmentButtonAnnouncementsActive: {
    backgroundColor: "rgba(255, 122, 60, 0.20)",
    borderColor: "rgba(255, 122, 60, 0.34)",
  },
  segmentButtonRoomsActive: {
    backgroundColor: "rgba(96,165,250,0.18)",
    borderColor: "rgba(96,165,250,0.28)",
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
  segmentTextNowActive: {
    color: "#D9FFF6",
  },
  segmentTextAnnouncementsActive: {
    color: "#FFF2EB",
  },
  segmentTextRoomsActive: {
    color: "#E7F1FF",
  },
  sectionNoteCard: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 11,
    backgroundColor: "rgba(16, 20, 38, 0.74)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 4,
  },
  sectionNoteLabel: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "800",
  },
  sectionNoteNow: {
    backgroundColor: "rgba(21, 33, 34, 0.82)",
    borderColor: "rgba(110, 231, 183, 0.18)",
  },
  sectionNoteLabelNow: {
    color: "#CFFAE9",
  },
  sectionNoteAnnouncements: {
    backgroundColor: "rgba(31, 20, 35, 0.84)",
    borderColor: "rgba(255, 122, 60, 0.2)",
  },
  sectionNoteLabelAnnouncements: {
    color: "#FFD9C8",
  },
  sectionNoteRooms: {
    backgroundColor: "rgba(17, 23, 41, 0.84)",
    borderColor: "rgba(96, 165, 250, 0.2)",
  },
  sectionNoteLabelRooms: {
    color: "#D7E7FF",
  },
  sectionNoteBody: {
    color: theme.colors.subtext,
    fontSize: 12,
    lineHeight: 17,
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
    marginTop: 2,
  },
});
