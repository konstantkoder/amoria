const fs = require("node:fs");
const path = require("node:path");

const EXPECTED = ["en","ru","hr","uk","pl","de","fr","es","it","pt","nl","sv","no","da","fi","cs","sk","sl","sr","bs","ro","hu","el","tr"];
const root = path.resolve(__dirname, "../src/i18n/locales");
const translationsSource = fs.readFileSync(path.resolve(__dirname, "../src/i18n/translations.ts"), "utf8");
const languageCodesBlock = translationsSource.match(/export const LANGUAGE_CODES:[^=]*=\s*\[([\s\S]*?)\];/);
const enabledCodes = languageCodesBlock ? [...languageCodesBlock[1].matchAll(/["']([a-z]{2})["']/g)].map((match) => match[1]) : [];
const localeFiles = fs.readdirSync(root).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5)).sort();
const dictionaries = Object.fromEntries(EXPECTED.map((locale) => [locale, JSON.parse(fs.readFileSync(path.join(root, `${locale}.json`), "utf8"))]));
const base = dictionaries.en;
const baseKeys = Object.keys(base);
const baseSet = new Set(baseKeys);
const intentionalSameSpelling = new Set([
  "App", "art", "Bar", "Chat", "Context", "Conversation", "Dating", "detail", "Detail",
  "Details", "Distance", "Error", "Filters", "Format", "Gold", "idea", "Lime",
  "match", "Menu", "Message", "Messages", "Name", "Normal", "Online", "Orange",
  "Panda", "Park", "Participant", "Partner", "Party", "Password", "Pause", "Privacy",
  "Radius", "Recent", "Rose", "Scam", "Sex", "Spam", "Sport", "Start", "Status",
  "Tiger", "Violet", "Wolf", "Zoom",
]);
const intentionalEnglish = /^(?:Amoria|Amoria Premium|Premium|Founder|Together|Google Play|Android|iOS|Email|OK|QR|ID|D1|D7|km|m|cm|18\+|—)$/;

function placeholders(value) {
  return [...String(value).matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

function isIntentionalExactMatch(key, value) {
  const trimmed = value.trim();
  if (intentionalEnglish.test(trimmed)) return true;
  if (key.startsWith("geo.city.") || key.startsWith("geo.country.")) return true;
  if (key === "profile.amoriaId" || key === "editProfile.birthDatePlaceholder") return true;
  if (trimmed.includes("Story Sparks")) return true;
  if (key.startsWith("time.") || key.startsWith("play.result.duration") || key.endsWith("factDuration")) return true;
  const wordsOutsidePlaceholders = trimmed
    .replace(/\{[A-Za-z0-9_]+\}/g, "")
    .replace(/[^A-Za-z]+/g, " ")
    .trim();
  if (!wordsOutsidePlaceholders) return true;
  return intentionalSameSpelling.has(wordsOutsidePlaceholders);
}

const report = {
  expectedLocales: EXPECTED,
  enabledLocales: enabledCodes,
  enabledCount: enabledCodes.length,
  localeFiles,
  baseKeyCount: baseKeys.length,
  locales: {},
};
let failed = false;
if (JSON.stringify(enabledCodes) !== JSON.stringify(EXPECTED)) failed = true;
if (JSON.stringify(localeFiles) !== JSON.stringify([...EXPECTED].sort())) failed = true;
if (!/RELEASE_LANGUAGE_CODES:[^=]*=\s*\[\.\.\.LANGUAGE_CODES\]/.test(translationsSource)) failed = true;

for (const locale of EXPECTED) {
  const dictionary = dictionaries[locale];
  const keys = Object.keys(dictionary);
  const missing = baseKeys.filter((key) => !(key in dictionary));
  const extra = keys.filter((key) => !baseSet.has(key));
  const empty = baseKeys.filter((key) => typeof dictionary[key] !== "string" || dictionary[key].trim() === "");
  const placeholderMismatches = baseKeys.filter((key) => placeholders(dictionary[key]).join("|") !== placeholders(base[key]).join("|"));
  const suspiciousEnglish = locale === "en" ? [] : baseKeys.filter((key) => {
    const value = dictionary[key];
    return value === base[key] && /[A-Za-z]{3}/.test(value) && !isIntentionalExactMatch(key, value);
  });
  report.locales[locale] = {
    keyCount: keys.length,
    missing,
    extra,
    empty,
    placeholderMismatches,
    suspiciousEnglish,
  };
  if (missing.length || extra.length || empty.length || placeholderMismatches.length || suspiciousEnglish.length) failed = true;
}

if (!base["auth.emailPlaceholder"]?.trim()) {
  failed = true;
  report.authEmailPlaceholder = "missing";
} else {
  report.authEmailPlaceholder = "present_all_24";
}
if (!dictionaries.ru["auth.emailPlaceholder"]?.trim() || dictionaries.ru["auth.emailPlaceholder"].trim().toLowerCase() === "email") {
  failed = true;
  report.authEmailPlaceholder = "russian_not_localized";
}

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (process.env.I18N_MATRIX_OUTPUT) fs.writeFileSync(path.resolve(process.env.I18N_MATRIX_OUTPUT), serialized, "utf8");
process.stdout.write(serialized);
if (failed) process.exitCode = 1;
