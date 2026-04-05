import { promises as fs } from "fs";
import * as path from "path";

type LocaleData = Record<string, unknown>;

const ROOT_DIR = process.cwd();
const LOCALES_DIR = path.join(ROOT_DIR, "src", "i18n", "locales");
const OUTPUT_PATH = path.join(ROOT_DIR, "i18n_export_long.csv");

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

const escapeCsv = (value: string): string => {
  let escaped = value;
  if (escaped.includes("\"")) {
    escaped = escaped.replace(/\"/g, "\"\"");
  }
  if (/[\",\r\n]/.test(escaped) || /^\s|\s$/.test(escaped)) {
    return `"${escaped}"`;
  }
  return escaped;
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
  const keys = Object.keys(enData).sort((a, b) => a.localeCompare(b));

  const header = [
    "key",
    ...LOCALES,
    ...LOCALES.map((locale) => `len_${locale}`),
    "placeholders_ok",
    ...LOCALES.map((locale) => `newline_count_${locale}`),
    "notes",
  ];

  const lines: string[] = [];
  lines.push(header.map(escapeCsv).join(","));

  for (const key of keys) {
    const rowValues: string[] = [key];
    const lengthValues: string[] = [];
    const newlineValues: string[] = [];
    const notes: string[] = [];

    const enValue = valueToString(enData[key]);
    const enPlaceholders = extractPlaceholders(enValue);
    const enNewlines = countNewlines(enValue);

    let placeholdersOk = true;

    for (const locale of LOCALES) {
      const data = localeData.get(locale) ?? {};
      const rawValue = Object.prototype.hasOwnProperty.call(data, key)
        ? valueToString(data[key])
        : "";
      rowValues.push(rawValue);

      const length = rawValue.length;
      lengthValues.push(String(length));
      newlineValues.push(String(countNewlines(rawValue)));

      if (!Object.prototype.hasOwnProperty.call(data, key)) {
        notes.push(`missing:${locale}`);
        placeholdersOk = false;
        continue;
      }

      const localePlaceholders = extractPlaceholders(rawValue);
      if (
        localePlaceholders.length !== enPlaceholders.length ||
        localePlaceholders.some((value, idx) => value !== enPlaceholders[idx])
      ) {
        notes.push(`placeholder_mismatch:${locale}`);
        placeholdersOk = false;
      }

      const localeNewlines = countNewlines(rawValue);
      if (localeNewlines !== enNewlines) {
        notes.push(`newline_diff:${locale}`);
      }
    }

    const row = [
      ...rowValues,
      ...lengthValues,
      placeholdersOk ? "true" : "false",
      ...newlineValues,
      notes.join("; "),
    ];
    lines.push(row.map(escapeCsv).join(","));
  }

  await fs.writeFile(OUTPUT_PATH, `${lines.join("\n")}\n`, "utf8");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
