import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createDrawerNavigator } from "@react-navigation/drawer";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FeedScreen from "@/screens/FeedScreen";
import NearbyScreen from "@/screens/NearbyScreen";
import NowScreen from "@/screens/NowScreen";
import VideoChatScreen from "@/screens/VideoChatScreen";
import QuestionScreen from "@/screens/QuestionScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PhotoManagerScreen from "@/screens/PhotoManagerScreen";
import FlirtSettingsScreen from "@/screens/settings/FlirtSettingsScreen";
import RoomsScreen from "@/screens/RoomsScreen";
import InboxScreen from "@/screens/InboxScreen";

import { theme } from "@/theme";
import AppDrawerContent from "@/navigation/AppDrawerContent";

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  PhotoManager: undefined;
  FlirtSettings: undefined;
};

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();
const Drawer = createDrawerNavigator();

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStack.Screen name="ProfileMain" component={ProfileScreen} />
      <ProfileStack.Screen name="EditProfile" component={EditProfileScreen} />
      <ProfileStack.Screen
        name="PhotoManager"
        component={PhotoManagerScreen}
      />
      <ProfileStack.Screen
        name="FlirtSettings"
        component={FlirtSettingsScreen}
      />
    </ProfileStack.Navigator>
  );
}

function MainTabs() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
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
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: "Лента" }} />

      <Tab.Screen
        name="Nearby"
        component={NearbyScreen}
        options={{
          title: "Объявления",
          tabBarLabel: "Объявления",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="megaphone-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Now"
        component={NowScreen}
        options={{ title: "Сейчас", tabBarLabel: "СЕЙЧАС" }}
      />

      <Tab.Screen
        name="Inbox"
        component={InboxScreen}
        options={{
          title: "Чаты",
          tabBarLabel: "Чаты",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles-outline" size={size} color={color} />
          ),
        }}
      />

      <Tab.Screen
        name="Rooms"
        component={RoomsScreen}
        options={{ title: "Комнаты" }}
      />

      <Tab.Screen
        name="VideoChat"
        component={VideoChatScreen}
        options={{
          tabBarButton: () => null,
          headerShown: false,
        }}
      />

      {/* Question — скрытая вкладка, без кнопки в таб-баре */}
      <Tab.Screen
        name="Question"
        component={QuestionScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  return (
    <Drawer.Navigator
      screenOptions={{
        headerShown: false,
        drawerType: "slide",
        overlayColor: "transparent",
        drawerStyle: { backgroundColor: "transparent", width: 300 },
      }}
      drawerContent={(props) => <AppDrawerContent {...props} />}
    >
      <Drawer.Screen name="Tabs" component={MainTabs} />
      <Drawer.Screen name="Profile" component={ProfileStackNavigator} />
    </Drawer.Navigator>
  );
}
