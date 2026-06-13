import "react-native-gesture-handler";
import "react-native-reanimated";

import React from "react";
import { ActivityIndicator, AppState, LogBox, Platform, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import {
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from "@react-navigation/native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as NavigationBar from "expo-navigation-bar";

import LoginScreen from "@/screens/LoginScreen";
import AppNavigator from "@/navigation/AppNavigator";
import { type AppStackParamList } from "@/navigation/appRoutes";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { LocaleProvider, useLocale } from "@/contexts/LocaleContext";
import { theme } from "@/theme/theme";
import ErrorBoundary from "@/components/ErrorBoundary";
import LanguagePickerHost from "@/components/LanguagePickerHost";
import {
  markStartupEvent,
  markStartupTimingFromStart,
} from "@/services/startupDiagnostics";

markStartupEvent("app.module_loaded");

LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53.",
  "`expo-notifications` functionality is not fully supported in Expo Go",
  "Looks like you have nested a 'NavigationContainer' inside another.",
]);

const Stack = createNativeStackNavigator<AppStackParamList>();
const navigationRef = createNavigationContainerRef<AppStackParamList>();
const ANDROID_NAV_HIDDEN_ROUTES = new Set([
  "Tabs",
  "Together",
  "Nearby",
  "Inbox",
  "PlayMatch",
  "PlayCanvas",
  "PlayStorySparks",
  "PlayResult",
  "PlayHistory",
  "PlaySessionDetail",
]);
const ANDROID_NAV_VISIBLE_ROUTES = new Set([
  "Login",
  "Profile",
  "ProfileMain",
  "EditProfile",
  "PhotoManager",
  "UserProfile",
  "DMChat",
  "Settings",
  "PrivacyPolicy",
  "LocationInfo",
  "CreateAnnouncement",
  "AnnouncementDetail",
]);

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

function getFocusedRouteNames(state: any): string[] {
  const activeRoute = state?.routes?.[state?.index ?? 0];
  if (!activeRoute?.name) return [];
  return [
    activeRoute.name,
    ...getFocusedRouteNames(activeRoute.state),
  ];
}

function shouldHideAndroidNavigationBar(state: any, isSignedIn: boolean) {
  if (!isSignedIn) return false;

  const routeNames = getFocusedRouteNames(state);
  if (routeNames.some((name) => ANDROID_NAV_VISIBLE_ROUTES.has(name))) {
    return false;
  }
  return routeNames.some((name) => ANDROID_NAV_HIDDEN_ROUTES.has(name));
}

function setAndroidNavigationBarHidden(hidden: boolean) {
  if (Platform.OS !== "android") return;

  void NavigationBar.setVisibilityAsync(hidden ? "hidden" : "visible").catch(() => {});
}

type AppNavigationProps = {
  isSignedIn: boolean;
};

function AppNavigation({ isSignedIn }: AppNavigationProps) {
  const lastAndroidNavHiddenRef = React.useRef<boolean | null>(null);

  const syncAndroidNavigationBar = React.useCallback(() => {
    if (Platform.OS !== "android" || !navigationRef.isReady()) return;

    const hidden = shouldHideAndroidNavigationBar(navigationRef.getRootState(), isSignedIn);
    if (lastAndroidNavHiddenRef.current === hidden) return;
    lastAndroidNavHiddenRef.current = hidden;
    setAndroidNavigationBarHidden(hidden);
  }, [isSignedIn]);

  React.useEffect(() => {
    syncAndroidNavigationBar();
  }, [syncAndroidNavigationBar]);

  React.useEffect(() => {
    if (Platform.OS !== "android") return undefined;

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        lastAndroidNavHiddenRef.current = null;
        syncAndroidNavigationBar();
      }
    });
    return () => subscription.remove();
  }, [syncAndroidNavigationBar]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        (globalThis as any).__NAV = navigationRef;
        markStartupTimingFromStart("first_screen.ready", { signedIn: isSignedIn });
        syncAndroidNavigationBar();
      }}
      onStateChange={syncAndroidNavigationBar}
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
            {() => <LoginScreen />}
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
  const { ready, user } = useAuth();

  return (
    <>
      {!ready ? (
        <FullScreenLoader />
      ) : (
        <>
          <ErrorBoundary>
            <AppNavigation isSignedIn={Boolean(user)} />
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
      {!ready ? (
        <FullScreenLoader />
      ) : (
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      )}
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
