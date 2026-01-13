import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

import LanguagePickerModal from "@/components/LanguagePickerModal";
import {
  LANGUAGE_CODES,
  LANGUAGE_OPTIONS,
  type LanguageCode,
  type TranslationKey,
  translations,
} from "@/i18n/translations";

export type Locale = LanguageCode;
export const supportedLanguages = LANGUAGE_OPTIONS;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  ready: boolean;
  openLanguagePicker: (opts?: { force?: boolean }) => void;
  closeLanguagePicker: () => void;
  t: (key: TranslationKey, params?: Record<string, string>) => string;
};

const STORAGE_KEY = "amoria_language";
const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);
const languageSet = new Set<string>(LANGUAGE_CODES);
const DEFAULT_LOCALE: Locale = "ru";
const isSupportedLocale = (value: string | null): value is Locale =>
  !!value && languageSet.has(value);
const replaceAll = (value: string, search: string, replacement: string) =>
  value.split(search).join(replacement);

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
        if (isSupportedLocale(stored)) {
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

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    setLanguagePickerVisible(false);
    setLanguagePickerMandatory(false);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: Record<string, string>) => {
      const dict = translations[locale] ?? translations.en;
      let s = dict[key] ?? translations.en[key] ?? String(key);
      if (params) {
        for (const k in params) {
          s = replaceAll(s, `{${k}}`, params[k]);
        }
      }
      return s;
    },
    [locale],
  );

  const openLanguagePicker = useCallback((opts?: { force?: boolean }) => {
    setLanguagePickerVisible(true);
    if (opts?.force) {
      setLanguagePickerMandatory(true);
    }
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
    }),
    [locale, setLocale, ready, openLanguagePicker, closeLanguagePicker, t],
  );

  return (
    <LocaleContext.Provider value={value}>
      {children}
      <LanguagePickerModal
        visible={languagePickerVisible}
        current={locale}
        languages={supportedLanguages}
        onSelect={setLocale}
        onClose={closeLanguagePicker}
        mandatory={languagePickerMandatory}
      />
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error("useLocale must be used within a LocaleProvider");
  }
  return context;
}
