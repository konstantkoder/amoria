import assert from "node:assert/strict";
import test from "node:test";

import { parseAttribution } from "../src/services/attributionParsing";

test("invite and app-link parsing accepts only bounded six-character codes", () => {
  assert.deepEqual(parseAttribution("https://amoria.app/i/ABC123"), { code: "ABC123", sourceCode: "personal_invite" });
  assert.deepEqual(parseAttribution("amoria://invite?code=xy9z12&source=share"), { code: "XY9Z12", sourceCode: "share" });
  assert.deepEqual(parseAttribution("?referrer=code%253DABC123%2526source%253Dplay"), { code: "ABC123", sourceCode: "play" });
  assert.equal(parseAttribution("https://amoria.app/i/TOO-LONG"), null);
  assert.equal(parseAttribution("https://amoria.app/invite"), null);
  assert.equal(parseAttribution("not a link"), null);
  assert.equal(parseAttribution(null), null);
});

test("duplicate or stale delivery of the same safe link parses deterministically without replay data", () => {
  const link = "amoria://invite?code=ABC123";
  assert.deepEqual(parseAttribution(link), parseAttribution(link));
  assert.deepEqual(Object.keys(parseAttribution(link) ?? {}).sort(), ["code", "sourceCode"]);
});
