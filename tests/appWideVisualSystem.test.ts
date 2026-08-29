const crypto = require("node:crypto") as typeof import("node:crypto");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const { visualSystem } = require("../src/theme/visualSystem.ts") as typeof import("../src/theme/visualSystem");

function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }
function read(file: string) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }
function blob(file: string) {
  const bytes = fs.readFileSync(path.join(__dirname, "..", file));
  return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
}

assert(visualSystem.colors.background === "#050816", "release background remains midnight navy");
assert(visualSystem.colors.primaryBg === "#E6B976", "release primary action remains warm gold");
assert(visualSystem.colors.navActive === "#F3C98B" && visualSystem.colors.navInactive === "#8E9484", "release tab colors remain gold and olive-gray");
assert(visualSystem.buttons.primary.minHeight === 56 && visualSystem.buttons.primary.borderRadius === 28, "primary action retains the V6 pill geometry");
assert(visualSystem.buttons.icon.width === 44 && visualSystem.buttons.icon.borderRadius === 22, "icon action retains the V6 touch target");

const background = read("src/components/ScreenBackground.tsx");
for (const variant of ["startLighthouseV6", "togetherObservatoryV6", "togetherSearchLighthouseV6", "nearbyHarborV6", "chatCanalV6", "profileArchGardenV6", "drawerLanternStreetV6"]) {
  assert(background.includes(`| "${variant}"`), `${variant} remains an explicit background contract`);
}
const assets = read("src/assets/backgrounds/index.ts");
const approvedAssets: Record<string, string> = {
  "lighthouse_v6.jpg": "3376d4d7d04839485de383c83fecf25ed482b26a",
  "observatory_v6.jpg": "2130bd7a50b72f1f55d1a42ff1a59eafd6f82379",
  "harbor_v6.jpg": "ac8578ef97c95ebf899aedc7bb12593021138d7b",
  "canal_v6.jpg": "749b0af02c6e25e3dc9a038054b8f94ed5ed46d1",
  "arch_garden_v6.jpg": "b215a9f221276cd3913abf37b70d23aa3aa5cf6a",
  "drawer_lantern_street_v6.jpg": "bb77c4b562ab7806bec1dc8e6f61049d83613a98",
};
for (const [file, hash] of Object.entries(approvedAssets)) {
  assert(assets.includes(`./v6/${file}`), `${file} remains registered`);
  assert(blob(`src/assets/backgrounds/v6/${file}`) === hash, `${file} remains the approved V6 artwork`);
}

const mappings = [
  ["src/screens/LoginScreen.tsx", "startLighthouseV6"],
  ["src/screens/PlayLobbyScreen.tsx", "togetherObservatoryV6"],
  ["src/screens/NearbyHubScreen.tsx", "nearbyHarborV6"],
  ["src/screens/InboxScreen.tsx", "chatCanalV6"],
  ["src/screens/DMChatScreen.tsx", "chatCanalV6"],
  ["src/screens/ProfileScreen.tsx", "profileArchGardenV6"],
  ["src/screens/SettingsScreen.tsx", "profileArchGardenV6"],
  ["src/navigation/AppDrawerContent.tsx", "drawerLanternStreetV6"],
] as const;
for (const [file, variant] of mappings) assert(read(file).includes(`\"${variant}\"`), `${file} uses its approved V6 scene`);

const navigator = read("src/navigation/AppNavigator.tsx");
const app = read("App.tsx");
const expoConfig = JSON.parse(read("app.json")).expo;
assert(app.includes('<StatusBar') && app.includes('barStyle="light-content"'), "the release shell keeps system status icons legible on dark screens");
assert(/root:\s*\{\s*flex: 1,\s*backgroundColor: theme\.colors\.background\s*\}/s.test(app), "the release shell paints behind the transparent Android status bar");
assert(expoConfig.backgroundColor === visualSystem.colors.background && expoConfig.android.backgroundColor === visualSystem.colors.background, "native root and Android window backgrounds remain midnight navy");
const tabRoutes = Array.from(navigator.matchAll(/<Tab\.Screen\s+name="([^"]+)"/g), (match) => match[1]);
assert(JSON.stringify(tabRoutes) === JSON.stringify(["Together", "Nearby", "Inbox"]), "bottom-tab routes and order remain stable");
for (const route of ["Settings", "Notifications", "AccountDeletion", "PrivacyPolicy", "LocationInfo"]) {
  assert(navigator.includes(`name="${route}"`), `${route} remains on the signed-in release surface`);
}

console.log("appWideVisualSystem.test.ts: PASS");
