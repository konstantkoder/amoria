// Run: npx tsx scripts/i18n-make-review-pack.ts
import { spawnSync } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";

const CSV_LOCALES = [
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

const PREFIXES = ["auth.", "drawer.", "tabs."];
const HIGH_RISK_KEYS = [
  "voiceIntro.subtitle",
  "now.promptSubtitle",
  "now.placeholder",
  "chats.empty",
  "feed.previewSubtitle",
  "feed.adultModeHint",
  "ads.textPlaceholder",
  "ads.filterTitle",
  "feed.answerPlaceholder",
  "legal.privacy.title",
  "legal.privacy.body",
];

const ROOT_DIR = process.cwd();
const LOCALES_DIR = path.join(ROOT_DIR, "src", "i18n", "locales");
const CSV_PATH = path.join(ROOT_DIR, "i18n_core_review.csv");
const PACK_DIR = path.join(ROOT_DIR, "i18n_review_pack");
const ZIP_PATH = path.join(ROOT_DIR, "i18n_review_pack.zip");

type LocaleData = Record<string, unknown>;

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

const pathExists = async (targetPath: string): Promise<boolean> => {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const ensureDir = async (dirPath: string): Promise<void> => {
  await fs.mkdir(dirPath, { recursive: true });
};

const readLocale = async (locale: string): Promise<LocaleData> => {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  if (!(await pathExists(filePath))) {
    return {};
  }
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as LocaleData;
};

const escapePowerShellPath = (value: string): string => value.replace(/'/g, "''");

const buildCsv = async (localeData: Map<string, LocaleData>): Promise<void> => {
  const keys = new Set<string>();
  for (const data of localeData.values()) {
    for (const key of Object.keys(data)) {
      if (PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.add(key);
      }
    }
  }

  for (const key of HIGH_RISK_KEYS) {
    for (const data of localeData.values()) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        keys.add(key);
        break;
      }
    }
  }

  const sortedKeys = Array.from(keys).sort((a, b) => a.localeCompare(b));
  const lines: string[] = [];
  lines.push(["key", ...CSV_LOCALES].map(escapeCsv).join(","));

  for (const key of sortedKeys) {
    const row: string[] = [key];
    for (const locale of CSV_LOCALES) {
      const data = localeData.get(locale) ?? {};
      const value = Object.prototype.hasOwnProperty.call(data, key)
        ? valueToString(data[key])
        : "";
      row.push(value);
    }
    lines.push(row.map(escapeCsv).join(","));
  }

  await fs.writeFile(CSV_PATH, `${lines.join("\n")}\n`, "utf8");
};

const copyFileToPack = async (sourcePath: string): Promise<void> => {
  const relativePath = path.relative(ROOT_DIR, sourcePath);
  const destinationPath = path.join(PACK_DIR, relativePath);
  await ensureDir(path.dirname(destinationPath));
  await fs.copyFile(sourcePath, destinationPath);
};

const buildPackFolder = async (): Promise<void> => {
  await fs.rm(PACK_DIR, { recursive: true, force: true });
  await ensureDir(PACK_DIR);

  const localeFiles = (await fs.readdir(LOCALES_DIR))
    .filter((file) => file.endsWith(".json"))
    .map((file) => path.join(LOCALES_DIR, file));

  for (const filePath of localeFiles) {
    await copyFileToPack(filePath);
  }

  await copyFileToPack(CSV_PATH);

  const lqaFiles = ["lqa.txt", "lqa_after.txt", "lqa_after2.txt"];
  for (const file of lqaFiles) {
    const lqaPath = path.join(ROOT_DIR, file);
    if (await pathExists(lqaPath)) {
      await copyFileToPack(lqaPath);
    }
  }
};

const buildZipOnWindows = async (): Promise<void> => {
  if (process.platform !== "win32") {
    return;
  }

  await fs.rm(ZIP_PATH, { force: true });

  const escapedPackDir = escapePowerShellPath(PACK_DIR);
  const escapedZipPath = escapePowerShellPath(ZIP_PATH);
  const command = `Compress-Archive -Path '${escapedPackDir}' -DestinationPath '${escapedZipPath}' -Force`;
  const result = spawnSync("powershell", ["-NoProfile", "-NonInteractive", "-Command", command], {
    stdio: "inherit",
  });

  if (result.status !== 0) {
    throw new Error("Compress-Archive failed. Zip was not created.");
  }
};

const main = async (): Promise<void> => {
  const localeData = new Map<string, LocaleData>();
  for (const locale of CSV_LOCALES) {
    localeData.set(locale, await readLocale(locale));
  }

  await buildCsv(localeData);
  await buildPackFolder();
  await buildZipOnWindows();

  if (process.platform !== "win32") {
    console.log("Non-win32 platform detected. Created i18n_review_pack/ folder only.");
  } else {
    console.log("Created i18n_review_pack.zip.");
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
