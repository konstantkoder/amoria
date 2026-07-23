const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

function read(relativePath: string) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const routes = read("src/navigation/appRoutes.ts");
const navigator = read("src/navigation/AppNavigator.tsx");
const api = read("src/services/api/togetherApi.ts");
const lobby = read("src/screens/PlayLobbyScreen.tsx");
const canvas = read("src/screens/PlayCanvasScreen.tsx");
const story = read("src/screens/PlayStorySparksScreen.tsx");
const result = read("src/screens/PlayResultScreen.tsx");

assert(routes.includes('mode?: "live" | "turn_based"'), "Together routes are mode-aware");
assert(!routes.includes("PlayHistory:"), "history route is removed");
assert(!routes.includes("PlaySessionDetail:"), "archive detail route is removed");
assert(!navigator.includes("PlayHistoryScreen"), "history screen is unregistered");
assert(!navigator.includes("PlaySessionDetailScreen"), "archive detail screen is unregistered");
assert(!api.includes("/together/history"), "history API is removed");
assert(api.includes("/together/turn-based/start"), "turn-based start API is present");
assert(api.includes("/together/turn-based/current"), "turn-based current API is present");
assert(api.includes("/submit-draw"), "turn-based drawing submission API is present");
assert(api.includes("/lease"), "turn-based lease API is present");
assert(api.includes("/cancel"), "turn-based cancel API is present");
assert(lobby.includes("rgba(10,14,26,0.78)"), "turn-based card background matches contract");
assert(lobby.includes("rgba(167,139,196,0.36)"), "turn-based card border matches contract");
assert(lobby.includes("borderRadius: 22"), "turn-based card radius matches contract");
assert(lobby.includes("fontSize: 18") && lobby.includes("lineHeight: 24"), "turn-based title typography matches contract");
assert(canvas.includes("submitTurnBasedDraw"), "canvas submits turn-based drawing");
assert(canvas.includes("renewTurnBasedLease"), "canvas renews focused turn lease");
assert(canvas.includes("if (isTurnBased)"), "canvas branches live lifecycle behavior");
assert(story.includes("turnBasedMoment?.isMyTurn"), "Story Sparks disables out-of-turn selection");
assert(story.includes("if (isTurnBased || !readyToFinish)"), "turn-based story completion remains server-owned");
assert(result.includes('mode: "turn_based"'), "result preserves turn-based navigation mode");

for (const locale of ["en", "ru", "hr"]) {
  const dictionary = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as Record<string, string>;
  for (const key of [
    "together.turnBased.title",
    "together.turnBased.body",
    "together.turnBased.start",
    "together.turnBased.continue",
    "together.turnBased.waiting",
    "together.turnBased.storyWaiting",
  ]) {
    assert(Boolean(dictionary[key]), `${locale} includes ${key}`);
  }
}

console.log("togetherTurnBasedContract.test.ts: PASS");
