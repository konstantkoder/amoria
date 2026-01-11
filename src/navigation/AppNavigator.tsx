import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Drawer } from "react-native-drawer-layout";

import FeedScreen from "@/screens/FeedScreen";
import NearbyScreen from "@/screens/NearbyScreen";
import NowScreen from "@/screens/NowScreen";
import RoomsScreen from "@/screens/RoomsScreen";
import InboxScreen from "@/screens/InboxScreen";
import VideoChatScreen from "@/screens/VideoChatScreen";
import QuestionScreen from "@/screens/QuestionScreen";

import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PhotoManagerScreen from "@/screens/PhotoManagerScreen";
import FlirtSettingsScreen from "@/screens/settings/FlirtSettingsScreen";

import { theme } from "@/theme";
import AppDrawerContent from "@/navigation/AppDrawerContent";
import { registerDrawerControls } from "@/navigation/drawerController";
import ScreenBackground from "@/components/ScreenBackground";

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

  return (
    <Tab.Navigator
      initialRouteName="Feed"
      sceneContainerStyle={{ backgroundColor: "transparent" }}
      screenOptions={({ route }) => ({
        headerShown: false,
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
            Feed: "reader-outline",
            Now: "flash-outline",
            Nearby: "location-outline",
            Rooms: "home-outline",
            Inbox: "chatbubbles-outline",
          };

          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Feed"
        component={FeedScreen}
        options={{ title: "Лента", tabBarLabel: "Лента" }}
      />
      <Tab.Screen
        name="Now"
        component={NowScreen}
        options={{ title: "Сейчас", tabBarLabel: "Сейчас" }}
      />
      <Tab.Screen
        name="Nearby"
        component={NearbyScreen}
        options={{ title: "Объявления", tabBarLabel: "Объявления" }}
      />
      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{ title: "Чаты", tabBarLabel: "Чаты" }}
      />
      <Tab.Screen
        name="Rooms"
        component={RoomsScreen}
        options={{ title: "Комнаты", tabBarLabel: "Комнаты" }}
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
      drawerType="slide"
      swipeEnabled
      overlayStyle={{ backgroundColor: "rgba(0,0,0,0.55)" }}
      drawerStyle={{ backgroundColor: "transparent", width: 300 }}
      style={{ backgroundColor: "transparent" }}
      renderDrawerContent={() => (
        <ScreenBackground variant="menu" overlayOpacity={0.35} blurRadius={5}>
          <AppDrawerContent onClose={() => setDrawerOpen(false)} />
        </ScreenBackground>
      )}
    >
      <RootStack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <RootStack.Screen name="Tabs" component={MainTabs} />
        <RootStack.Screen name="Profile" component={ProfileStackNavigator} />
      </RootStack.Navigator>
    </Drawer>
  );
}
