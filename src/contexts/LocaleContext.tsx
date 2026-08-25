import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  DEFAULT_LOCALE,
  getReleaseLocaleOrDefault,
  setRuntimeLocale,
  translate,
  type Locale,
  isReleaseLocale,
} from "@/i18n/translations";
import { loadPersistedLocale, persistSelectedLocale } from "@/i18n/localePersistence";
import { startStartupSpan } from "@/services/startupDiagnostics";
import { getAccessToken } from "@/services/session/tokenStore";
import { updatePreferredLocale } from "@/services/api/localeApi";
import { syncPushTokenIfGranted } from "@/services/notifications";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  ready: boolean;
  openLanguagePicker: () => void;
  closeLanguagePicker: () => void;
  t: (key: string, params?: Record<string, string>) => string;
  languagePickerVisible: boolean;
  languagePickerMandatory: boolean;
};

export const LocaleContext = createContext<LocaleContextValue | undefined>(
  undefined,
);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [ready, setReady] = useState(false);
  const [languagePickerVisible, setLanguagePickerVisible] = useState(false);
  const [languagePickerMandatory, setLanguagePickerMandatory] = useState(false);

  useEffect(() => {
    let alive = true;
    const finishLocaleReady = startStartupSpan("locale.ready");
    (async () => {
      let nextLocale = DEFAULT_LOCALE;
      let shouldPrompt = false;
      try {
        const persisted = await loadPersistedLocale(AsyncStorage);
        if (!alive) return;
        nextLocale = persisted.locale;
        shouldPrompt = persisted.shouldPrompt;
      } catch {
        if (alive) {
          shouldPrompt = true;
        }
      } finally {
        if (!alive) return;
        setLocaleState(nextLocale);
        setLanguagePickerVisible(shouldPrompt);
        setLanguagePickerMandatory(shouldPrompt);
        setReady(true);
        finishLocaleReady({
          locale: nextLocale,
          prompted: shouldPrompt,
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    setRuntimeLocale(locale);
    if (ready && getAccessToken()) {
      void updatePreferredLocale(locale).catch(() => undefined);
      void syncPushTokenIfGranted().catch(() => undefined);
    }
  }, [locale, ready]);

  useEffect(() => {
    if (!ready || languagePickerMandatory) return;
    persistSelectedLocale(AsyncStorage, locale).catch(() => {});
  }, [locale, ready, languagePickerMandatory]);

  const setLocale = useCallback((next: Locale) => {
    const releaseLocale = getReleaseLocaleOrDefault(next);
    setLocaleState(releaseLocale);
    setLanguagePickerVisible(!isReleaseLocale(next));
    setLanguagePickerMandatory(!isReleaseLocale(next));
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string>) =>
      translate(locale, key, params),
    [locale],
  );

  const openLanguagePicker = useCallback(() => {
    setLanguagePickerVisible(true);
    setLanguagePickerMandatory(false);
  }, []);

  const closeLanguagePicker = useCallback(() => {
    if (languagePickerMandatory) return;
    setLanguagePickerVisible(false);
  }, [languagePickerMandatory]);

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      ready,
      openLanguagePicker,
      closeLanguagePicker,
      t,
      languagePickerVisible,
      languagePickerMandatory,
    }),
    [
      locale,
      setLocale,
      ready,
      openLanguagePicker,
      closeLanguagePicker,
      t,
      languagePickerVisible,
      languagePickerMandatory,
    ],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}
