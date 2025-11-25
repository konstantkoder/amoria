import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";

import FeedScreen from "../screens/FeedScreen";
import NearbyScreen from "../screens/NearbyScreen";
import QuestionScreen from "../screens/QuestionScreen";
import RandomChatScreen from "../screens/RandomChatScreen";
import ProfileScreen from "../screens/ProfileScreen";

import { theme } from "../theme/theme";

const Tab = createBottomTabNavigator();

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: "#A1A1AA",
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: "rgba(255,255,255,0.08)",
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        // ГЛОБАЛЬНЫЙ ФОН ДЛЯ ВСЕХ СКРИНОВ
        contentStyle: { backgroundColor: theme.colors.background },
        tabBarIcon: ({ color, size }) => {
          const map: Record<string, keyof typeof Ionicons.glyphMap> = {
            Feed: "reader-outline",
            Nearby: "location-outline",
            Question: "help-circle-outline",
            RandomChat: "chatbubble-ellipses-outline",
            Profile: "person-circle-outline",
          };
          const name = map[route.name] ?? "ellipse-outline";
          return <Ionicons name={name} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Feed" component={FeedScreen} options={{ title: "Feed" }} />
      <Tab.Screen name="Nearby" component={NearbyScreen} options={{ title: "Nearby" }} />
      <Tab.Screen name="Question" component={QuestionScreen} options={{ title: "Question" }} />
      <Tab.Screen name="RandomChat" component={RandomChatScreen} options={{ title: "Chat" }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: "Profile" }} />
    </Tab.Navigator>
  );
}
