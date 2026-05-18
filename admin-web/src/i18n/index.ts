import { en, type TranslationKey } from "./en";
import { ru } from "./ru";

export type { TranslationKey };

export type Language = "en" | "ru";

const LANGUAGE_STORAGE_KEY = "amoria.admin.language";

const dictionaries: Record<Language, Record<TranslationKey, string>> = {
  en,
  ru,
};

export function loadLanguage(): Language {
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return isLanguage(saved) ? saved : "en";
}

export function saveLanguage(language: Language): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export function translate(language: Language, key: TranslationKey): string {
  return dictionaries[language][key];
}

export function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ""));
}

function isLanguage(value: string | null): value is Language {
  return value === "en" || value === "ru";
}
