import type { Locale } from "@/i18n/translations";

export type CountTranslationBase =
  | "compatibility.badgeCount"
  | "nearby.rooms.members";

export type CountForm = "one" | "few" | "many" | "other";

export function getCountForm(locale: Locale, count: number): CountForm {
  const value = Math.max(0, Math.floor(count));

  if (locale !== "ru" && locale !== "hr") {
    return value === 1 ? "one" : "other";
  }

  const lastTwo = value % 100;
  const last = value % 10;
  if (last === 1 && lastTwo !== 11) return "one";
  if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return "few";
  return "many";
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
  return t(getCountTranslationKey(base, locale, value), { count: String(value) });
}

export function buildNearbyFilterSummaryLabels(
  radiusLabel: string,
  genderLabel: string,
  ageLabel: string
) {
  return [radiusLabel, genderLabel, ageLabel].map((label) => label.trim()).filter(Boolean);
}
