import { ApiError } from "@/services/api/apiClient";
import { loginWithBackend, registerWithBackend } from "@/services/api/authApi";
import { getMeFromBackend } from "@/services/api/profileApi";
import {
  clearBackendSession,
  loadBackendSession,
  saveBackendSession,
  type BackendSession,
} from "@/services/api/sessionStorage";
import type {
  LoginRequest,
  RegisterRequest,
} from "@/services/api/types";

function shouldClearSessionForError(error: unknown) {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

export async function registerBackendSession(
  input: RegisterRequest
): Promise<BackendSession> {
  const response = await registerWithBackend(input);
  const session: BackendSession = {
    accessToken: response.accessToken,
    user: response.user,
  };
  await saveBackendSession(session);
  return session;
}

export async function loginBackendSession(
  input: LoginRequest
): Promise<BackendSession> {
  const response = await loginWithBackend(input);
  const session: BackendSession = {
    accessToken: response.accessToken,
    user: response.user,
  };
  await saveBackendSession(session);
  return session;
}

export async function restoreBackendSession(): Promise<BackendSession | null> {
  return loadBackendSession();
}

export async function refreshBackendUser(): Promise<BackendSession | null> {
  const currentSession = await loadBackendSession();
  if (!currentSession) return null;

  try {
    const response = await getMeFromBackend(currentSession.accessToken);
    const nextSession: BackendSession = {
      accessToken: currentSession.accessToken,
      user: response.user,
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
  await clearBackendSession();
}
