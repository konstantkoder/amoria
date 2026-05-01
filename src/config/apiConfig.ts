export function getApiBaseUrl(): string {
  const apiUrl = String(process.env.EXPO_PUBLIC_API_URL ?? "").trim();

  if (!apiUrl) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not configured. Set EXPO_PUBLIC_API_URL in the Expo environment before calling the backend API."
    );
  }

  return apiUrl.replace(/\/+$/, "");
}
