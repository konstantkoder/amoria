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
  saveBackendSession,
} from "@/services/api/sessionStorage";
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

type AuthContextValue = {
  ready: boolean;
  user: AuthUserDto | null;
  accessToken: string | null;
  login: (input: LoginRequest) => Promise<AuthUserDto>;
  register: (input: RegisterRequest) => Promise<AuthUserDto>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

async function persistAuthResponse(response: AuthResponse): Promise<void> {
  setAccessToken(response.accessToken);
  await setRefreshToken(response.refreshToken);
  await saveBackendSession({
    accessToken: response.accessToken,
    user: response.user,
  });
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUserDto | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const applyAuthResponse = useCallback(async (response: AuthResponse) => {
    await persistAuthResponse(response);
    setUser(response.user);
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
      setReady(false);

      try {
        const refreshToken = await getRefreshToken();
        if (!refreshToken) {
          await clearBackendSession();
          if (!alive) return;
          setUser(null);
          setAccessTokenState(null);
          setReady(true);
          return;
        }

        const response = await refreshWithBackend(refreshToken);
        if (!alive) return;
        await applyAuthResponse(response);
      } catch (error) {
        console.error("[auth] bootstrap refresh failed", error);
        await clearBackendSession();
        if (!alive) return;
        setUser(null);
        setAccessTokenState(null);
      } finally {
        if (alive) {
          setReady(true);
        }
      }
    };

    void bootstrap();

    return () => {
      alive = false;
    };
  }, [applyAuthResponse]);

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
      const response = await loginWithBackend(input);
      await applyAuthResponse(response);
      return response.user;
    },
    [applyAuthResponse]
  );

  const register = useCallback(
    async (input: RegisterRequest) => {
      const response = await registerWithBackend(input);
      await applyAuthResponse(response);
      return response.user;
    },
    [applyAuthResponse]
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
      ready,
      user,
      accessToken,
      login,
      register,
      logout,
      logoutAll,
    }),
    [accessToken, login, logout, logoutAll, ready, register, user]
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
