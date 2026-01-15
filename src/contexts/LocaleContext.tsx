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
  STORAGE_KEY,
  translate,
  type Locale,
  isLocale,
} from "@/i18n/translations";

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
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (!alive) return;
        if (stored && isLocale(stored)) {
          setLocaleState(stored);
        } else {
          setLanguagePickerVisible(true);
          setLanguagePickerMandatory(true);
        }
      } catch {
        if (alive) {
          setLanguagePickerVisible(true);
          setLanguagePickerMandatory(true);
        }
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    console.log("[i18n] locale changed:", locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setLanguagePickerVisible(false);
    setLanguagePickerMandatory(false);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
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
