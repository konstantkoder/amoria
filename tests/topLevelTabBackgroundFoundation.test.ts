const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function read(relativePath: string) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function count(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

const background = read("src/components/ScreenBackground.tsx");
const inbox = read("src/screens/InboxScreen.tsx");
const together = read("src/screens/PlayLobbyScreen.tsx");
const nearby = read("src/screens/NearbyHubScreen.tsx");
const navigator = read("src/navigation/AppNavigator.tsx");
const togetherIcon = read("src/components/icons/AmoriaTogetherIcon.tsx");
const backgroundAssets = read("src/assets/backgrounds/index.ts");
const theme = read("src/theme/theme.ts");

assert(
  background.includes('| "inboxWarm"'),
  "inboxWarm is a ScreenBackground variant"
);
assert(
  /inboxWarm:\s*\{\s*colors:\s*\["#050816", "#070D19", "#11182A", "#1A2438"\],\s*start:\s*\{ x: 0, y: 0 \},\s*end:\s*\{ x: 1, y: 1 \},\s*blobAColor:\s*"#6B5C9A",\s*blobBColor:\s*"#4A647A",\s*blobOpacity:\s*0\.14,\s*\}/s.test(
    background
  ),
  "inboxWarm has the approved gradient and blob preset"
);
assert(
  background.includes("inboxWarm: { overlayOpacity: 0.16, blurRadius: 0 }"),
  "inboxWarm has the approved defaults"
);
assert(
  count(inbox, /background="inboxWarm"/g) === 2 &&
    !inbox.includes('background="chatWarm"'),
  "every Inbox branch uses inboxWarm"
);
assert(
  together.includes('background="togetherMain"'),
  "Together keeps togetherMain"
);
assert(
  background.includes("togetherMain: { overlayOpacity: 0.28, blurRadius: 0 }"),
  "Together keeps its approved overlay and blur defaults"
);
assert(
  nearby.includes('background="nearbyWarm"') &&
    nearby.includes("overlayOpacity={0.16}") &&
    nearby.includes("blurRadius={0}"),
  "Nearby keeps nearbyWarm with its approved overrides"
);
assert(
  navigator.includes('const TAB_ACTIVE_TINT = "#F6F2EC";') &&
    navigator.includes('const TAB_INACTIVE_TINT = "#8E94B4";'),
  "tab tint constants match the approved values"
);
assert(
  navigator.includes("backgroundColor: theme.colors.background") &&
    theme.includes('background: "#050816"'),
  "the tab bar continues to use the #050816 theme background"
);
assert(
  /function TogetherTabIcon\([\s\S]*?color:\s*string;[\s\S]*?<AmoriaTogetherIcon[\s\S]*?color=\{color\}/.test(
    navigator
  ) &&
    navigator.includes(
      "<TogetherTabIcon focused={focused} size={size} color={color} />"
    ),
  "Together receives and forwards the navigator-provided color"
);
assert(
  togetherIcon.includes("color?: string;") &&
    togetherIcon.includes("tintColor: color"),
  "Together image supports explicit tinting"
);
assert(
  backgroundAssets.includes("together_main.png"),
  "the Together background asset remains registered"
);
assert(
  /tabIconShell:\s*\{\s*minWidth:\s*48,\s*minHeight:\s*39,\s*borderRadius:\s*999,\s*borderWidth:\s*1,/s.test(
    navigator
  ) &&
    /tabIconShellActive:\s*\{\s*minHeight:\s*41,\s*backgroundColor:\s*"rgba\(185,130,114,0\.16\)",\s*borderColor:\s*"rgba\(246,242,236,0\.28\)",\s*shadowColor:\s*"#F6F2EC",\s*shadowOpacity:\s*0\.12,\s*shadowRadius:\s*10,\s*shadowOffset:\s*\{ width: 0, height: 5 \},\s*elevation:\s*7,\s*transform:\s*\[\{ translateY: -2 \}\]/s.test(
      navigator
    ),
  "tab icon shell geometry and active treatment match the approved values"
);
assert(
  navigator.includes('Nearby: { active: "location", inactive: "location-outline" }') &&
    navigator.includes(
      'Inbox: { active: "chatbubbles", inactive: "chatbubbles-outline" }'
    ) &&
    navigator.includes("size={focused ? size + 1 : size}") &&
    navigator.includes("size={focused ? size + 2 : size}"),
  "tab icon names and sizes are unchanged"
);

const tabRoutes = Array.from(
  navigator.matchAll(/<Tab\.Screen\s+name="([^"]+)"/g),
  (match) => match[1]
);
assert(
  JSON.stringify(tabRoutes) === JSON.stringify(["Together", "Nearby", "Inbox"]),
  "bottom-tab routes and order are unchanged"
);

console.log("topLevelTabBackgroundFoundation.test.ts: PASS");
