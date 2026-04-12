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
  loadNearbyAnnouncements,
  type NearbyAnnouncement,
  type NearbyAnnouncementCategory,
} from "@/services/nearbyAnnouncements";
import { theme } from "@/theme";

type NearbySection = "now" | "announcements" | "rooms";

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
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { t } = useLocale();
  const [selectedSection, setSelectedSectionState] = React.useState<NearbySection>("now");
  const [announcements, setAnnouncements] = React.useState<NearbyAnnouncement[]>([]);
  const [announcementCategory, setAnnouncementCategory] = React.useState<
    NearbyAnnouncementCategory | "all"
  >("all");
  const [expandedAnnouncementId, setExpandedAnnouncementId] = React.useState<string | null>(null);
  const [sectionReady, setSectionReady] = React.useState(false);

  const setSection = React.useCallback((next: NearbySection) => {
    setSelectedSectionState(next);
    AsyncStorage.setItem(SECTION_STORAGE_KEY, next).catch(() => {});
  }, []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(SECTION_STORAGE_KEY);
        if (!alive) return;
        if (isNearbySection(stored)) {
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
      void loadNearbyAnnouncements().then((next) => {
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
    if (!isNearbySection(requestedSection)) return;
    setSection(requestedSection);
    navigation.setParams({ section: undefined });
  }, [navigation, route.params?.section, setSection]);

  const tabLabel = React.useMemo(() => {
    const nearby = t("tabs.nearby");
    if (nearby !== "tabs.nearby") return nearby;
    const legacy = t("tabs.now");
    return legacy !== "tabs.now" ? legacy : "Nearby";
  }, [t]);

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
          expandedId={expandedAnnouncementId}
          onCategoryChange={setAnnouncementCategory}
          onToggleOpen={(id) =>
            setExpandedAnnouncementId((prev) => (prev === id ? null : id))
          }
          onCreate={() => navigation.navigate("CreateAnnouncement")}
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
            <Text style={styles.heroKicker}>
              {copyOrFallback(t, "nearby.heroKicker", "Локальная social layer")}
            </Text>
            <Text style={styles.heroTitle}>
              {copyOrFallback(t, "nearby.heroTitle", "Рядом собирает всё, что происходит вокруг")}
            </Text>
            <Text style={styles.heroBody}>
              {copyOrFallback(
                t,
                "nearby.heroBody",
                "Быстрый статус, объявления и комнаты теперь живут в одном локальном узле рядом с ядром Together."
              )}
            </Text>
            <View style={styles.heroPillRow}>
              {sectionItems.map((item) => (
                <View key={item.id} style={styles.heroPill}>
                  <Text style={styles.heroPillText}>{item.label}</Text>
                </View>
              ))}
            </View>
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
            <Text style={styles.segmentBody}>
              {sectionReady ? activeSectionCopy.body : copyOrFallback(t, "nearby.loading", "Собираем Nearby…")}
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
    paddingTop: 6,
    paddingBottom: 8,
  },
  topBlock: {
    gap: 12,
    paddingBottom: 8,
  },
  heroCard: {
    borderRadius: theme.shapes.card,
    padding: 18,
    backgroundColor: "rgba(12, 16, 31, 0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    gap: 10,
  },
  heroKicker: {
    color: theme.colors.accent,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
  },
  heroTitle: {
    color: theme.colors.text,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "800",
  },
  heroBody: {
    color: theme.colors.subtext,
    fontSize: 14,
    lineHeight: 20,
  },
  heroPillRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  heroPill: {
    borderRadius: theme.shapes.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.pillBg,
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
  },
  heroPillText: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: "700",
  },
  segmentCard: {
    borderRadius: theme.shapes.card,
    padding: 12,
    backgroundColor: "rgba(10, 14, 26, 0.84)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    gap: 10,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    minWidth: 0,
    borderRadius: theme.shapes.pill,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: theme.colors.borderSubtle,
    alignItems: "center",
  },
  segmentButtonActive: {
    backgroundColor: "rgba(255, 122, 60, 0.18)",
    borderColor: "rgba(255, 122, 60, 0.28)",
  },
  segmentText: {
    color: theme.colors.subtext,
    fontSize: 13,
    fontWeight: "700",
  },
  segmentTextActive: {
    color: theme.colors.text,
    fontWeight: "800",
  },
  segmentBody: {
    color: theme.colors.subtext,
    fontSize: 13,
    lineHeight: 18,
  },
  panelArea: {
    flex: 1,
    minHeight: 0,
  },
});
