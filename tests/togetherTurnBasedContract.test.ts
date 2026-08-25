const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
function read(file: string) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }

const routes = read("src/navigation/appRoutes.ts");
const api = read("src/services/api/togetherApi.ts");
const lobby = read("src/screens/PlayLobbyScreen.tsx");
const canvas = read("src/screens/PlayCanvasScreen.tsx");
const story = read("src/screens/PlayStorySparksScreen.tsx");
const result = read("src/screens/PlayResultScreen.tsx");

assert(routes.includes('mode?: "live" | "turn_based"'), "Together routes remain mode-aware");
assert(!routes.includes("PlayHistory:") && !routes.includes("PlaySessionDetail:"), "archived navigation remains removed");
for (const endpoint of ["/together/turn-based/start", "/together/turn-based/current", "/submit-draw", "/lease", "/cancel", "/dismiss"]) {
  assert(api.includes(endpoint), `${endpoint} remains wired`);
}
assert(lobby.includes('background="togetherObservatoryV6"'), "Together lobby uses the approved observatory scene");
assert(/turnBasedCard:\s*\{\s*backgroundColor: "transparent",\s*borderWidth: 0,\s*padding: 16,\s*gap: 10,\s*shadowOpacity: 0,\s*elevation: 0,/s.test(lobby), "turn-based card retains the accepted borderless V6 treatment");
assert(/turnBasedTitle:\s*\{\s*color: "#F9FAFF",\s*fontSize: 18,\s*lineHeight: 24,\s*fontWeight: "600",/s.test(lobby), "turn-based title retains accepted typography");
assert(canvas.includes("submitTurnBasedDraw") && canvas.includes("renewTurnBasedLease") && canvas.includes("if (isTurnBased)"), "drawing owns turn-based submit, lease, and lifecycle branches");
assert(story.includes("turnBasedMoment?.isMyTurn") && story.includes("if (isTurnBased || !readyToFinish)"), "Story Sparks remains server-authoritative and turn-gated");
assert(result.includes('mode: "turn_based"'), "result keeps turn-based navigation mode");

for (const locale of ["en", "ru", "hr", "uk", "pl", "de", "fr", "es", "it", "pt", "nl", "sv", "no", "da", "fi", "cs", "sk", "sl", "sr", "bs", "ro", "hu", "el", "tr"]) {
  const dict = JSON.parse(read(`src/i18n/locales/${locale}.json`));
  for (const key of ["together.turnBased.title", "together.turnBased.start_draw.title", "together.turnBased.waiting_for_partner.title", "together.turnBased.completed.title"]) {
    assert(Boolean(dict[key]), `${locale} includes ${key}`);
  }
}

console.log("togetherTurnBasedContract.test.ts: PASS");
