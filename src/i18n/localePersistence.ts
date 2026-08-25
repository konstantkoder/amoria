import {
  DEFAULT_LOCALE,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  isLocale,
  isReleaseLocale,
  type Locale,
} from "./translations";

export type LocaleStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
};

export async function loadPersistedLocale(storage: LocaleStorage): Promise<{
  locale: Locale;
  shouldPrompt: boolean;
}> {
  try {
    const stored = await storage.getItem(STORAGE_KEY);
    if (stored && isLocale(stored) && isReleaseLocale(stored)) {
      return { locale: stored, shouldPrompt: false };
    }
    if (stored) return { locale: DEFAULT_LOCALE, shouldPrompt: true };

    const legacy = await storage.getItem(LEGACY_STORAGE_KEY);
    if (legacy && isLocale(legacy) && isReleaseLocale(legacy)) {
      await storage.setItem(STORAGE_KEY, legacy);
      return { locale: legacy, shouldPrompt: false };
    }
    return { locale: DEFAULT_LOCALE, shouldPrompt: true };
  } catch {
    return { locale: DEFAULT_LOCALE, shouldPrompt: true };
  }
}

export function persistSelectedLocale(storage: LocaleStorage, locale: Locale): Promise<unknown> {
  return storage.setItem(STORAGE_KEY, locale);
}
