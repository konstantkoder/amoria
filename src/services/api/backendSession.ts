import { ApiError, refreshSession } from "@/services/api/apiClient";
import {
  loginWithBackend,
  logout,
  registerWithBackend,
} from "@/services/api/authApi";
import { getMeFromBackend } from "@/services/api/profileApi";
import {
  clearBackendSession,
  getBackendAccessToken,
  getBackendSessionSavedAtMs,
  loadBackendSession,
  saveBackendSession,
  type BackendSession,
} from "@/services/api/sessionStorage";
import {
  getRefreshToken,
  setRefreshToken,
} from "@/services/session/tokenStore";
import type {
  AuthResponse,
  LoginRequest,
  RegisterRequest,
} from "@/services/api/types";
import { markStartupEvent } from "@/services/startupDiagnostics";

const STARTUP_PROFILE_SESSION_CACHE_MS = 15 * 1000;

type RefreshBackendUserOptions = {
  allowCached?: boolean;
};

let refreshBackendUserPromise: Promise<BackendSession | null> | null = null;

function shouldClearSessionForError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

async function saveAuthResponse(response: AuthResponse): Promise<BackendSession> {
  await setRefreshToken(response.refreshToken);
  const session: BackendSession = {
    accessToken: response.accessToken,
    user: response.user,
  };
  await saveBackendSession(session);
  return session;
}

export async function registerBackendSession(
  input: RegisterRequest
): Promise<BackendSession> {
  const response = await registerWithBackend(input);
  return saveAuthResponse(response);
}

export async function loginBackendSession(
  input: LoginRequest
): Promise<BackendSession> {
  const response = await loginWithBackend(input);
  return saveAuthResponse(response);
}

export async function restoreBackendSession(): Promise<BackendSession | null> {
  return loadBackendSession();
}

async function loadFreshCachedBackendSession(): Promise<BackendSession | null> {
  const session = await loadBackendSession();
  if (!session) return null;

  const savedAtMs = getBackendSessionSavedAtMs();
  if (!savedAtMs || Date.now() - savedAtMs > STARTUP_PROFILE_SESSION_CACHE_MS) {
    return null;
  }

  markStartupEvent("profile.cached_session_reused");
  return session;
}

async function refreshBackendUserFromNetwork(): Promise<BackendSession | null> {
  const currentAccessToken = await getBackendAccessToken();
  const currentRefreshToken = await getRefreshToken();
  if (!currentAccessToken && !currentRefreshToken) return null;

  try {
    if (!currentAccessToken) {
      const refreshedSession = await refreshSession();
      return saveAuthResponse(refreshedSession);
    }

    const user = await getMeFromBackend();
    const accessToken = await getBackendAccessToken();
    if (!accessToken) return null;

    const nextSession: BackendSession = {
      accessToken,
      user,
    };
    await saveBackendSession(nextSession);
    return nextSession;
  } catch (error) {
    if (shouldClearSessionForError(error)) {
      await clearBackendSession();
      return null;
    }

    throw error;
  }
}

export async function refreshBackendUser(
  options: RefreshBackendUserOptions = {}
): Promise<BackendSession | null> {
  if (options.allowCached !== false) {
    const cachedSession = await loadFreshCachedBackendSession();
    if (cachedSession) return cachedSession;
  }

  if (!refreshBackendUserPromise) {
    refreshBackendUserPromise = refreshBackendUserFromNetwork()
      .finally(() => {
        refreshBackendUserPromise = null;
      });
  } else {
    markStartupEvent("profile.refresh_reused_in_flight");
  }

  return refreshBackendUserPromise;
}

export async function logoutBackendSession(): Promise<void> {
  const refreshToken = await getRefreshToken();
  let logoutError: unknown = null;

  try {
    if (refreshToken) {
      await logout(refreshToken);
    }
  } catch (error) {
    logoutError = error;
  } finally {
    await clearBackendSession();
  }

  if (logoutError) {
    throw logoutError;
  }
}
