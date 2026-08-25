import { apiRequest } from "@/services/api/apiClient";
import type { Locale } from "@/i18n/translations";

export function updatePreferredLocale(locale: Locale): Promise<{ preferredLocale: Locale }> {
  return apiRequest("/me/locale", { method: "PUT", body: { locale } });
}
