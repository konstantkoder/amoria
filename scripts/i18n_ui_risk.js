#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.join(process.cwd(), "src", "i18n", "locales");
const BASE_FILE = "en.json";
const OUTPUT_FILE = path.join(process.cwd(), "i18n_ui_risk.txt");
const RELEASE_LOCALES = ["en", "ru", "hr"];

const PREFIXES = [
  "auth.",
  "tabs.",
  "drawer.",
  "menu.",
  "settings.",
  "profile.",
  "editProfile.",
  "nearby.",
  "now.",
  "dm.",
  "inbox.",
  "photos.",
  "play.",
  "playDetail.",
  "playHistory.",
  "safety.",
  "together.",
  "feed.",
  "chats.",
  "rooms.",
  "ads.",
];

const LIMITS = [
  {
    name: "button/action",
    tokens: ["button", "save", "ok", "cancel", "login", "register", "apply", "send"],
    limit: 16,
  },
  {
    name: "title/header",
    tokens: ["title", "header", "label"],
    limit: 28,
  },
  {
    name: "placeholder/hint",
    tokens: ["placeholder", "hint", "subtitle"],
    limit: 60,
  },
];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function listJsonFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
}

function isPriorityKey(key) {
  const lower = key.toLowerCase();
  if (lower.includes("language")) return true;
  return PREFIXES.some((p) => lower.startsWith(p));
}

function getLimitForKey(key) {
  const lower = key.toLowerCase();
  let min = Infinity;
  for (const group of LIMITS) {
    if (group.tokens.some((t) => lower.includes(t))) {
      min = Math.min(min, group.limit);
    }
  }
  return Number.isFinite(min) ? min : null;
}

function collectRisks(locale, obj) {
  const items = [];
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value !== "string") continue;
    if (!isPriorityKey(key)) continue;
    const limit = getLimitForKey(key);
    if (limit === null) continue;
    const length = value.length;
    if (length > limit) {
      items.push({ locale, key, length, value });
    }
  }
  return items;
}

function main() {
  const basePath = path.join(LOCALES_DIR, BASE_FILE);
  if (!fs.existsSync(basePath)) {
    console.error(`Base not found: ${basePath}`);
    process.exit(2);
  }

  const base = readJson(basePath);
  const files = listJsonFiles(LOCALES_DIR).filter((file) =>
    RELEASE_LOCALES.includes(file.replace(/\.json$/i, ""))
  );
  const locales = files.map((f) => f.replace(/\.json$/i, ""));

  const outputLines = [];
  const summary = [];

  outputLines.push("I18N UI RISK REPORT");
  outputLines.push(`Base: ${BASE_FILE}`);
  outputLines.push(`Dir:  ${LOCALES_DIR}`);
  outputLines.push("");

  for (const file of files) {
    const locale = file.replace(/\.json$/i, "");
    const obj = readJson(path.join(LOCALES_DIR, file));
    const risks = collectRisks(locale, obj);
    risks.sort((a, b) => b.length - a.length);
    const top = risks.slice(0, 50);

    outputLines.push(`=== ${locale.toUpperCase()} (risk=${risks.length}) ===`);
    if (!top.length) {
      outputLines.push("(none)");
      outputLines.push("");
    } else {
      for (const item of top) {
        outputLines.push(`[${item.length}] ${item.key}: ${item.value}`);
      }
      outputLines.push("");
    }

    summary.push({
      locale,
      total: risks.length,
      topLength: top.length ? top[0].length : 0,
    });
  }

  fs.writeFileSync(OUTPUT_FILE, outputLines.join("\n") + "\n", "utf8");

  console.log("UI RISK SUMMARY");
  console.log(`Locales: ${locales.length}, baseKeys: ${Object.keys(base).length}`);
  for (const row of summary) {
    console.log(`${row.locale.padEnd(6)} risk=${String(row.total).padStart(4)} top=${row.topLength}`);
  }
  console.log(`\nWrote: ${OUTPUT_FILE}`);
}

main();
