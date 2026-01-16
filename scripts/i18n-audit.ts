import { DICT, LANGUAGE_CODES } from "../src/i18n/translations";

const keysEn = Object.keys(DICT.en).sort();
let hasMissing = false;

for (const locale of LANGUAGE_CODES) {
  const missing = keysEn.filter((key) => !(key in DICT[locale]));
  const extra = Object.keys(DICT[locale]).filter((key) => !(key in DICT.en));
  console.log(`${locale}: missing=${missing.length} extra=${extra.length}`);
  if (missing.length > 0) {
    console.log(`  missing (first 20): ${missing.slice(0, 20).join(", ")}`);
    hasMissing = true;
  }
}

if (hasMissing) {
  process.exit(1);
}
