import * as SecureStore from "expo-secure-store";

const REFRESH_TOKEN_KEY = "amoria.refreshToken.v1";

let accessToken: string | null = null;

function normalizeToken(token: string | null | undefined) {
  const value = String(token ?? "").trim();
  return value ? value : null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = normalizeToken(token);
}

export async function getRefreshToken(): Promise<string | null> {
  return normalizeToken(await SecureStore.getItemAsync(REFRESH_TOKEN_KEY));
}

export async function setRefreshToken(token: string | null): Promise<void> {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    return;
  }

  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, normalizedToken);
}
