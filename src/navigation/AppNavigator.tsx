import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import FeedScreen from "@/screens/FeedScreen";
import NearbyScreen from "@/screens/NearbyScreen";
import NowScreen from "@/screens/NowScreen";
import QuestionScreen from "@/screens/QuestionScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PhotoManagerScreen from "@/screens/PhotoManagerScreen";
import FlirtSettingsScreen from "@/screens/settings/FlirtSettingsScreen";
import RoomsScreen from "@/screens/RoomsScreen";

import { theme } from "@/theme";

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  PhotoManager: undefined;
  FlirtSettings: undefined;
};

const Tab = createBottomTabNavigator();
const ProfileStack = createNativeStackNavigator<ProfileStackParamList>();

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

export default function AppNavigator() {
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
        // ГЛОБАЛЬНЫЙ ФОН ДЛЯ ВСЕХ СКРИНОВ
        contentStyle: { backgroundColor: theme.colors.background },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Feed: "reader-outline",
            Now: "flash-outline",
            Nearby: "location-outline",
            Rooms: "home-outline",
          };
          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: "Лента" }} />
      <Tab.Screen
        name="Now"
        component={NowScreen}
        options={{ title: "Сейчас", tabBarLabel: "СЕЙЧАС" }}
      />
      <Tab.Screen
        name="Nearby"
        component={NearbyScreen}
        options={{ title: "Рядом" }}
      />
      <Tab.Screen
        name="Rooms"
        component={RoomsScreen}
        options={{ title: "Комнаты" }}
      />
      {/* Hidden tab: keep route for Question but remove tab button */}
      <Tab.Screen
        name="Question"
        component={QuestionScreen}
        options={{
          tabBarButton: () => null,
        }}
      />
      {/* Профиль — скрытая вкладка, без кнопки в таб-баре */}
      <Tab.Screen
        name="Profile"
        component={ProfileStackNavigator}
        options={{
          headerShown: false,
          tabBarButton: () => null,
        }}
      />
    </Tab.Navigator>
  );
}
