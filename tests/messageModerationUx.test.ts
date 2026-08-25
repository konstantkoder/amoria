import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dm = readFileSync("src/screens/DMChatScreen.tsx", "utf8");
const nearby = readFileSync("src/screens/NearbyRoomChatScreen.tsx", "utf8");
const apiTypes = readFileSync("src/services/api/types.ts", "utf8");

test("direct chat renders truthful moderated states and reports exact peer messages", () => {
  for (const state of ["held", "needs_review", "restricted", "removed"]) {
    assert.equal(dm.includes(`moderationState === "${state}"`), true, `DM UI handles ${state}`);
  }
  assert.equal(dm.includes("message_rate_limited"), true);
  assert.equal(dm.includes("reportChat(reason, message)"), true);
  assert.equal(dm.includes('targetType: targetMessage ? "message" : "thread"'), true);
  assert.equal(dm.includes("targetId: targetMessage?.id"), true);
});

test("Nearby room chat renders moderation state and rate-limit feedback", () => {
  assert.equal(nearby.includes("moderationState"), true);
  assert.equal(nearby.includes("message_rate_limited"), true);
  assert.equal(nearby.includes("chat.messageHeld"), true);
  assert.equal(nearby.includes("chat.messageUnderReview"), true);
});

test("API message contracts expose state without classifier internals", () => {
  for (const state of ["visible", "held", "needs_review", "restricted", "removed"]) {
    assert.equal(apiTypes.includes(`"${state}"`), true);
  }
  assert.equal(apiTypes.includes("classifierScore"), false);
  assert.equal(apiTypes.includes("toxicity"), false);
});

test("release locales include moderation and rate-limit copy", () => {
  for (const locale of ["en", "ru", "hr", "uk", "pl", "de", "fr", "es", "it", "pt", "nl", "sv", "no", "da", "fi", "cs", "sk", "sl", "sr", "bs", "ro", "hu", "el", "tr"]) {
    const translations = JSON.parse(readFileSync(`src/i18n/locales/${locale}.json`, "utf8"));
    for (const key of [
      "chat.messageHeld",
      "chat.messageUnderReview",
      "chat.messageRestricted",
      "chat.messageRemoved",
      "chat.rateLimitedTitle",
      "chat.rateLimitedBody",
      "safety.reportMessageTitle",
    ]) {
      assert.equal(typeof translations[key], "string", `${locale} contains ${key}`);
      assert.ok(translations[key].trim().length > 0, `${locale} ${key} is non-empty`);
    }
  }
});
