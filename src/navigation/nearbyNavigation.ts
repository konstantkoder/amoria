import type {
  AnnouncementDetailRouteParams,
  AnnouncementsTabNavigationProp,
  AnnouncementsTabParams,
  RootStackNavigationProp,
  TabsNavigatorParams,
} from "@/navigation/appRoutes";
import type { NearbyAnnouncement } from "@/services/nearbyAnnouncements";

type NearbyFlowNavigator = Pick<
  RootStackNavigationProp,
  "canGoBack" | "goBack" | "navigate"
>;

type AnnouncementsParamsNavigator = Pick<AnnouncementsTabNavigationProp, "setParams">;

function buildAnnouncementsTabsTarget(
  params?: AnnouncementsTabParams
): ["Tabs", NonNullable<TabsNavigatorParams>] {
  return [
    "Tabs",
    params ? { screen: "Announcements", params } : { screen: "Announcements" },
  ];
}

function buildAnnouncementDetailParams(
  announcement: NearbyAnnouncement
): AnnouncementDetailRouteParams {
  return {
    announcementId: announcement.id,
    initialAnnouncement: announcement,
  };
}

export function openAnnouncements(
  navigation: NearbyFlowNavigator,
  highlightAnnouncementId?: NearbyAnnouncement["id"]
) {
  navigation.navigate(
    ...buildAnnouncementsTabsTarget({
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

export function resetAnnouncementsRouteParams(navigation: AnnouncementsParamsNavigator) {
  navigation.setParams({
    highlightAnnouncementId: undefined,
  });
}

export function goBackOrOpenAnnouncements(
  navigation: NearbyFlowNavigator
) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  openAnnouncements(navigation);
}
