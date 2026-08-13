import "react-native-gesture-handler";
import "react-native-reanimated";

import React from "react";
import { AppState, LogBox, Platform } from "react-native";
import type { AppStateStatus } from "react-native";
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
import StartupScreen from "@/components/StartupScreen";
import {
  markStartupEvent,
  markStartupTimingFromStart,
} from "@/services/startupDiagnostics";
import {
  type ClientErrorReportInput,
  reportClientError,
  sanitizeErrorForReport,
} from "@/services/api/clientErrorsApi";
import * as notificationsApi from "@/services/api/notificationsApi";
import {
  Notifications,
  subscribePushTokenChanges,
  syncPushTokenIfGranted,
} from "@/services/notifications";

markStartupEvent("app.module_loaded");

LogBox.ignoreLogs([
  "expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53.",
  "`expo-notifications` functionality is not fully supported in Expo Go",
  "Looks like you have nested a 'NavigationContainer' inside another.",
]);

const Stack = createNativeStackNavigator<AppStackParamList>();
const navigationRef = createNavigationContainerRef<AppStackParamList>();
let pendingPushData: Record<string, unknown> | null = null;

function routePushData(data: Record<string, unknown>) {
  if (!getSafeNavigationReady()) {
    pendingPushData = data;
    return;
  }
  const type = typeof data.type === "string" ? data.type : "";
  if (!new Set(["direct_message", "together_match", "together_action", "announcement"]).has(type)) return;
  const screen = type === "direct_message" ? "Inbox" : type === "announcement" ? "Nearby" : "Together";
  navigationRef.navigate("Root", { screen: "Tabs", params: { screen } });
  const notificationId = typeof data.notificationId === "string" ? data.notificationId : "";
  if (notificationId) void notificationsApi.markNotificationRead(notificationId).catch(() => undefined);
}

function flushPendingPushData() {
  if (!pendingPushData) return;
  const data = pendingPushData;
  pendingPushData = null;
  routePushData(data);
}
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
let reportedAndroidNavigationBarNativeFailure = false;

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

function getFocusedRouteNames(state: any, depth = 0): string[] {
  try {
    if (!state || depth > 8 || !Array.isArray(state.routes)) return [];
    const index = Number.isInteger(state.index) ? state.index : 0;
    const activeRoute = state.routes[index] ?? state.routes[0];
    if (!activeRoute?.name || typeof activeRoute.name !== "string") return [];
    return [
      activeRoute.name,
      ...getFocusedRouteNames(activeRoute.state, depth + 1),
    ];
  } catch {
    return [];
  }
}

function getSafeNavigationReady() {
  try {
    return navigationRef.isReady();
  } catch {
    return false;
  }
}

function getSafeRouteNames() {
  try {
    if (!getSafeNavigationReady()) return [];
    return getFocusedRouteNames(navigationRef.getRootState());
  } catch {
    return [];
  }
}

function getSafeAppMetadata(
  isSignedIn: boolean,
  metadata: Record<string, unknown> = {}
) {
  const navigationReady = getSafeNavigationReady();
  return {
    platform: Platform.OS,
    isSignedIn,
    navigationReady,
    routeNames: navigationReady ? getSafeRouteNames() : [],
    ...metadata,
  };
}

function reportAppClientError(input: ClientErrorReportInput) {
  try {
    void reportClientError(input).catch(() => undefined);
  } catch {
    // Reporting must never be able to crash lifecycle or error-boundary paths.
  }
}

function reportAppError(
  action: string,
  step: string,
  error: unknown,
  metadata: Record<string, unknown>
) {
  try {
    const safeError = sanitizeErrorForReport(error);
    reportAppClientError({
      screen: "App",
      action,
      step,
      code: safeError.code,
      message: safeError.message,
      stack: safeError.stack,
      metadata,
    });
  } catch {
    // Keep app-level guards non-throwing.
  }
}

function reportAppLifecycleEvent(
  eventName: string,
  metadata: Record<string, unknown>
) {
  try {
    reportAppClientError({
      screen: "App",
      action: "appLifecycle",
      step: eventName,
      message: `App lifecycle event: ${eventName}`,
      metadata,
    });
  } catch {
    // Lifecycle breadcrumbs are diagnostic only.
  }
}

function shouldHideAndroidNavigationBar(state: any, isSignedIn: boolean) {
  if (!isSignedIn) return false;

  const routeNames = getFocusedRouteNames(state);
  if (routeNames.some((name) => ANDROID_NAV_VISIBLE_ROUTES.has(name))) {
    return false;
  }
  return routeNames.some((name) => ANDROID_NAV_HIDDEN_ROUTES.has(name));
}

