const fs = require("fs");
const path = require("path");

const DIR = path.join(process.cwd(), "src", "i18n", "locales");
const basePath = path.join(DIR, "en.json");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const base = readJson(basePath);
const baseKeys = Object.keys(base);

const files = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith(".json") && f !== "en.json");

let hasErrors = false;

for (const f of files) {
  const loc = f.replace(".json", "");
  const p = path.join(DIR, f);
  const json = readJson(p);

  const keys = Object.keys(json);

  const missing = baseKeys.filter((k) => !(k in json));
  const extra = keys.filter((k) => !(k in base));

  // keys that are identical to English (often means not translated)
  const sameAsEn = baseKeys.filter((k) => k in json && json[k] === base[k]);

  console.log(`\n=== ${loc} ===`);
  console.log(`missing: ${missing.length}`);
  if (missing.length)
    console.log(
      missing.slice(0, 40).join("\n") + (missing.length > 40 ? "\n..." : "")
    );

  console.log(`extra: ${extra.length}`);
  if (extra.length)
    console.log(
      extra.slice(0, 40).join("\n") + (extra.length > 40 ? "\n..." : "")
    );

  console.log(`sameAsEn: ${sameAsEn.length}`);
  if (sameAsEn.length)
    console.log(
      sameAsEn.slice(0, 40).join("\n") +
        (sameAsEn.length > 40 ? "\n..." : "")
    );

  if (missing.length) hasErrors = true;
}

process.exit(hasErrors ? 1 : 0);
