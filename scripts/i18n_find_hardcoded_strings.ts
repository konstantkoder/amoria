import { promises as fs } from "fs";
import * as path from "path";

type HardcodedEntry = {
  file: string;
  line: number;
  string: string;
  snippet: string;
};

const ROOT_DIR = process.cwd();
const SRC_DIR = path.join(ROOT_DIR, "src");
const OUTPUT_PATH = path.join(ROOT_DIR, "i18n_hardcoded_strings.json");
const EXTENSIONS = new Set([".ts", ".tsx"]);

const textNodePattern = /<Text[^>]*>([\s\S]*?)<\/Text>/g;
const alertPattern =
  /Alert\.alert\(\s*(['"`])([^'"`]+)\1(?:\s*,\s*(['"`])([^'"`]+)\3)?/g;
const attrPattern = /\b(?:placeholder|title)\s*=\s*(['"`])([^'"`]+)\1/g;

const letterPattern = /[\p{L}]/u;
const hexColorPattern = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

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

const isCandidate = (value: string): boolean => {
  const trimmed = value.trim();
  if (trimmed.length < 3) {
    return false;
  }
  if (!letterPattern.test(trimmed)) {
    return false;
  }
  if (hexColorPattern.test(trimmed)) {
    return false;
  }
  if (/^https?:\/\//i.test(trimmed)) {
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

const pushEntry = (
  entries: HardcodedEntry[],
  file: string,
  line: number,
  value: string,
  snippet: string,
): void => {
  if (!isCandidate(value)) {
    return;
  }
  entries.push({
    file: normalizePath(file),
    line,
    string: value.trim(),
    snippet,
  });
};

const extractTextNodes = (
  content: string,
  file: string,
  lines: string[],
  lineStarts: number[],
  entries: HardcodedEntry[],
): void => {
  for (const match of content.matchAll(textNodePattern)) {
    const raw = match[1];
    if (!raw) {
      continue;
    }
    if (/[{}<]/.test(raw)) {
      continue;
    }
    const text = raw.replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }
    const index = match.index ?? 0;
    const lineNumber = findLineNumber(lineStarts, index);
    const snippet = (lines[lineNumber - 1] ?? "").trim();
    pushEntry(entries, file, lineNumber, text, snippet);
  }
};

const extractAlerts = (
  content: string,
  file: string,
  lines: string[],
  lineStarts: number[],
  entries: HardcodedEntry[],
): void => {
  for (const match of content.matchAll(alertPattern)) {
    const index = match.index ?? 0;
    const lineNumber = findLineNumber(lineStarts, index);
    const snippet = (lines[lineNumber - 1] ?? "").trim();
    const title = match[2];
    pushEntry(entries, file, lineNumber, title, snippet);
    const message = match[4];
    if (message) {
      pushEntry(entries, file, lineNumber, message, snippet);
    }
  }
};

const extractAttributes = (
  content: string,
  file: string,
  lines: string[],
  lineStarts: number[],
  entries: HardcodedEntry[],
): void => {
  for (const match of content.matchAll(attrPattern)) {
    const index = match.index ?? 0;
    const lineNumber = findLineNumber(lineStarts, index);
    const snippet = (lines[lineNumber - 1] ?? "").trim();
    const value = match[2];
    pushEntry(entries, file, lineNumber, value, snippet);
  }
};

const main = async (): Promise<void> => {
  const files = await walkFiles(SRC_DIR);
  const entries: HardcodedEntry[] = [];

  for (const file of files) {
    const content = await fs.readFile(file, "utf8");
    const lines = content.split(/\r?\n/);
    const lineStarts = buildLineStarts(content);

    extractTextNodes(content, file, lines, lineStarts, entries);
    extractAlerts(content, file, lines, lineStarts, entries);
    extractAttributes(content, file, lines, lineStarts, entries);
  }

  entries.sort((a, b) =>
    a.file === b.file ? a.line - b.line : a.file.localeCompare(b.file),
  );

  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
