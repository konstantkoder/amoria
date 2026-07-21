const {
  buildNearbyFilterSummaryLabels,
  formatLocalizedCount,
  getCountForm,
} = require("../src/services/localizedCounts.ts") as typeof import("../src/services/localizedCounts");

const dictionaries = {
  en: require("../src/i18n/locales/en.json"),
  ru: require("../src/i18n/locales/ru.json"),
  hr: require("../src/i18n/locales/hr.json"),
} as const;

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function translator(locale: keyof typeof dictionaries) {
  return (key: string, params?: Record<string, string>) => {
    let value = dictionaries[locale][key as keyof (typeof dictionaries)[typeof locale]] ?? key;
    for (const [param, replacement] of Object.entries(params ?? {})) {
      value = value.replace(new RegExp(`\\{${param}\\}`, "g"), replacement);
    }
    return value;
  };
}

const counts = [0, 1, 2, 4, 5, 11, 21];
const expectedForms = {
  en: ["other", "one", "other", "other", "other", "other", "other"],
  ru: ["many", "one", "few", "few", "many", "many", "one"],
  hr: ["many", "one", "few", "few", "many", "many", "one"],
} as const;

for (const locale of ["en", "ru", "hr"] as const) {
  counts.forEach((count, index) => {
    assert(
      getCountForm(locale, count) === expectedForms[locale][index],
      `${locale} selects the correct form for ${count}`
    );

    for (const base of ["compatibility.badgeCount", "nearby.rooms.members"] as const) {
      const formatted = formatLocalizedCount(translator(locale), locale, base, count);
      assert(formatted.startsWith(String(count)), `${locale} ${base} includes ${count}`);
      assert(!formatted.includes("{"), `${locale} ${base} resolves its count placeholder`);
      assert(!formatted.includes(base), `${locale} ${base} resolves its translation key`);
    }
  });
}

assert(
  formatLocalizedCount(translator("en"), "en", "compatibility.badgeCount", 1) === "1 match",
  "English compatibility singular is grammatical"
);
assert(
  formatLocalizedCount(translator("en"), "en", "nearby.rooms.members", 1) === "1 member",
  "English member singular is grammatical"
);
assert(
  JSON.stringify(
    buildNearbyFilterSummaryLabels("250 km", "Svi i ostali korisnici", "Od 25 do 34 godine")
  ) === JSON.stringify(["250 km", "Svi i ostali korisnici", "Od 25 do 34 godine"]),
  "filter summary preserves every selected value without ellipsis"
);
