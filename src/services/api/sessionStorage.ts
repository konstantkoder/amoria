import AsyncStorage from "@react-native-async-storage/async-storage";

import type { AuthUserDto } from "@/services/api/types";

const BACKEND_SESSION_STORAGE_KEY = "amoria.backend.session.v1";

export type BackendSession = {
  accessToken: string;
  user: AuthUserDto;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function isValidAuthUser(value: unknown): value is AuthUserDto {
  if (!isRecord(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isNonEmptyString(value.email)) return false;
  if (!isNonEmptyString(value.displayName)) return false;
  if (!isNonEmptyString(value.amoriaId)) return false;
  if (
    value.avatarUrl != null &&
    typeof value.avatarUrl !== "string"
  ) {
    return false;
  }

  return true;
}

function isValidBackendSession(value: unknown): value is BackendSession {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.accessToken) && isValidAuthUser(value.user);
}

async function removeStoredBackendSession() {
  await AsyncStorage.removeItem(BACKEND_SESSION_STORAGE_KEY);
}

export async function saveBackendSession(session: BackendSession): Promise<void> {
  await AsyncStorage.setItem(
    BACKEND_SESSION_STORAGE_KEY,
    JSON.stringify(session)
  );
}

export async function loadBackendSession(): Promise<BackendSession | null> {
  const storedValue = await AsyncStorage.getItem(BACKEND_SESSION_STORAGE_KEY);
  if (!storedValue) return null;

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(storedValue);
  } catch {
    await removeStoredBackendSession();
    return null;
  }

  if (!isValidBackendSession(parsedValue)) {
    await removeStoredBackendSession();
    return null;
  }

  return parsedValue;
}

export async function clearBackendSession(): Promise<void> {
  await removeStoredBackendSession();
}

export async function getBackendAccessToken(): Promise<string | null> {
  const session = await loadBackendSession();
  return session?.accessToken ?? null;
}
