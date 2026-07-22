import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { DeviceEventEmitter } from "react-native";

import {
  login as loginWithBackend,
  logout as logoutWithBackend,
  logoutAll as logoutAllWithBackend,
  refresh as refreshWithBackend,
  register as registerWithBackend,
} from "@/services/api/authApi";
import {
  clearBackendSession,
  loadBackendSession,
  saveBackendSession,
} from "@/services/api/sessionStorage";
import { mergeAuthUserWithStoredProfile } from "@/services/authProfileMerge";
import {
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setRefreshToken,
} from "@/services/session/tokenStore";
import {
  AUTH_SESSION_CHANGED_EVENT,
  type AuthSessionChangedEvent,
} from "@/services/session/authEvents";
import type {
  AuthResponse,
  AuthUserDto,
  LoginRequest,
  RegisterRequest,
} from "@/services/api/types";
import {
  safeStartupErrorMetadata,
  startStartupSpan,
} from "@/services/startupDiagnostics";
import {
  classifyRefreshFailure,
  isAuthBootstrapReady,
  type AuthBootstrapState,
} from "@/services/authBootstrapState";

type AuthContextValue = {
  ready: boolean;
  user: AuthUserDto | null;
  accessToken: string | null;
  startupState: AuthBootstrapState;
  retryStartup: () => void;
  login: (input: LoginRequest) => Promise<AuthUserDto>;
  register: (input: RegisterRequest) => Promise<AuthUserDto>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistAuthResponse(response: AuthResponse): Promise<AuthUserDto> {
  setAccessToken(response.accessToken);
  await setRefreshToken(response.refreshToken);
  const storedSession = await loadBackendSession();
  const mergedUser = mergeAuthUserWithStoredProfile(storedSession?.user, response.user);
  await saveBackendSession({
    accessToken: response.accessToken,
    user: mergedUser,
  });
  return mergedUser;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [startupState, setStartupState] = useState<AuthBootstrapState>("loading");
  const [bootstrapAttempt, setBootstrapAttempt] = useState(0);
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    const mergedUser = await persistAuthResponse(response);
    setUser(mergedUser);
    setAccessTokenState(response.accessToken);
  }, []);

  const clearSessionState = useCallback(async () => {
    await clearBackendSession();
    setUser(null);
    setAccessTokenState(null);
  }, []);

  useEffect(() => {
    let alive = true;

    const bootstrap = async () => {
      const finishAuthBootstrap = startStartupSpan("auth.bootstrap");
      let outcome = "guest";
      setStartupState("loading");

      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          await clearBackendSession();
          if (!alive) return;
          setUser(null);
          setAccessTokenState(null);
          setStartupState("guest");
          finishAuthBootstrap({ outcome, signedIn: false });
          return;
        }

        const finishAuthRefresh = startStartupSpan("auth.refresh");
        let response: AuthResponse;
        let refreshOutcome = "success";
        try {
          response = await refreshWithBackend(refreshToken);
        } catch (error) {
          refreshOutcome = "error";
          throw error;
        } finally {
          finishAuthRefresh({ outcome: refreshOutcome });
        }
        if (!alive) return;
        await applyAuthResponse(response);
        outcome = "signed_in";
        if (alive) setStartupState("authenticated");
      } catch (error) {
        const failureState = classifyRefreshFailure(error);
        outcome = failureState === "guest" ? "refresh_invalid" : "refresh_recoverable";
        // Keep sanitized diagnostics in Metro without raising a user-visible LogBox overlay.
        console.log("[auth] bootstrap refresh failed", safeStartupErrorMetadata(error));
        if (failureState === "guest") {
          await clearBackendSession();
        }
        if (!alive) return;
        setUser(null);
        setAccessTokenState(null);
        setStartupState(failureState);
      } finally {
        if (alive) {
          finishAuthBootstrap({ outcome, signedIn: outcome === "signed_in" });
        }
      }
    };

    void bootstrap();

    return () => {
      alive = false;
    };
  }, [applyAuthResponse, bootstrapAttempt]);

  const retryStartup = useCallback(() => {
    setBootstrapAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      AUTH_SESSION_CHANGED_EVENT,
      (event?: AuthSessionChangedEvent) => {
        if (event?.authResponse) {
          void applyAuthResponse(event.authResponse);
          return;
        }

        if (event?.signedIn === false) {
          void clearSessionState();
        }
      }
    );

    return () => {
      subscription.remove();
    };
  }, [applyAuthResponse, clearSessionState]);

  const login = useCallback(
    async (input: LoginRequest) => {
      await clearSessionState();
      const response = await loginWithBackend(input);
      await applyAuthResponse(response);
      return response.user;
    },
    [applyAuthResponse, clearSessionState]
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      await clearSessionState();
      const response = await registerWithBackend(input);
      await applyAuthResponse(response);
      return response.user;
    },
    [applyAuthResponse, clearSessionState]
  );

  const logout = useCallback(async () => {
    const refreshToken = await getRefreshToken();
    let logoutError: unknown = null;

    try {
      if (refreshToken) {
        await logoutWithBackend(refreshToken);
      }
    } catch (error) {
      logoutError = error;
    } finally {
      await clearSessionState();
    }

    if (logoutError) {
      throw logoutError;
    }
  }, [clearSessionState]);

  const logoutAll = useCallback(async () => {
    let logoutError: unknown = null;

    try {
      if (getAccessToken()) {
        await logoutAllWithBackend();
      }
    } catch (error) {
      logoutError = error;
    } finally {
      await clearSessionState();
    }

    if (logoutError) {
      throw logoutError;
    }
  }, [clearSessionState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready: isAuthBootstrapReady(startupState),
      user,
      accessToken,
      startupState,
      retryStartup,
      login,
      register,
      logout,
      logoutAll,
    }),
    [accessToken, login, logout, logoutAll, register, retryStartup, startupState, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return value;
}
