import "react-native-gesture-handler";
import "react-native-reanimated";

import React, { useEffect, useState } from "react";
import { ActivityIndicator, LogBox } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import {
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onAuthStateChanged, User } from "firebase/auth";

import { auth } from "@/config/firebaseConfig";
import LoginScreen from "@/screens/LoginScreen";
import AppNavigator from "@/navigation/AppNavigator";
import DMChatScreen from "@/screens/DMChatScreen";
import LegalScreen from "@/screens/legal/LegalScreen";
import { LocaleProvider } from "@/contexts/LocaleContext";
import { theme } from "@/theme/theme";

LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53.",
  "`expo-notifications` functionality is not fully supported in Expo Go",
  "Looks like you have nested a 'NavigationContainer' inside another.",
]);

const Stack = createNativeStackNavigator();
const navigationRef = createNavigationContainerRef();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: theme.colors.background,
    card: theme.colors.background,
    text: theme.colors.text,
    border: "rgba(255,255,255,0.08)",
    primary: theme.colors.primary,
  },
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(false);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!authEnabled || !auth) {
      setInitializing(false);
      return;
    }

    setInitializing(true);
    setAuthError(null);

    const unsub = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        setUser(firebaseUser);
        setInitializing(false);
      },
      (error) => {
        console.error("[auth] onAuthStateChanged failed", error);
        setUser(null);
        setAuthError(error?.message ?? "Ошибка авторизации");
        setInitializing(false);
      }
    );
    return unsub;
  }, [authEnabled]);

  if (initializing) {
    return (
      <GestureHandlerRootView
        style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LocaleProvider>
        <NavigationContainer
          ref={navigationRef}
          theme={navTheme}
          onReady={() => {
            (globalThis as any).__NAV = navigationRef;
          }}
        >
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {user ? (
              <>
                <Stack.Screen name="Root" component={AppNavigator} />
                <Stack.Screen name="DM" component={DMChatScreen} />
                <Stack.Screen name="Legal" component={LegalScreen} />
              </>
            ) : (
              <Stack.Screen name="Login">
                {() => (
                  <LoginScreen
                    onAuthStart={() => setAuthEnabled(true)}
                    authError={authError}
                  />
                )}
              </Stack.Screen>
            )}
          </Stack.Navigator>
        </NavigationContainer>
      </LocaleProvider>
    </GestureHandlerRootView>
  );
}
