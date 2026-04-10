import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Drawer } from "react-native-drawer-layout";

import { auth, db } from "@/config/firebaseConfig";
import PlayLobbyScreen from "@/screens/PlayLobbyScreen";
import ConnectionsFeedScreen from "@/screens/ConnectionsFeedScreen";
import NowScreen from "@/screens/NowScreen";
import RoomsScreen from "@/screens/RoomsScreen";
import InboxScreen from "@/screens/InboxScreen";
import VideoChatScreen from "@/screens/VideoChatScreen";
import QuestionScreen from "@/screens/QuestionScreen";
import PlayMatchScreen from "@/screens/PlayMatchScreen";
import PlayCanvasScreen from "@/screens/PlayCanvasScreen";
import PlayColorMoodScreen from "@/screens/PlayColorMoodScreen";
import PlayResultScreen from "@/screens/PlayResultScreen";
import PlayHistoryScreen from "@/screens/PlayHistoryScreen";
import PlaySessionDetailScreen from "@/screens/PlaySessionDetailScreen";
import DMChatScreen from "@/screens/DMChatScreen";

import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PhotoManagerScreen from "@/screens/PhotoManagerScreen";
import FlirtSettingsScreen from "@/screens/settings/FlirtSettingsScreen";
import SettingsScreen from "@/screens/SettingsScreen";
import PrivacyPolicyScreen from "@/screens/PrivacyPolicyScreen";
import LocationInfoScreen from "@/screens/LocationInfoScreen";

import { theme } from "@/theme";
import AppDrawerContent from "@/navigation/AppDrawerContent";
import { registerDrawerControls } from "@/navigation/drawerController";
import { useLocale } from "@/contexts/LocaleContext";
import {
  getDmThreadActivitySignal,
  useActivityFreshnessState,
} from "@/services/activityFreshness";
import { subscribeDmThreads, type DmThreadDoc } from "@/services/dm";

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  PhotoManager: undefined;
  FlirtSettings: undefined;
};

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen name="PhotoManager" component={PhotoManagerScreen} />
      <ProfileStack.Screen name="FlirtSettings" component={FlirtSettingsScreen} />
    </ProfileStack.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();
  const { t } = useLocale();
  const freshnessState = useActivityFreshnessState();
  const uid = auth?.currentUser?.uid ?? "";
  const [threads, setThreads] = React.useState<DmThreadDoc[]>([]);

  React.useEffect(() => {
    if (!db || !uid) {
      setThreads([]);
      return;
    }

    return subscribeDmThreads(db, uid, (next) => {
      setThreads(next);
    });
  }, [uid]);

  const freshChatsCount = React.useMemo(
    () =>
      threads.filter((thread) => {
        const signal = getDmThreadActivitySignal(thread, freshnessState.dmThreads[thread.id] ?? 0);
        return signal?.tone === "fresh";
      }).length,
    [freshnessState.dmThreads, threads]
  );

  return (
    <Tab.Navigator
      initialRouteName="Together"
      detachInactiveScreens={false}
      sceneContainerStyle={{ backgroundColor: theme.colors.background }}
      screenOptions={({ route }) => ({
        headerShown: false,
        lazy: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: "#A1A1AA",
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: "rgba(255,255,255,0.08)",
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Together: "sparkles-outline",
            Now: "flash-outline",
            Connections: "git-network-outline",
            Rooms: "home-outline",
            Inbox: "chatbubbles-outline",
          };

          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Together"
        component={PlayLobbyScreen}
        options={{
          title: t("tabs.together"),
          tabBarLabel: t("tabs.together"),
        }}
      />
      <Tab.Screen
        name="Now"
        component={NowScreen}
        options={{
          title: t("tabs.now"),
          tabBarLabel: t("tabs.now"),
        }}
      />
      <Tab.Screen
        name="Connections"
        component={ConnectionsFeedScreen}
        options={{
          title: t("tabs.connections"),
          tabBarLabel: t("tabs.connections"),
        }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          title: t("tabs.chats"),
          tabBarLabel: t("tabs.chats"),
          ...(freshChatsCount
            ? {
                tabBarBadge: freshChatsCount > 9 ? "9+" : freshChatsCount,
                tabBarBadgeStyle: {
                  backgroundColor: theme.colors.primary,
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: "800",
                },
              }
            : {}),
        }}
      />
      <Tab.Screen
        name="Rooms"
        component={RoomsScreen}
        options={{
          title: t("tabs.rooms"),
          tabBarLabel: t("tabs.rooms"),
        }}
      />

      {/* Hidden tabs */}
      <Tab.Screen
        name="VideoChat"
        component={VideoChatScreen}
        options={{ tabBarButton: () => null, headerShown: false }}
      />
      <Tab.Screen
        name="Question"
        component={QuestionScreen}
        options={{ tabBarButton: () => null }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  React.useEffect(() => {
    registerDrawerControls({
      setOpen: setDrawerOpen,
      getOpen: () => drawerOpen,
    });
  }, [drawerOpen]);

  return (
    <Drawer
      open={drawerOpen}
      onOpen={() => setDrawerOpen(true)}
      onClose={() => setDrawerOpen(false)}
      drawerType="front"
      swipeEnabled
      overlayStyle={{ backgroundColor: "transparent" }}
      drawerStyle={{ backgroundColor: "transparent", width: 300 }}
      style={{ backgroundColor: "transparent" }}
      renderDrawerContent={() => (
        <AppDrawerContent onClose={() => setDrawerOpen(false)} />
      )}
    >
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <RootStack.Screen name="Tabs" component={MainTabs} />
        <RootStack.Screen name="PlayMatch" component={PlayMatchScreen} />
        <RootStack.Screen name="PlayCanvas" component={PlayCanvasScreen} />
        <RootStack.Screen name="PlayColorMood" component={PlayColorMoodScreen} />
        <RootStack.Screen name="PlayResult" component={PlayResultScreen} />
        <RootStack.Screen name="PlayHistory" component={PlayHistoryScreen} />
        <RootStack.Screen name="PlaySessionDetail" component={PlaySessionDetailScreen} />
        <RootStack.Screen name="DMChat" component={DMChatScreen} />
        <RootStack.Screen name="Profile" component={ProfileStackNavigator} />
        <RootStack.Screen name="Settings" component={SettingsScreen} />
        <RootStack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
        <RootStack.Screen name="LocationInfo" component={LocationInfoScreen} />
      </RootStack.Navigator>
    </Drawer>
  );
}
