import { promises as fs } from "fs";
import * as path from "path";

type UsageEntry = { file: string; line: number; snippet: string };
type UsageMap = Record<string, UsageEntry[]>;

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, "src");
const OUTPUT_PATH = path.join(ROOT_DIR, "i18n_key_usage.json");
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx"]);

const usagePattern =
  /(?:\bt\s*\(|\bi18n\.t\s*\(|\bi18next\.t\s*\(|useTranslation\(\)\.t\s*\()\s*(['"`])([^'"`]+)\1/g;

const normalizePath = (filePath: string): string =>
  path.relative(ROOT_DIR, filePath).split(path.sep).join("/");

const buildLineStarts = (content: string): number[] => {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
};

const findLineNumber = (starts: number[], index: number): number => {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (starts[mid] <= index) {
      if (mid === starts.length - 1 || starts[mid + 1] > index) {
        return mid + 1;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return 1;
};

const isValidKeyLiteral = (quote: string, key: string): boolean => {
  if (!key) {
    return false;
  }
  if (quote === "`" && key.includes("${")) {
    return false;
  }
  return true;
};

const walkFiles = async (dir: string, acc: string[] = []): Promise<string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(fullPath, acc);
    } else if (EXTENSIONS.has(path.extname(entry.name))) {
      acc.push(fullPath);
    }
  }
  return acc;
};

const main = async (): Promise<void> => {
  const files = await walkFiles(SRC_DIR);
  const usage: UsageMap = {};

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    const lineStarts = buildLineStarts(content);

    for (const match of content.matchAll(usagePattern)) {
      const quote = match[1];
      const key = match[2];
      if (!isValidKeyLiteral(quote, key)) {
        continue;
      }
      const index = match.index ?? 0;
      const lineNumber = findLineNumber(lineStarts, index);
      const snippet = (lines[lineNumber - 1] ?? "").trim();
      const entry: UsageEntry = {
        file: normalizePath(file),
        line: lineNumber,
        snippet,
      };
      if (!usage[key]) {
        usage[key] = [];
      }
      usage[key].push(entry);
    }
  }

  for (const entries of Object.values(usage)) {
    entries.sort((a, b) =>
      a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
    );
  }

  const ordered: UsageMap = {};
  for (const key of Object.keys(usage).sort((a, b) => a.localeCompare(b))) {
    ordered[key] = usage[key];
  }

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(ordered, null, 2)}\n`, "utf8");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
