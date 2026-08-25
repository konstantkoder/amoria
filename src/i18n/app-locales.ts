export const APP_LOCALES = [
  "en", "ru", "hr", "uk", "pl", "de", "fr", "es", "it", "pt", "nl", "sv",
  "no", "da", "fi", "cs", "sk", "sl", "sr", "bs", "ro", "hu", "el", "tr",
] as const;

export type AppLocale = (typeof APP_LOCALES)[number];

const localeSet = new Set<string>(APP_LOCALES);

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && localeSet.has(value);
}

/** Accepts exact app codes and ordinary BCP-47 region variants; unknown values fall back to English. */
export function normalizeAppLocale(value: unknown): AppLocale {
  if (typeof value !== "string") return "en";
  const language = value.trim().toLowerCase().split(/[-_]/, 1)[0];
  return isAppLocale(language) ? language : "en";
}

