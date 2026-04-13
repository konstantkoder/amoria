import type {
  AnnouncementDetailRouteParams,
  NearbySection,
  NearbyTabNavigationProp,
  NearbyTabParams,
  RootStackNavigationProp,
  TabsNavigatorParams,
} from "@/navigation/appRoutes";
import type { NearbyAnnouncement } from "@/services/nearbyAnnouncements";

type NearbyFlowNavigator = {
  navigate: RootStackNavigationProp["navigate"];
};

type NearbyParamsNavigator = Pick<NearbyTabNavigationProp, "setParams">;

function buildNearbyTabsTarget(
  params?: NearbyTabParams
): ["Tabs", NonNullable<TabsNavigatorParams>] {
  return ["Tabs", params ? { screen: "Nearby", params } : { screen: "Nearby" }];
}

function buildAnnouncementDetailParams(
  announcement: NearbyAnnouncement
): AnnouncementDetailRouteParams {
  return {
    announcementId: announcement.id,
    initialAnnouncement: announcement,
  };
}

export function openNearbySection(
  navigation: NearbyFlowNavigator,
  section: NearbySection
) {
  navigation.navigate(...buildNearbyTabsTarget({ section }));
}

export function openNearbyAnnouncements(
  navigation: NearbyFlowNavigator,
  highlightAnnouncementId?: NearbyAnnouncement["id"]
) {
  navigation.navigate(
    ...buildNearbyTabsTarget({
      section: "announcements",
      ...(highlightAnnouncementId ? { highlightAnnouncementId } : {}),
    })
  );
}

export function openCreateAnnouncement(navigation: NearbyFlowNavigator) {
  navigation.navigate("CreateAnnouncement");
}

export function openAnnouncementDetail(
  navigation: NearbyFlowNavigator,
  announcement: NearbyAnnouncement
) {
  navigation.navigate(
    "AnnouncementDetail",
    buildAnnouncementDetailParams(announcement)
  );
}

export function openRooms(navigation: NearbyFlowNavigator) {
  navigation.navigate("Rooms");
}

export function resetNearbyRouteParams(navigation: NearbyParamsNavigator) {
  navigation.setParams({
    section: undefined,
    highlightAnnouncementId: undefined,
  });
}

export function goBackToNearbyAnnouncements(navigation: NearbyFlowNavigator) {
  openNearbyAnnouncements(navigation);
}