function setAndroidNavigationBarHidden(
  hidden: boolean,
  metadata: Record<string, unknown>
) {
  if (Platform.OS !== "android") return;

  void NavigationBar.setVisibilityAsync(hidden ? "hidden" : "visible").catch((error) => {
    if (reportedAndroidNavigationBarNativeFailure) return;
    reportedAndroidNavigationBarNativeFailure = true;
    reportAppError("syncAndroidNavigationBar", "setVisibilityAsyncFailed", error, {
      ...metadata,
      requestedHidden: hidden,
    });
  });
}

type AppNavigationProps = {
  isSignedIn: boolean;
};

function AppNavigation({ isSignedIn }: AppNavigationProps) {
  const lastAndroidNavHiddenRef = React.useRef<boolean | null>(null);
  const previousAppStateRef = React.useRef<AppStateStatus>(AppState.currentState);

  const syncAndroidNavigationBar = React.useCallback(() => {
    try {
      if (Platform.OS !== "android" || !getSafeNavigationReady()) return;

      const hidden = shouldHideAndroidNavigationBar(navigationRef.getRootState(), isSignedIn);
      if (lastAndroidNavHiddenRef.current === hidden) return;
      lastAndroidNavHiddenRef.current = hidden;
      setAndroidNavigationBarHidden(
        hidden,
        getSafeAppMetadata(isSignedIn, { requestedHidden: hidden })
      );
    } catch (error) {
      reportAppError(
        "syncAndroidNavigationBar",
        "failed",
        error,
        getSafeAppMetadata(isSignedIn)
      );
    }
  }, [isSignedIn]);

  React.useEffect(() => {
    syncAndroidNavigationBar();
  }, [syncAndroidNavigationBar]);

  React.useEffect(() => {
    if (Platform.OS !== "android") return undefined;

    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = previousAppStateRef.current;
      previousAppStateRef.current = nextState;
      const leavingActive =
        previousState === "active" &&
        (nextState === "background" || nextState === "inactive");
      const returningActive =
        (previousState === "background" || previousState === "inactive") &&
        nextState === "active";

      if (leavingActive || returningActive) {
        reportAppLifecycleEvent(
          returningActive ? "resumeActive" : "leaveActive",
          getSafeAppMetadata(isSignedIn, { previousState, nextState })
        );
      }

      if (nextState === "active") {
        try {
          lastAndroidNavHiddenRef.current = null;
          syncAndroidNavigationBar();
        } catch (error) {
          reportAppError(
            "appStateChange",
            "resumeSyncFailed",
            error,
            getSafeAppMetadata(isSignedIn, { previousState, nextState })
          );
        }
      }
    });
    return () => subscription.remove();
  }, [isSignedIn, syncAndroidNavigationBar]);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navTheme}
      onReady={() => {
        (globalThis as any).__NAV = navigationRef;
        markStartupTimingFromStart("first_screen.ready", { signedIn: isSignedIn });
        syncAndroidNavigationBar();
        if (isSignedIn) flushPendingPushData();
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

function AuthGate() {
  const { ready, user, startupState, retryStartup } = useAuth();
  const isSignedIn = Boolean(user);
  React.useEffect(() => {
    if (!isSignedIn) return undefined;
    void syncPushTokenIfGranted().catch(() => undefined);
    const tokenSubscription = subscribePushTokenChanges();
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      routePushData(response.notification.request.content.data);
      void Notifications.clearLastNotificationResponseAsync().catch(() => undefined);
    });
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      routePushData(response.notification.request.content.data);
      return Notifications.clearLastNotificationResponseAsync();
    }).catch(() => undefined);
    return () => {
      tokenSubscription.remove();
      responseSubscription.remove();
    };
  }, [isSignedIn]);
  const handleErrorBoundaryError = React.useCallback(
    (error: Error) => {
      reportAppError(
        "errorBoundary",
        "componentDidCatch",
        error,
        getSafeAppMetadata(isSignedIn)
      );
    },
    [isSignedIn]
  );

  return (
    <>
      {!ready ? (
        <StartupScreen
          recovery={startupState === "recoverable_error"}
          onRetry={retryStartup}
        />
      ) : (
        <>
          <ErrorBoundary onError={handleErrorBoundaryError}>
            <AppNavigation isSignedIn={isSignedIn} />
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
        <StartupScreen />
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
