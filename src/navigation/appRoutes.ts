import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type {
  CompositeNavigationProp,
  NavigatorScreenParams,
  RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import type { DmChatRouteParams } from "@/services/dm";
import type { NearbyAnnouncement } from "@/services/nearbyAnnouncements";
import type { ReleasePlayActivity } from "@/services/playSessions";

export type AppStackParamList = {
  Login: undefined;
  Root: undefined;
};

export type AnnouncementsTabParams = {
  highlightAnnouncementId?: NearbyAnnouncement["id"];
};

export type MainTabParamList = {
  Together: undefined;
  Nearby: undefined;
  Announcements: AnnouncementsTabParams | undefined;
  Inbox: undefined;
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

export type PlayMatchRouteParams = {
  activity: ReleasePlayActivity;
};

export type PlaySessionRouteParams = {
  sessionId: string;
};

export type PlaySessionDetailRouteParams = PlaySessionRouteParams & {
  focus?: "replay";
};

export type RootStackParamList = {
  Tabs: TabsNavigatorParams | undefined;
  CreateAnnouncement: undefined;
  AnnouncementDetail: AnnouncementDetailRouteParams;
  PlayMatch: PlayMatchRouteParams;
  PlayCanvas: PlaySessionRouteParams;
  PlayColorMood: PlaySessionRouteParams;
  PlayResult: PlaySessionRouteParams;
  PlayHistory: undefined;
  PlaySessionDetail: PlaySessionDetailRouteParams;
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

export type AnnouncementsTabNavigationProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, "Announcements">,
  RootStackNavigationProp
>;

export type NearbyTabRouteProp = RouteProp<MainTabParamList, "Nearby">;
export type AnnouncementsTabRouteProp = RouteProp<
  MainTabParamList,
  "Announcements"
>;
export type AnnouncementDetailRouteProp = RouteProp<
  RootStackParamList,
  "AnnouncementDetail"
>;
export type DmChatRouteProp = RouteProp<RootStackParamList, "DMChat">;
export type PlayMatchRouteProp = RouteProp<RootStackParamList, "PlayMatch">;
export type PlayCanvasRouteProp = RouteProp<RootStackParamList, "PlayCanvas">;
export type PlayColorMoodRouteProp = RouteProp<
  RootStackParamList,
  "PlayColorMood"
>;
export type PlayResultRouteProp = RouteProp<RootStackParamList, "PlayResult">;
export type PlaySessionDetailRouteProp = RouteProp<
  RootStackParamList,
  "PlaySessionDetail"
>;
