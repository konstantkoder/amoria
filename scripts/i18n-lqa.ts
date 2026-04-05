/* eslint-disable no-console */
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const LOCALES_DIR = path.join(ROOT, "src", "i18n", "locales");

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, string>;
}

const en = readJson(path.join(LOCALES_DIR, "en.json"));
const enKeys = Object.keys(en).sort();

const files = fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith(".json"));
let hasError = false;

// heuristics: what likely appears in tight UI
const shortKeyHeuristics = [
  /^tabs\./i,
  /(title|subtitle|button|label|placeholder|hint|tab|header)$/i,
  /^menu\./i,
  /^common\.(ok|cancel|done|back|next|save|close)/i,
];

function maxLenForKey(key: string): number {
  if (/^tabs\./i.test(key)) return 14;
  if (/(button|tab)$/i.test(key)) return 18;
  if (/(title)$/i.test(key)) return 28;
  if (/(subtitle|hint)$/i.test(key)) return 60;
  if (/(placeholder)$/i.test(key)) return 40;
  if (/(description|body|policy|terms)/i.test(key)) return 240;
  return 80;
}

function placeholders(s: string): string[] {
  const m = s.match(/\{[a-zA-Z0-9_]+\}/g) ?? [];
  return Array.from(new Set(m)).sort();
}

function countNewlines(s: string): number {
  return (s.match(/\n/g) ?? []).length;
}

const cyr = /[А-Яа-яЁёІіЇїЄєҐґ]/;

for (const file of files) {
  const locale = path.basename(file, ".json");
  const dict = readJson(path.join(LOCALES_DIR, file));

  const keys = Object.keys(dict);
  const missing = enKeys.filter((k) => !(k in dict)).length;
  const extra = keys.filter((k) => !(k in en)).length;
  if (missing || extra) {
    console.log(`${locale}: key parity mismatch missing=${missing} extra=${extra}`);
    hasError = true;
  }

  const placeholderProblems: Array<{ key: string; en: string[]; loc: string[] }> = [];
  const newlineProblems: Array<{ key: string; en: number; loc: number }> = [];
  const lengthProblems: Array<{ key: string; len: number; max: number; value: string }> = [];
  const mixedLang: Array<{ key: string; value: string }> = [];

  for (const k of enKeys) {
    const vEn = String(en[k] ?? "");
    const v = String(dict[k] ?? "");

    const phEn = placeholders(vEn);
    const ph = placeholders(v);
    if (phEn.join("|") !== ph.join("|")) {
      placeholderProblems.push({ key: k, en: phEn, loc: ph });
    }

    const nlEn = countNewlines(vEn);
    const nl = countNewlines(v);
    if (nlEn !== nl) {
      newlineProblems.push({ key: k, en: nlEn, loc: nl });
    }

    const max = maxLenForKey(k);
    const len = v.length;
    if (len > max) {
      if (max <= 80 || shortKeyHeuristics.some((r) => r.test(k))) {
        lengthProblems.push({ key: k, len, max, value: v });
      }
    }

    if (locale !== "ru" && locale !== "uk" && cyr.test(v)) {
      mixedLang.push({ key: k, value: v });
    }
  }

  if (placeholderProblems.length || newlineProblems.length || lengthProblems.length || mixedLang.length) {
    console.log(`\n=== ${locale} ===`);
  }

  if (placeholderProblems.length) {
    hasError = true;
    console.log(`PLACEHOLDERS MISMATCH: ${placeholderProblems.length}`);
    for (const p of placeholderProblems.slice(0, 20)) {
      console.log(`- ${p.key}: en=${p.en.join(",")}  ${locale}=${p.loc.join(",")}`);
    }
    if (placeholderProblems.length > 20) console.log(`... +${placeholderProblems.length - 20} more`);
  }

  if (newlineProblems.length) {
    console.log(`NEWLINE COUNT DIFF: ${newlineProblems.length}`);
    for (const p of newlineProblems.slice(0, 15)) {
      console.log(`- ${p.key}: en=${p.en} ${locale}=${p.loc}`);
    }
    if (newlineProblems.length > 15) console.log(`... +${newlineProblems.length - 15} more`);
  }

  if (lengthProblems.length) {
    console.log(`TOO LONG (UI risk): ${lengthProblems.length}`);
    for (const p of lengthProblems
      .sort((a, b) => (b.len - b.max) - (a.len - a.max))
      .slice(0, 15)) {
      const preview = p.value.replace(/\s+/g, " ").slice(0, 80);
      console.log(`- ${p.key}: ${p.len}/${p.max} "${preview}${p.value.length > 80 ? "…" : ""}"`);
    }
    if (lengthProblems.length > 15) console.log(`... +${lengthProblems.length - 15} more`);
  }

  if (mixedLang.length) {
    console.log(`CYRILLIC IN NON-RU/UK: ${mixedLang.length}`);
    for (const m of mixedLang.slice(0, 10)) {
      console.log(`- ${m.key}: "${m.value.slice(0, 80)}"`);
    }
  }
}

if (hasError) {
  console.error("\nLQA failed: fix placeholder mismatches (and key parity if any).");
  process.exit(1);
}
console.log("\nLQA OK (placeholders match).");
