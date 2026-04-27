import "react-native-gesture-handler";
import "react-native-reanimated";

import React, { useEffect, useState } from "react";
import { ActivityIndicator, LogBox, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { onAuthStateChanged, type User } from "firebase/auth";

import { auth } from "@/config/firebaseConfig";
import LoginScreen from "@/screens/LoginScreen";
import AppNavigator from "@/navigation/AppNavigator";
import { type AppStackParamList } from "@/navigation/appRoutes";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import { ensureCurrentUserProfile } from "@/services/user";
import { theme } from "@/theme/theme";
import ErrorBoundary from "@/components/ErrorBoundary";
import LanguagePickerHost from "@/components/LanguagePickerHost";

LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53.",
  "`expo-notifications` functionality is not fully supported in Expo Go",
  "Looks like you have nested a 'NavigationContainer' inside another.",
]);

const Stack = createNativeStackNavigator<AppStackParamList>();
const navigationRef = createNavigationContainerRef<AppStackParamList>();

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

type AppNavigationProps = {
  user: User | null;
  authError: string | null;
};

function AppNavigation({ user, authError }: AppNavigationProps) {
  const isSignedIn = Boolean(user);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        (globalThis as any).__NAV = navigationRef;
      }}
    >
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isSignedIn ? (
          <Stack.Screen
            name="Root"
            component={AppNavigator}
            navigationKey="user"
          />
        ) : (
          <Stack.Screen name="Login" navigationKey="guest">
            {() => <LoginScreen authError={authError} />}
          </Stack.Screen>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

function FullScreenLoader() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator color={theme.colors.primary} />
    </View>
  );
}

function AuthGate() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!auth);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (!auth) {
      setUser(null);
      setAuthError(null);
      setAuthReady(true);
      return;
    }

    setAuthReady(false);
    setAuthError(null);

    const unsub = onAuthStateChanged(
      auth,
      (firebaseUser) => {
        if (!firebaseUser) {
          setUser(null);
          setAuthError(null);
          setAuthReady(true);
          return;
        }

        void ensureCurrentUserProfile()
          .catch((error) => {
            console.error("[auth] profile sync failed", error);
          })
          .finally(() => {
            setUser(firebaseUser);
            setAuthError(null);
            setAuthReady(true);
          });
      },
      (error) => {
        const authStateError = error as { code?: unknown; message?: unknown };
        console.error("[auth] onAuthStateChanged failed", {
          code: typeof authStateError?.code === "string" ? authStateError.code : "unknown",
          message:
            typeof authStateError?.message === "string"
              ? authStateError.message
              : "Unknown auth state error",
        });
        setUser(null);
        setAuthError("auth.error");
        setAuthReady(true);
      }
    );
    return unsub;
  }, []);

  return (
    <>
      {!authReady ? (
        <FullScreenLoader />
      ) : (
        <>
          <ErrorBoundary>
            <AppNavigation user={user} authError={authError} />
          </ErrorBoundary>
          <LanguagePickerHost />
        </>
      )}
    </>
  );
}

function AppBootstrap() {
  const { ready } = useLocale();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      {!ready ? <FullScreenLoader /> : <AuthGate />}
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <KeyboardProvider
      statusBarTranslucent={false}
      navigationBarTranslucent={false}
    >
      <SafeAreaProvider>
        <LocaleProvider>
          <AppBootstrap />
        </LocaleProvider>
      </SafeAreaProvider>
    </KeyboardProvider>
  );
}
