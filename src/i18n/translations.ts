import en from "./locales/en.json";
import ru from "./locales/ru.json";
import hr from "./locales/hr.json";
import uk from "./locales/uk.json";
import pl from "./locales/pl.json";
import de from "./locales/de.json";
import fr from "./locales/fr.json";
import es from "./locales/es.json";
import it from "./locales/it.json";
import pt from "./locales/pt.json";
import nl from "./locales/nl.json";
import sv from "./locales/sv.json";
import no from "./locales/no.json";
import da from "./locales/da.json";
import fi from "./locales/fi.json";
import cs from "./locales/cs.json";
import sk from "./locales/sk.json";
import sl from "./locales/sl.json";
import sr from "./locales/sr.json";
import bs from "./locales/bs.json";
import ro from "./locales/ro.json";
import hu from "./locales/hu.json";
import el from "./locales/el.json";
import tr from "./locales/tr.json";

export type Locale =
  | "en" | "ru"
  | "hr" | "uk" | "pl" | "de" | "fr" | "es" | "it" | "pt" | "nl"
  | "sv" | "no" | "da" | "fi" | "cs" | "sk" | "sl" | "sr" | "bs"
  | "ro" | "hu" | "el" | "tr";

export const DEFAULT_LOCALE: Locale = "en";
export const STORAGE_KEY = "amoria.locale";
export const LEGACY_STORAGE_KEY = "amoria_language";

let runtimeLocale: Locale = DEFAULT_LOCALE;

export function setRuntimeLocale(next: Locale) {
  runtimeLocale = getReleaseLocaleOrDefault(next);
}

export function getRuntimeLocale() {
  return runtimeLocale;
}

export const LANGUAGE_CODES: Locale[] = [
  "en","ru",
  "hr","uk","pl","de","fr","es","it","pt","nl",
  "sv","no","da","fi","cs","sk","sl","sr","bs",
  "ro","hu","el","tr",
];

export const RELEASE_LANGUAGE_CODES: Locale[] = ["en", "ru", "hr"];

export const LANGUAGE_LABELS: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  hr: "Hrvatski",
  uk: "Українська",
  pl: "Polski",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  it: "Italiano",
  pt: "Português",
  nl: "Nederlands",
  sv: "Svenska",
  no: "Norsk",
  da: "Dansk",
  fi: "Suomi",
  cs: "Čeština",
  sk: "Slovenčina",
  sl: "Slovenščina",
  sr: "Srpski",
  bs: "Bosanski",
  ro: "Română",
  hu: "Magyar",
  el: "Ελληνικά",
  tr: "Türkçe",
};

export const DICT: Record<Locale, Record<string, string>> = {
  en,
  ru,
  hr,
  uk,
  pl,
  de,
  fr,
  es,
  it,
  pt,
  nl,
  sv,
  no,
  da,
  fi,
  cs,
  sk,
  sl,
  sr,
  bs,
  ro,
  hu,
  el,
  tr,
};

export function isLocale(x: string): x is Locale {
  return (LANGUAGE_CODES as string[]).includes(x);
}

export function isReleaseLocale(x: string): x is Locale {
  return (RELEASE_LANGUAGE_CODES as string[]).includes(x);
}

export function getReleaseLocaleOrDefault(value: string | null | undefined): Locale {
  return value && isLocale(value) && isReleaseLocale(value) ? value : DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: string, params?: Record<string, string>) {
  const safeLocale = getReleaseLocaleOrDefault(locale);
  const dict = DICT[safeLocale];
  const fallback = DICT.en;
  let out = dict[key] ?? fallback[key] ?? key;

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replaceAll(`{${k}}`, String(v));
    }
  }
  return out;
}
