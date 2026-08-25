import type { Locale } from "@/i18n/translations";

export type CountTranslationBase =
  | "compatibility.badgeCount"
  | "nearby.rooms.members";

export type CountForm = "one" | "two" | "few" | "many" | "other";

export function getCountForm(locale: Locale, count: number): CountForm {
  const value = Math.max(0, Math.floor(count));

  const category = new Intl.PluralRules(locale).select(value);
  return category === "one" || category === "two" || category === "few" || category === "many"
    ? category
    : "other";
}

export function getCountTranslationKey(
  base: CountTranslationBase,
  locale: Locale,
  count: number
) {
  return `${base}.${getCountForm(locale, count)}`;
}

export function formatLocalizedCount(
  t: (key: string, params?: Record<string, string>) => string,
  locale: Locale,
  base: CountTranslationBase,
  count: number
) {
  const value = Math.max(0, Math.floor(count));
  return t(getCountTranslationKey(base, locale, value), { count: new Intl.NumberFormat(locale).format(value) });
}

export function buildNearbyFilterSummaryLabels(
  radiusLabel: string,
  genderLabel: string,
  ageLabel: string
) {
  return [radiusLabel, genderLabel, ageLabel].map((label) => label.trim()).filter(Boolean);
}
