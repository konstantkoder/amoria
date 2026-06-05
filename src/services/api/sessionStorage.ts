import {
  getAccessToken,
  setAccessToken,
  setRefreshToken,
} from "@/services/session/tokenStore";
import type { AuthUserDto } from "@/services/api/types";

export type BackendSession = {
  accessToken: string;
  user: AuthUserDto;
};

let currentBackendSession: BackendSession | null = null;
let currentBackendSessionSavedAtMs = 0;

export async function saveBackendSession(session: BackendSession): Promise<void> {
  setAccessToken(session.accessToken);
  currentBackendSession = session;
  currentBackendSessionSavedAtMs = Date.now();
}

export async function loadBackendSession(): Promise<BackendSession | null> {
  const accessToken = getAccessToken();
  if (!accessToken || !currentBackendSession) return null;
  if (currentBackendSession.accessToken !== accessToken) {
    currentBackendSession = {
      ...currentBackendSession,
      accessToken,
    };
  }

  return currentBackendSession;
}

export function getBackendSessionUser(): AuthUserDto | null {
  return currentBackendSession?.user ?? null;
}

export function getBackendUserId(): string {
  return currentBackendSession?.user.id ?? "";
}

export function getBackendSessionSavedAtMs(): number {
  return currentBackendSession ? currentBackendSessionSavedAtMs : 0;
}

export async function clearBackendSession(): Promise<void> {
  currentBackendSession = null;
  currentBackendSessionSavedAtMs = 0;
  setAccessToken(null);
  await setRefreshToken(null);
}

export async function getBackendAccessToken(): Promise<string | null> {
  return getAccessToken();
}
