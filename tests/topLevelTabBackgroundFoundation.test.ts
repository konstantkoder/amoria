const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
function read(file: string) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }

const background = read("src/components/ScreenBackground.tsx");
const inbox = read("src/screens/InboxScreen.tsx");
const together = read("src/screens/PlayLobbyScreen.tsx");
const nearby = read("src/screens/NearbyHubScreen.tsx");
const navigator = read("src/navigation/AppNavigator.tsx");
const icon = read("src/components/icons/AmoriaTogetherIcon.tsx");

assert(background.includes('| "chatCanalV6"'), "chatCanalV6 is a ScreenBackground variant");
assert((inbox.match(/background="chatCanalV6"/g)?.length ?? 0) === 2, "every Inbox branch uses the canal scene");
assert(together.includes('background="togetherObservatoryV6"'), "Together uses the observatory scene");
assert(nearby.includes('background="nearbyHarborV6"'), "Nearby uses the harbor scene");
assert(navigator.includes('const TAB_ACTIVE_TINT = "#F3C98B";') && navigator.includes('const TAB_INACTIVE_TINT = "#8E9484";'), "tab tints match V6");
assert(/tabIconShell:\s*\{\s*width: 46,\s*height: 42,\s*borderRadius: 999,\s*borderWidth: 1,/s.test(navigator), "tab icon shell retains accepted geometry");
assert(/tabIconShellActive:\s*\{\s*backgroundColor: "rgba\(230,185,118,0\.08\)",\s*borderColor: "rgba\(230,185,118,0\.18\)",\s*shadowColor: "#E6B976",\s*shadowOpacity: 0\.25,/s.test(navigator), "active tab retains accepted V6 glow");
assert(navigator.includes('Nearby: { active: "location", inactive: "location-outline" }') && navigator.includes('Inbox: { active: "chatbubbles", inactive: "chatbubbles-outline" }'), "tab icon names remain stable");
assert(/function TogetherTabIcon[\s\S]*?color=\{color\}/.test(navigator) && icon.includes("color?: string;") && icon.includes("tintColor: color"), "Together icon uses navigator-provided tint");
const tabRoutes = Array.from(navigator.matchAll(/<Tab\.Screen\s+name="([^"]+)"/g), (match) => match[1]);
assert(JSON.stringify(tabRoutes) === JSON.stringify(["Together", "Nearby", "Inbox"]), "bottom-tab routes and order remain stable");

console.log("topLevelTabBackgroundFoundation.test.ts: PASS");
