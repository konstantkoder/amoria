#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "src");
const DIR = path.join(SRC_DIR, "i18n", "locales");
const BASE_LOCALE = "en";
const RELEASE_LOCALES = ["en", "ru", "hr"];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      walk(p, out);
    } else if (/\.(tsx?|jsx?)$/.test(name)) {
      out.push(p);
    }
  }
  return out;
}

function addKnownDynamicKeys(keys) {
  for (const id of ["anyAdult", "18-24", "25-34", "35-44", "45-54", "55+"]) {
    keys.add(`together.age.${id}`);
  }
  for (const km of ["5", "25", "100", "250"]) {
    keys.add(`together.geo.${km}km`);
  }
  for (const state of ["preparing", "searching", "delayed", "found", "error"]) {
    for (const activity of ["Draw", "StorySparks"]) {
      keys.add(`play.match.status.${state}${activity}Title`);
    }
  }
  for (const id of ["place", "detail", "twist", "ending"]) {
    keys.add(`play.storySparks.round.${id}`);
  }
  for (const id of ["woman", "man", "nonbinary", "preferNotToSay"]) {
    keys.add(`profile.gender.${id}`);
  }
  for (const id of ["woman", "man", "nonbinary", "everyone"]) {
    keys.add(`profile.lookingFor.${id}`);
  }
  for (const id of ["all", "woman", "man", "nonbinary"]) {
    keys.add(`nearby.gender.${id}`);
  }
  for (const promptKey of [
    "draw.tinyPlace",
    "draw.firstMeeting",
    "draw.dreamRoom",
    "storySparks.tinyStory",
    "storySparks.fourSparks",
    "storySparks.placeDetailTwistEnding",
  ]) {
    keys.add(`play.prompt.${promptKey}`);
    for (const index of [0, 1, 2]) {
      keys.add(`play.promptHint.${promptKey}.${index}`);
    }
  }
}

function collectActiveKeys() {
  const keys = new Set();
  const callRe = /\b(?:t|tt|copyOrFallback)\(\s*["']([A-Za-z0-9_.+:-]+)["']/g;
  const labelRe = /labelKey:\s*["']([A-Za-z0-9_.+:-]+)["']/g;

  for (const file of walk(SRC_DIR)) {
    const text = fs.readFileSync(file, "utf8");
    for (const re of [callRe, labelRe]) {
      let match;
      re.lastIndex = 0;
      while ((match = re.exec(text))) {
        keys.add(match[1]);
      }
    }
  }

  addKnownDynamicKeys(keys);
  return [...keys].sort();
}

const base = readJson(path.join(DIR, `${BASE_LOCALE}.json`));
const baseKeys = Object.keys(base);
const activeKeys = collectActiveKeys();

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

const hiddenBetaLocales = files
  .map((f) => f.replace(".json", ""))
  .filter((loc) => !RELEASE_LOCALES.includes(loc));

let hasErrors = false;

console.log("I18N RELEASE AUDIT");
console.log(`releaseLocales: ${RELEASE_LOCALES.join(", ")}`);
console.log(`hiddenBetaLocales: ${hiddenBetaLocales.length}`);
console.log(`baseKeys: ${baseKeys.length}`);
console.log(`activeKeys: ${activeKeys.length}`);

const baseActiveMissing = activeKeys.filter((key) => !(key in base));
console.log(`\n=== ${BASE_LOCALE} release base ===`);
console.log(`activeMissing: ${baseActiveMissing.length}`);
if (baseActiveMissing.length) {
  console.log(baseActiveMissing.slice(0, 80).join("\n"));
  if (baseActiveMissing.length > 80) console.log("...");
  hasErrors = true;
}

for (const file of files) {
  const loc = file.replace(".json", "");
  if (loc === BASE_LOCALE) continue;

  const json = readJson(path.join(DIR, file));
  const keys = Object.keys(json);
  const fullMissing = baseKeys.filter((key) => !(key in json));
  const extra = keys.filter((key) => !(key in base));
  const sameAsEn = baseKeys.filter((key) => key in json && json[key] === base[key]);

  if (RELEASE_LOCALES.includes(loc)) {
    const activeMissing = activeKeys.filter((key) => !(key in json));
    const activeSameAsEn = activeKeys.filter(
      (key) => key in json && key in base && json[key] === base[key],
    );

    console.log(`\n=== ${loc} release ===`);
    console.log(`activeMissing: ${activeMissing.length}`);
    if (activeMissing.length) {
      console.log(activeMissing.slice(0, 80).join("\n"));
      if (activeMissing.length > 80) console.log("...");
      hasErrors = true;
    }
    console.log(`fullMissing: ${fullMissing.length}`);
    console.log(`extra: ${extra.length}`);
    console.log(`activeSameAsEn: ${activeSameAsEn.length}`);
    if (activeSameAsEn.length) {
      console.log(activeSameAsEn.slice(0, 60).join("\n"));
      if (activeSameAsEn.length > 60) console.log("...");
    }
  } else {
    console.log(
      `BETA ${loc}: fullMissing=${fullMissing.length} extra=${extra.length} sameAsEn=${sameAsEn.length}`,
    );
  }
}

process.exit(hasErrors ? 1 : 0);
