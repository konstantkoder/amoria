import { promises as fs } from "fs";
import * as path from "path";

type LocaleData = Record<string, unknown>;

const ROOT_DIR = process.cwd();
const LOCALES_DIR = path.join(ROOT_DIR, "src", "i18n", "locales");
const OUTPUT_PATH = path.join(ROOT_DIR, "i18n_stats.json");

const LOCALES = [
  "en",
  "ru",
  "hr",
  "uk",
  "bs",
  "cs",
  "da",
  "de",
  "el",
  "es",
  "fi",
  "fr",
  "hu",
  "it",
  "nl",
  "no",
  "pl",
  "pt",
  "ro",
  "sk",
  "sl",
  "sr",
  "sv",
  "tr",
];

const valueToString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  return JSON.stringify(value);
};

const extractPlaceholders = (value: string): string[] => {
  const matches = value.match(/\{[^}]+\}/g);
  if (!matches) {
    return [];
  }
  return Array.from(new Set(matches)).sort((a, b) => a.localeCompare(b));
};

const countNewlines = (value: string): number => {
  if (!value) {
    return 0;
  }
  return value.split("\n").length - 1;
};

const readLocale = async (locale: string): Promise<LocaleData> => {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as LocaleData;
  } catch {
    return {};
  }
};

const main = async (): Promise<void> => {
  const localeData = new Map<string, LocaleData>();
  for (const locale of LOCALES) {
    localeData.set(locale, await readLocale(locale));
  }

  const enData = localeData.get("en") ?? {};
  const baseKeys = Object.keys(enData);
  const baseKeySet = new Set(baseKeys);

  const stats: Record<string, unknown> = {};

  for (const locale of LOCALES) {
    const data = localeData.get(locale) ?? {};
    const localeKeys = Object.keys(data);
    const localeKeySet = new Set(localeKeys);

    const missing = baseKeys.filter((key) => !localeKeySet.has(key));
    const extra = localeKeys.filter((key) => !baseKeySet.has(key));

    let placeholderMismatches = 0;
    let newlineDiffs = 0;
    let totalLength = 0;
    let lengthCount = 0;
    let maxLength = 0;
    let maxLengthKey = "";
    let cyrillicKeys = 0;
    let cyrillicSampleKey = "";

    for (const key of baseKeys) {
      if (!localeKeySet.has(key)) {
        continue;
      }
      const baseValue = valueToString(enData[key]);
      const localeValue = valueToString(data[key]);

      const basePlaceholders = extractPlaceholders(baseValue);
      const localePlaceholders = extractPlaceholders(localeValue);
      if (
        basePlaceholders.length !== localePlaceholders.length ||
        basePlaceholders.some((value, idx) => value !== localePlaceholders[idx])
      ) {
        placeholderMismatches += 1;
      }

      if (countNewlines(baseValue) !== countNewlines(localeValue)) {
        newlineDiffs += 1;
      }

      const length = localeValue.length;
      totalLength += length;
      lengthCount += 1;
      if (length > maxLength) {
        maxLength = length;
        maxLengthKey = key;
      }

      if (locale !== "ru" && locale !== "uk") {
        if (/[\u0400-\u04FF]/.test(localeValue)) {
          cyrillicKeys += 1;
          if (!cyrillicSampleKey) {
            cyrillicSampleKey = key;
          }
        }
      }
    }

    const averageLength = lengthCount === 0 ? 0 : totalLength / lengthCount;

    stats[locale] = {
      total_keys: localeKeys.length,
      missing: missing.length,
      extra: extra.length,
      placeholder_mismatches: placeholderMismatches,
      newline_diffs: newlineDiffs,
      max_length: {
        key: maxLengthKey,
        length: maxLength,
      },
      average_length: Number(averageLength.toFixed(2)),
      cyrillic_keys: cyrillicKeys,
      cyrillic_sample_key: cyrillicSampleKey,
    };
  }

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(stats, null, 2)}\n`, "utf8");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
