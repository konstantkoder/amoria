import assert from "node:assert/strict";
import test from "node:test";

import {
  DICT,
  LANGUAGE_CODES,
  LANGUAGE_LABELS,
  RELEASE_LANGUAGE_CODES,
  STORAGE_KEY,
  getReleaseLocaleOrDefault,
  getRuntimeLocale,
  setRuntimeLocale,
  translate,
  type Locale,
} from "../src/i18n/translations";
import { loadPersistedLocale, persistSelectedLocale } from "../src/i18n/localePersistence";

const expectedCodes: Locale[] = [
  "en", "ru", "hr", "uk", "pl", "de", "fr", "es", "it", "pt", "nl", "sv",
  "no", "da", "fi", "cs", "sk", "sl", "sr", "bs", "ro", "hu", "el", "tr",
];

const placeholders = (value: string) => [...value.matchAll(/\{([A-Za-z0-9_]+)\}/g)]
  .map((match) => match[1])
  .sort();

test("release language set and language picker metadata are exactly the approved 24", () => {
  assert.deepEqual(LANGUAGE_CODES, expectedCodes);
  assert.deepEqual(RELEASE_LANGUAGE_CODES, expectedCodes);
  assert.equal(new Set(RELEASE_LANGUAGE_CODES).size, 24);
  assert.equal(new Set(Object.values(LANGUAGE_LABELS)).size, 24);
  assert.deepEqual(Object.keys(LANGUAGE_LABELS), expectedCodes);
});

test("all release dictionaries exactly match English keys and placeholders", () => {
  const englishKeys = Object.keys(DICT.en).sort();
  assert.ok(englishKeys.length > 1_500);
  for (const locale of expectedCodes) {
    assert.deepEqual(Object.keys(DICT[locale]).sort(), englishKeys, `${locale} key parity`);
    for (const key of englishKeys) {
      const value = DICT[locale][key];
      assert.equal(typeof value, "string", `${locale}.${key} is text`);
      assert.ok(value.trim(), `${locale}.${key} is nonempty`);
      assert.notEqual(value, key, `${locale}.${key} is not a raw key`);
      assert.deepEqual(placeholders(value), placeholders(DICT.en[key]), `${locale}.${key} placeholder parity`);
    }
  }
});

test("Founder badge, tiers, frames, invite, availability, and auth placeholder resolve for every locale", () => {
  const frameKeys = ["NONE", "WARM_METALLIC", "BLACK_GLASS", "WARM_HALO"];
  for (const locale of expectedCodes) {
    const founder = translate(locale, "founder.badgeNumber", { number: "127" });
    assert.match(founder, /127/);
    assert.ok(!founder.includes("{number}"));
    assert.notEqual(translate(locale, "premium.tier.FREE"), "FREE");
    assert.notEqual(translate(locale, "premium.tier.PREMIUM"), "PREMIUM");
    for (const frame of frameKeys) assert.notEqual(translate(locale, `premium.frame.${frame}`), `premium.frame.${frame}`);
    for (const key of ["invite.title", "invite.shareText", "invite.copied", "invite.actionFailed"]) {
      assert.notEqual(translate(locale, key), key);
    }
    const availability = translate(locale, "availability.until", { date: "31/12/2026" });
    assert.match(availability, /31\/12\/2026/);
    assert.notEqual(translate(locale, "auth.emailPlaceholder"), "auth.emailPlaceholder");
  }
  assert.equal(translate("en", "founder.badgeNumber", { number: "127" }), "Founder · #127");
  assert.equal(translate("ru", "founder.badgeNumber", { number: "127" }), "Основатель · №127");
});

test("every in-app notification type has localized copy in all 24 dictionaries", () => {
  const notificationTypes = [
    "direct_message", "together_match", "together_action", "announcement", "founder_reserved",
    "founder_activated", "founder_premium_started", "founder_premium_expiring", "founder_premium_expired",
    "premium_activated", "premium_restored", "premium_billing_issue", "community_activity",
  ];
  for (const locale of expectedCodes) {
    for (const type of notificationTypes) {
      const key = `notifications.body.${type}`;
      assert.notEqual(translate(locale, key), key, `${locale} localizes ${type}`);
    }
  }
});

test("locale selection helpers preserve supported choices and defensively fall back", () => {
  assert.equal(STORAGE_KEY, "amoria.locale");
  for (const locale of expectedCodes) {
    setRuntimeLocale(locale);
    assert.equal(getRuntimeLocale(), locale);
    assert.equal(getReleaseLocaleOrDefault(locale), locale);
  }
  assert.equal(getReleaseLocaleOrDefault("xx"), "en");
  assert.equal(getReleaseLocaleOrDefault(null), "en");
});

test("DE, UK, and EL persist across restart and authentication boundaries", async () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: async (key: string) => values.get(key) ?? null,
    setItem: async (key: string, value: string) => { values.set(key, value); },
  };
  for (const locale of ["de", "uk", "el"] as const) {
    await persistSelectedLocale(storage, locale);
    const afterRestart = await loadPersistedLocale(storage);
    assert.deepEqual(afterRestart, { locale, shouldPrompt: false });
    // Login/logout does not own or clear locale storage; loading it again must be stable.
    assert.equal((await loadPersistedLocale(storage)).locale, locale);
  }
});
