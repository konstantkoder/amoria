import type {
  AnnouncementDetailRouteParams,
  RootStackNavigationProp,
} from "@/navigation/appRoutes";
import type { NearbyAnnouncement } from "@/services/announcementsModel";

type NearbyFlowNavigator = Pick<
  RootStackNavigationProp,
  "canGoBack" | "goBack" | "navigate"
>;

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
  _highlightAnnouncementId?: NearbyAnnouncement["id"]
) {
  navigation.navigate("Tabs", { screen: "Nearby" });
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

export function goBackOrOpenAnnouncements(
  navigation: NearbyFlowNavigator
) {
  if (navigation.canGoBack()) {
    navigation.goBack();
    return;
  }
  openAnnouncements(navigation);
}
