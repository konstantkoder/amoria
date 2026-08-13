import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

type GraphicSafetyEvidence = {
  signal: "safe" | "unknown" | "unsafe";
  displayState: "safe" | "needs_review" | "unsafe";
  nsflProbability: number | null;
  policyDecision: "approve" | "needs_review" | "restrict" | null;
  modelVersion: string | null;
};

const { graphicSafetyFromRawResult } = require("../admin-web/src/graphic-safety") as {
  graphicSafetyFromRawResult(value: unknown): GraphicSafetyEvidence | null;
};
const { en } = require("../admin-web/src/i18n/en") as { en: Record<string, string> };
const { hr } = require("../admin-web/src/i18n/hr") as { hr: Record<string, string> };
const { ru } = require("../admin-web/src/i18n/ru") as { ru: Record<string, string> };

test("safe graphic evidence is extracted from the existing rawResult shape", () => {
  const evidence = graphicSafetyFromRawResult({
    graphicSafety: {
      signal: "safe",
      policyDecision: "approve",
      nsflProbability: 0.034211,
      modelVersion: "OwenElliott/image-safety-classifier-s@revision",
      objectStoragePath: "must-not-be-surfaced",
    },
  });

  assert.deepEqual(evidence, {
    signal: "safe",
    displayState: "safe",
    nsflProbability: 0.034211,
    policyDecision: "approve",
    modelVersion: "OwenElliott/image-safety-classifier-s@revision",
  });
});

test("unknown graphic signal maps to needs review", () => {
  const evidence = graphicSafetyFromRawResult({
    graphicSafety: {
      signal: "unknown",
      policyDecision: "needs_review",
      nsflProbability: 0.42,
      modelVersion: "graphic-model@review",
    },
  });

  assert.equal(evidence?.displayState, "needs_review");
  assert.equal(evidence?.policyDecision, "needs_review");
});

test("unsafe graphic signal and restrict decision remain explicit", () => {
  const evidence = graphicSafetyFromRawResult({
    graphicSafety: {
      signal: "unsafe",
      policyDecision: "restrict",
      nsflProbability: 0.98,
      modelVersion: "graphic-model@unsafe",
    },
  });

  assert.equal(evidence?.displayState, "unsafe");
  assert.equal(evidence?.policyDecision, "restrict");
  assert.equal(evidence?.nsflProbability, 0.98);
});

test("legacy rawResult has no graphic evidence and invents no score", () => {
  assert.equal(graphicSafetyFromRawResult(undefined), null);
  assert.equal(graphicSafetyFromRawResult(null), null);
  assert.equal(graphicSafetyFromRawResult({ confidence: { nsfw: 0.1 } }), null);
  assert.equal(graphicSafetyFromRawResult({ graphicSafety: null }), null);
});

test("malformed graphic fields are never displayed as trusted evidence", () => {
  const base = { signal: "safe", policyDecision: "approve", modelVersion: "graphic-model@valid" };

  for (const malformedScore of [Number.NaN, Number.POSITIVE_INFINITY, -0.01, 1.01, "0.5"]) {
    const evidence = graphicSafetyFromRawResult({
      graphicSafety: { ...base, nsflProbability: malformedScore },
    });
    assert.equal(evidence?.nsflProbability, null);
  }

  assert.equal(graphicSafetyFromRawResult({
    graphicSafety: { ...base, signal: "violence", nsflProbability: 0.5 },
  }), null);
  assert.equal(graphicSafetyFromRawResult({
    graphicSafety: { ...base, policyDecision: "delete", nsflProbability: 0.5 },
  })?.policyDecision, null);
});

test("graphic model version is preserved while malformed model text is rejected", () => {
  assert.equal(graphicSafetyFromRawResult({
    graphicSafety: {
      signal: "safe",
      policyDecision: "approve",
      nsflProbability: 0.1,
      modelVersion: "  OwenElliott/image-safety-classifier-s@015042  ",
    },
  })?.modelVersion, "OwenElliott/image-safety-classifier-s@015042");

  assert.equal(graphicSafetyFromRawResult({
    graphicSafety: {
      signal: "safe",
      policyDecision: "approve",
      nsflProbability: 0.1,
      modelVersion: "bad\nmodel",
    },
  })?.modelVersion, null);
});

test("graphic safety status labels are available in EN, RU, and HR", () => {
  assert.deepEqual(
    [en["media.graphicSafe"], en["media.graphicNeedsReview"], en["media.graphicUnsafe"], en["media.graphicNotAvailable"]],
    ["Safe", "Needs review", "Unsafe", "Not available"],
  );
  assert.deepEqual(
    [en["media.graphicSafe"], ru["media.graphicSafe"], hr["media.graphicSafe"]],
    ["Safe", "Безопасно", "Sigurno"],
  );
  assert.equal(ru["media.graphicNeedsReview"], "Нужна проверка");
  assert.equal(hr["media.graphicNeedsReview"], "Potrebna provjera");
});

test("Admin Media shows graphic evidence and keeps existing NSFW and person-presence rows", async () => {
  const source = await readFile(path.resolve(__dirname, "../admin-web/src/App.tsx"), "utf8");

  assert.match(source, /label=\{t\("media\.graphicSafety"\)\}/u);
  assert.match(source, /label=\{t\("media\.graphicScore"\)\}/u);
  assert.match(source, /label=\{t\("media\.graphicDecision"\)\}/u);
  assert.match(source, /label=\{t\("media\.graphicModel"\)\}/u);
  assert.match(source, /<Fact label=\{t\("media\.nsfwScore"\)\} value=\{nsfwScoreFromRawResult\(/u);
  assert.match(source, /<Fact label=\{t\("media\.personPresence"\)\} value=\{personPresenceFromRawResult\(/u);
});
