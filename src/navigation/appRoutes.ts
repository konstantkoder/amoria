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
export type RoomsOrigin = "nearby" | "together";

export type AppStackParamList = {
  Login: undefined;
  Root: undefined;
};

export type NearbyTabParams = {
  section?: NearbySection;
  highlightAnnouncementId?: NearbyAnnouncement["id"];
};

export type MainTabParamList = {
  Nearby: NearbyTabParams | undefined;
  Together: undefined;
  Connections: undefined;
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

export type RoomsRouteParams = {
  origin?: RoomsOrigin;
};

export type PlayMatchRouteParams = {
  activity: PlayActivity;
};

export type PlaySessionRouteParams = {
  sessionId: string;
};

export type PlayResultRouteParams = PlaySessionRouteParams & {
  mode?: "history";
};

export type PlaySessionDetailRouteParams = PlaySessionRouteParams & {
  focus?: "replay";
};

export type RootStackParamList = {
  Tabs: TabsNavigatorParams | undefined;
  Rooms: RoomsRouteParams | undefined;
  CreateAnnouncement: undefined;
  AnnouncementDetail: AnnouncementDetailRouteParams;
  PlayMatch: PlayMatchRouteParams;
  PlayCanvas: PlaySessionRouteParams;
  PlayColorMood: PlaySessionRouteParams;
  PlayResult: PlayResultRouteParams;
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

export type NearbyTabRouteProp = RouteProp<MainTabParamList, "Nearby">;
export type AnnouncementDetailRouteProp = RouteProp<
  RootStackParamList,
  "AnnouncementDetail"
>;
export type RoomsRouteProp = RouteProp<RootStackParamList, "Rooms">;
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
