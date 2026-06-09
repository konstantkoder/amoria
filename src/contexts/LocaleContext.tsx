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
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  getReleaseLocaleOrDefault,
  setRuntimeLocale,
  translate,
  type Locale,
  isLocale,
  isReleaseLocale,
} from "@/i18n/translations";
import { startStartupSpan } from "@/services/startupDiagnostics";

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
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!alive) return;
        if (stored && isLocale(stored)) {
          if (isReleaseLocale(stored)) {
            nextLocale = stored;
          } else {
            shouldPrompt = true;
          }
        } else {
          const legacy = await AsyncStorage.getItem(LEGACY_STORAGE_KEY);
          if (!alive) return;
          if (legacy && isLocale(legacy) && isReleaseLocale(legacy)) {
            nextLocale = legacy;
            await AsyncStorage.setItem(STORAGE_KEY, legacy);
          } else {
            shouldPrompt = true;
          }
        }
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
  }, [locale]);

  useEffect(() => {
    if (!ready || languagePickerMandatory) return;
    AsyncStorage.setItem(STORAGE_KEY, locale).catch(() => {});
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
