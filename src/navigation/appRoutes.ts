import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type {
  CompositeNavigationProp,
  NavigatorScreenParams,
  RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { DmChatRouteParams } from "@/services/dm";
import type { NearbyAnnouncement } from "@/services/nearbyAnnouncements";
import type { PlayActivity } from "@/services/playSessions";

export type NearbySection = "now" | "announcements" | "rooms";

export type NearbyTabParams = {
  section?: NearbySection;
  highlightAnnouncementId?: string;
};

export type MainTabParamList = {
  Nearby: NearbyTabParams | undefined;
  Together: undefined;
  Connections: undefined;
  Inbox: undefined;
  VideoChat: undefined;
  Question: undefined;
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  PhotoManager: undefined;
  FlirtSettings: undefined;
};

export type AnnouncementDetailRouteParams = {
  announcementId: string;
  initialAnnouncement?: NearbyAnnouncement;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<MainTabParamList> | undefined;
  Rooms: undefined;
  CreateAnnouncement: undefined;
  AnnouncementDetail: AnnouncementDetailRouteParams;
  PlayMatch: { activity?: PlayActivity } | undefined;
  PlayCanvas: Record<string, unknown> | undefined;
  PlayColorMood: Record<string, unknown> | undefined;
  PlayResult: Record<string, unknown> | undefined;
  PlayHistory: undefined;
  PlaySessionDetail: { sessionId: string };
  DMChat: DmChatRouteParams;
  Profile: NavigatorScreenParams<ProfileStackParamList> | undefined;
  Settings: undefined;
  PrivacyPolicy: undefined;
  LocationInfo: undefined;
};

export type RootStackNavigationProp<
  RouteName extends keyof RootStackParamList = keyof RootStackParamList,
> = NativeStackNavigationProp<RootStackParamList, RouteName>;

export type NearbyTabNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Nearby">,
  RootStackNavigationProp
>;

export type NearbyTabRouteProp = RouteProp<MainTabParamList, "Nearby">;
export type AnnouncementDetailRouteProp = RouteProp<
  RootStackParamList,
  "AnnouncementDetail"
>;
export type DmChatRouteProp = RouteProp<RootStackParamList, "DMChat">;

export function buildNearbyTarget(
  params?: NearbyTabParams
): ["Tabs", NonNullable<RootStackParamList["Tabs"]>] {
  return ["Tabs", params ? { screen: "Nearby", params } : { screen: "Nearby" }];
}

export function buildNearbySectionTarget(
  section: NearbySection
): ["Tabs", NonNullable<RootStackParamList["Tabs"]>] {
  return buildNearbyTarget({ section });
}

export function buildNearbyAnnouncementsTarget(options?: {
  highlightAnnouncementId?: string;
}): ["Tabs", NonNullable<RootStackParamList["Tabs"]>] {
  return buildNearbyTarget({
    section: "announcements",
    ...(options?.highlightAnnouncementId
      ? { highlightAnnouncementId: options.highlightAnnouncementId }
      : {}),
  });
}

export function buildCreateAnnouncementTarget(): ["CreateAnnouncement"] {
  return ["CreateAnnouncement"];
}

export function buildAnnouncementDetailTarget(
  params: AnnouncementDetailRouteParams
): ["AnnouncementDetail", AnnouncementDetailRouteParams] {
  return ["AnnouncementDetail", params];
}

export function buildRoomsTarget(): ["Rooms"] {
  return ["Rooms"];
}

export function clearNearbyRouteParams(navigation: NearbyTabNavigationProp) {
  navigation.setParams({
    section: undefined,
    highlightAnnouncementId: undefined,
  });
}
