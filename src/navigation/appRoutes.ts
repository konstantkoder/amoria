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
  highlightAnnouncementId?: NearbyAnnouncement["id"];
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

export type TabsNavigatorParams = NavigatorScreenParams<MainTabParamList>;

export type AnnouncementDetailRouteParams = {
  announcementId: NearbyAnnouncement["id"];
  initialAnnouncement?: NearbyAnnouncement | null;
};

export type RootStackParamList = {
  Tabs: TabsNavigatorParams | undefined;
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
