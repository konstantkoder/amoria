import React, { useEffect, useState } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";

import NearbyScreen from "@/screens/NearbyScreen";
import ProfileScreen from "@/screens/ProfileScreen";
import QuestionScreen from "@/screens/QuestionScreen";
import RandomChatScreen from "@/screens/RandomChatScreen";
import MatchesScreen from "@/screens/MatchesScreen";
import ChatScreen from "@/screens/ChatScreen";
import DeckScreen from "@/screens/DeckScreen";
import FlirtSettingsScreen from "@/screens/settings/FlirtSettingsScreen";

import WelcomeScreen from "@/screens/onboarding/WelcomeScreen";
import ConsentsScreen from "@/screens/onboarding/ConsentsScreen";
import PermissionsScreen from "@/screens/onboarding/PermissionsScreen";
import ProfileFormScreen from "@/screens/onboarding/ProfileFormScreen";
import PreferencesFormScreen from "@/screens/onboarding/PreferencesFormScreen";
import FinishScreen from "@/screens/onboarding/FinishScreen";

import LegalScreen from "@/screens/legal/LegalScreen";
import TermsScreen from "@/screens/legal/TermsScreen";
import EditProfileScreen from "@/screens/EditProfileScreen";
import PhotoManagerScreen from "@/screens/PhotoManagerScreen";

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: "#8A2BE2",
        tabBarInactiveTintColor: "#999",
        tabBarIcon: ({ color, size }) => {
          const name =
            route.name === "Deck"
              ? "albums-outline"
              : route.name === "Nearby"
                ? "location-outline"
                : route.name === "Matches"
                  ? "heart-outline"
                  : route.name === "Question"
                    ? "help-circle-outline"
                    : route.name === "Dialogs"
                      ? "chatbubble-ellipses-outline"
                      : "person-circle-outline";
          return <Ionicons name={name as any} color={color} size={size} />;
        },
      })}
    >
      <Tab.Screen name="Deck" component={DeckScreen} />
      <Tab.Screen name="Nearby" component={NearbyScreen} />
      <Tab.Screen name="Matches" component={MatchesScreen} />
      <Tab.Screen name="Question" component={QuestionScreen} />
      <Tab.Screen name="Dialogs" component={RandomChatScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

function OnboardingStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Consents" component={ConsentsScreen} />
      <Stack.Screen name="Permissions" component={PermissionsScreen} />
      <Stack.Screen name="ProfileForm" component={ProfileFormScreen} />
      <Stack.Screen name="PreferencesForm" component={PreferencesFormScreen} />
      <Stack.Screen name="Finish" component={FinishScreen} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="PhotoManager" component={PhotoManagerScreen} />
    </Stack.Navigator>
  );
}

// Important: App.tsx already wraps this navigator with the root container.
export default function AppNavigator() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);

  useEffect(() => {
    (async () => {
      const flag = await AsyncStorage.getItem("onboarded");
      setOnboarded(!!flag);
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  return (
    <Stack.Navigator
      screenOptions={{ headerShown: false }}
      initialRouteName={onboarded ? "MainTabs" : "Onboarding"}
    >
      <Stack.Screen name="Onboarding" component={OnboardingStack} />
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="Legal" component={LegalScreen} />
      <Stack.Screen name="Terms" component={TermsScreen} />
      <Stack.Screen name="EditProfile" component={EditProfileScreen} />
      <Stack.Screen name="PhotoManager" component={PhotoManagerScreen} />
      <Stack.Screen name="FlirtSettings" component={FlirtSettingsScreen} />
      <Stack.Screen name="Chat" component={ChatScreen} />
    </Stack.Navigator>
  );
}
