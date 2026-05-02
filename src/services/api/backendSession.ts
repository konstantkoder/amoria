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

export async function refreshBackendUser(): Promise<BackendSession | null> {
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
