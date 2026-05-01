import "react-native-gesture-handler";
import "react-native-reanimated";

import React, { useEffect, useState } from "react";
import { ActivityIndicator, DeviceEventEmitter, LogBox, View } from "react-native";
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
import {
  refreshBackendUser,
  restoreBackendSession,
} from "@/services/api/backendSession";
import type { BackendSession } from "@/services/api/sessionStorage";
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

const AUTH_SESSION_CHANGED_EVENT = "amoria.authSessionChanged";

type AuthenticatedUserState =
  | { source: "firebase"; user: User }
  | { source: "backend"; session: BackendSession }
  | null;

type AppNavigationProps = {
  authState: AuthenticatedUserState;
  authError: string | null;
  onBackendAuthenticated: (session: BackendSession) => void;
};

function AppNavigation({
  authState,
  authError,
  onBackendAuthenticated,
}: AppNavigationProps) {
  const isSignedIn = Boolean(authState);

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
            {() => (
              <LoginScreen
                authError={authError}
                onAuthenticated={onBackendAuthenticated}
              />
            )}
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
  const [authState, setAuthState] = useState<AuthenticatedUserState>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleBackendAuthenticated = React.useCallback((session: BackendSession) => {
    setAuthState({ source: "backend", session });
    setAuthError(null);
    setAuthReady(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribeFirebase: (() => void) | undefined;

    const startFirebaseFallback = () => {
      if (cancelled) return;

      if (!auth) {
        setAuthState(null);
        setAuthError(null);
        setAuthReady(true);
        return;
      }

      unsubscribeFirebase = onAuthStateChanged(
        auth,
        (firebaseUser) => {
          if (cancelled) return;

          if (!firebaseUser) {
            setAuthState((current) => (
              current?.source === "backend" ? current : null
            ));
            setAuthError(null);
            setAuthReady(true);
            return;
          }

          void ensureCurrentUserProfile()
            .catch((error) => {
              console.error("[auth] profile sync failed", error);
            })
            .finally(() => {
              if (cancelled) return;
              setAuthState((current) => (
                current?.source === "backend"
                  ? current
                  : { source: "firebase", user: firebaseUser }
              ));
              setAuthError(null);
              setAuthReady(true);
            });
        },
        (error) => {
          if (cancelled) return;
          const authStateError = error as { code?: unknown; message?: unknown };
          console.error("[auth] onAuthStateChanged failed", {
            code: typeof authStateError?.code === "string" ? authStateError.code : "unknown",
            message:
              typeof authStateError?.message === "string"
                ? authStateError.message
                : "Unknown auth state error",
          });
          setAuthState(null);
          setAuthError("auth.error");
          setAuthReady(true);
        }
      );
    };

    const bootstrapAuth = async () => {
      setAuthReady(false);
      setAuthError(null);

      let cachedBackendSession: BackendSession | null = null;
      try {
        cachedBackendSession = await restoreBackendSession();
        const backendSession = await refreshBackendUser();
        if (cancelled) return;

        if (backendSession) {
          setAuthState({ source: "backend", session: backendSession });
          setAuthError(null);
          setAuthReady(true);
          return;
        }

        startFirebaseFallback();
      } catch (error) {
        if (cancelled) return;
        console.error("[auth] backend session refresh failed", error);
        setAuthState(null);
        setAuthError(cachedBackendSession ? "auth.networkError" : "auth.error");
        setAuthReady(true);
      }
    };

    const authSessionSubscription = DeviceEventEmitter.addListener(
      AUTH_SESSION_CHANGED_EVENT,
      (event?: { signedIn?: boolean }) => {
        if (event?.signedIn === false) {
          setAuthState(null);
          setAuthError(null);
          setAuthReady(true);
        }
      }
    );

    void bootstrapAuth();

    return () => {
      cancelled = true;
      unsubscribeFirebase?.();
      authSessionSubscription.remove();
    };
  }, []);

  return (
    <>
      {!authReady ? (
        <FullScreenLoader />
      ) : (
        <>
          <ErrorBoundary>
            <AppNavigation
              authState={authState}
              authError={authError}
              onBackendAuthenticated={handleBackendAuthenticated}
            />
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
