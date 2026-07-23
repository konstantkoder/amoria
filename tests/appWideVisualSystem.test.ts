const crypto = require("node:crypto") as typeof import("node:crypto");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");

const { visualSystem } = require("../src/theme/visualSystem.ts") as typeof import("../src/theme/visualSystem");

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function read(relativePath: string) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

function count(source: string, pattern: RegExp) {
  return source.match(pattern)?.length ?? 0;
}

function gitBlobHash(buffer: Buffer) {
  const header = Buffer.from(`blob ${buffer.length}\0`);
  return crypto
    .createHash("sha1")
    .update(Buffer.concat([header, buffer]))
    .digest("hex");
}

const expectedVisualSystem = {
  colors: {
    background: "#050816",
    backgroundRaised: "#0C1020",
    backgroundElevated: "#13182A",
    surface: "rgba(10,14,26,0.86)",
    surfaceRaised: "rgba(13,17,31,0.92)",
    surfaceSoft: "rgba(255,255,255,0.07)",
    surfacePressed: "rgba(255,255,255,0.11)",
    border: "rgba(255,255,255,0.12)",
    borderStrong: "rgba(255,255,255,0.18)",
    text: "#F9FAFF",
    textWarm: "#F6F2EC",
    textSecondary: "rgba(226,232,255,0.76)",
    textMuted: "rgba(226,232,255,0.56)",
    accent: "#DDA08B",
    accentSoft: "rgba(221,160,139,0.12)",
    accentBorder: "rgba(221,160,139,0.38)",
    primaryBg: "#C97868",
    primaryPressedBg: "#B86A5C",
    primaryText: "#1B0E12",
    primaryBorder: "#E0A18E",
    secondaryAccent: "#A78BC4",
    secondaryText: "#E9DDF3",
    secondaryBg: "rgba(167,139,196,0.12)",
    secondaryPressedBg: "rgba(167,139,196,0.20)",
    secondaryBorder: "rgba(167,139,196,0.36)",
    selectedBg: "rgba(167,139,196,0.18)",
    selectedBorder: "rgba(199,175,224,0.48)",
    selectedText: "#F6F2EC",
    disabledBg: "rgba(201,120,104,0.12)",
    disabledBorder: "rgba(201,120,104,0.28)",
    disabledText: "rgba(221,160,139,0.58)",
    dangerBg: "rgba(255,77,103,0.16)",
    dangerBorder: "rgba(255,210,218,0.30)",
    dangerText: "#FFD2DA",
    successBg: "rgba(31,185,110,0.15)",
    successBorder: "rgba(185,246,210,0.28)",
    successText: "#B9F6D2",
    warningBg: "rgba(226,169,78,0.14)",
    warningBorder: "rgba(243,201,130,0.34)",
    warningText: "#F3C982",
    navActive: "#F6F2EC",
    navInactive: "#8E94B4",
    nearbyOwnBubbleBg: "#3A233A",
    nearbyOwnBubbleBorder: "#A77A9D",
    nearbyOwnBubbleMeta: "rgba(233,221,243,0.72)",
    nearbyOwnBubbleTime: "rgba(233,221,243,0.60)",
    dmOwnBubbleBg: "#2F2A4A",
    dmOwnBubbleBorder: "#8D7AC5",
    dmOwnBubbleMeta: "rgba(233,221,243,0.72)",
    dmOwnBubbleTime: "rgba(233,221,243,0.60)",
    incomingBubbleBg: "rgba(12,16,30,0.88)",
    incomingBubbleBorder: "rgba(255,255,255,0.10)",
  },
  buttons: {
    primary: {
      minHeight: 48,
      borderRadius: 18,
      paddingHorizontal: 18,
      fontSize: 15,
      lineHeight: 18,
      fontWeight: "900",
      iconSize: 18,
      gap: 8,
    },
    secondary: {
      minHeight: 44,
      borderRadius: 17,
      paddingHorizontal: 16,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "900",
      iconSize: 17,
      gap: 7,
    },
    compact: {
      minHeight: 36,
      borderRadius: 18,
      paddingHorizontal: 12,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "900",
      iconSize: 16,
      gap: 6,
    },
    icon: { width: 40, height: 40, borderRadius: 20, iconSize: 18 },
    chip: {
      minHeight: 36,
      borderRadius: 18,
      paddingHorizontal: 12,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: "900",
    },
  },
  cards: { radius: 22, innerRadius: 18, padding: 16, compactPadding: 12 },
  inputs: {
    minHeight: 48,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    lineHeight: 20,
  },
};

assert(
  JSON.stringify(visualSystem) === JSON.stringify(expectedVisualSystem),
  "visualSystem matches the approved values exactly"
);

const background = read("src/components/ScreenBackground.tsx");
const backgroundAssets = read("src/assets/backgrounds/index.ts");
const together = read("src/screens/PlayLobbyScreen.tsx");
const navigator = read("src/navigation/AppNavigator.tsx");
const primaryButton = read("src/components/PrimaryActionButton.tsx");
const nearbyChat = read("src/screens/NearbyRoomChatScreen.tsx");
const dmChat = read("src/screens/DMChatScreen.tsx");
const drawer = read("src/navigation/AppDrawerContent.tsx");

assert(
  backgroundAssets.includes("together_main.png"),
  "Together main asset remains registered"
);
const togetherAsset = fs.readFileSync(
  path.join(__dirname, "..", "src/assets/backgrounds/together_main.png")
);
assert(
  gitBlobHash(togetherAsset) === "c24aaae901aa715b2730c6ca7eee8a179b2c2e1d",
  "Together main asset blob is unchanged"
);
assert(
  background.includes("togetherMain: { overlayOpacity: 0.28, blurRadius: 0 }"),
  "Together main overlay and blur remain unchanged"
);
assert(
  together.includes('background="togetherMain"'),
  "Together main keeps togetherMain"
);
assert(
  navigator.includes('const TAB_ACTIVE_TINT = "#F6F2EC";') &&
    navigator.includes('const TAB_INACTIVE_TINT = "#8E94B4";'),
  "navigation colors remain warm ivory and slate"
);

const expectedPresets = [
  ["authWarm", '["#050816", "#090B17", "#171022", "#28172B"]'],
  ["nearbyWarm", '["#050816", "#080B17", "#17101F", "#291725"]'],
  ["inboxWarm", '["#050816", "#070D19", "#11182A", "#1A2438"]'],
  ["conversationWarm", '["#050816", "#070B16", "#101526", "#1A1C31"]'],
  ["profileWarm", '["#050816", "#0A0B17", "#1A1122", "#2B1829"]'],
  ["menuWarm", '["#050816", "#090B15", "#15101D", "#221525"]'],
  ["utilityWarm", '["#050816", "#080C16", "#101722", "#182431"]'],
  ["announcementWarm", '["#050816", "#090B16", "#19111F", "#2A1825"]'],
] as const;
for (const [name, colors] of expectedPresets) {
  assert(
    background.includes(`${name}: {\n    colors: ${colors}`),
    `${name} has the approved gradient colors`
  );
}

const mappings = [
  ["src/screens/LoginScreen.tsx", /variant="authWarm"/g, 1],
  ["src/screens/NearbyHubScreen.tsx", /background="nearbyWarm"/g, 1],
  ["src/screens/NearbyActivityPreferencesScreen.tsx", /background="nearbyWarm"/g, 1],
  ["src/screens/InboxScreen.tsx", /background="inboxWarm"/g, 2],
  ["src/screens/DMChatScreen.tsx", /background="conversationWarm"/g, 3],
  ["src/screens/NearbyRoomChatScreen.tsx", /background="conversationWarm"/g, 2],
  ["src/screens/ProfileScreen.tsx", /background="profileWarm"/g, 2],
  ["src/screens/EditProfileScreen.tsx", /background="profileWarm"/g, 2],
  ["src/screens/PhotoManagerScreen.tsx", /background="profileWarm"/g, 2],
  ["src/screens/UserProfileScreen.tsx", /background="profileWarm"/g, 6],
  ["src/screens/SettingsScreen.tsx", /background="utilityWarm"/g, 1],
  ["src/screens/PrivacyPolicyScreen.tsx", /background="utilityWarm"/g, 1],
  ["src/screens/LocationInfoScreen.tsx", /background="utilityWarm"/g, 1],
  ["src/screens/CreateAnnouncementScreen.tsx", /background="announcementWarm"/g, 1],
  ["src/screens/AnnouncementDetailScreen.tsx", /background="announcementWarm"/g, 5],
] as const;
for (const [file, pattern, expectedCount] of mappings) {
  assert(
    count(read(file), pattern) === expectedCount,
    `${file} uses its approved explicit background in every branch`
  );
}
assert(
  drawer.includes('<ScreenBackground variant="menuWarm">'),
  "drawer renders menuWarm"
);
assert(
  read("src/components/ErrorBoundary.tsx").includes(
    '<ScreenBackground variant="utilityWarm">'
  ),
  "ErrorBoundary renders utilityWarm"
);

assert(
  primaryButton.includes("visualSystem.colors.primaryBg") &&
    primaryButton.includes("visualSystem.colors.primaryPressedBg") &&
    primaryButton.includes("visualSystem.colors.disabledBg"),
  "PrimaryActionButton uses approved normal, pressed, and disabled roles"
);
assert(
  nearbyChat.includes('backgroundColor: "#3A233A"') &&
    nearbyChat.includes('borderColor: "#A77A9D"') &&
    !nearbyChat.includes("rgba(232, 66, 138"),
  "Nearby own-message bubble uses the approved violet-plum palette"
);
assert(
  dmChat.includes('backgroundColor: "#2F2A4A"') &&
    dmChat.includes('borderColor: "#8D7AC5"'),
  "DM own-message bubble uses the approved violet palette"
);
assert(
  drawer.includes('backgroundColor: "rgba(10,14,26,0.88)"') &&
    !drawer.includes('backgroundColor: "rgba(7, 9, 18, 0.96)"'),
  "drawer panel uses the approved translucent surface"
);

const sourceFiles = fs
  .readdirSync(path.join(__dirname, "..", "src"), { recursive: true })
  .filter((entry): entry is string => typeof entry === "string")
  .filter((entry) => /\.(?:ts|tsx)$/.test(entry))
  .map((entry) => read(path.join("src", entry).replaceAll("\\", "/")))
  .join("\n");
const legacyBrightPink =
  /#FF4E8A|#E8428A|rgba\(232,\s*66,\s*138|rgba\(255,\s*79,\s*139/i;
const legacyGoldPrimary =
  /#F5C24D|#FFE8A3|#C88618|rgba\(245,\s*194,\s*77|rgba\(255,\s*232,\s*163/i;
assert(!legacyBrightPink.test(sourceFiles), "legacy bright-pink styles are removed");
assert(!legacyGoldPrimary.test(sourceFiles), "legacy gold primary styles are removed");
assert(!sourceFiles.includes("GoldActionButton"), "GoldActionButton references are removed");

const tabRoutes = Array.from(
  navigator.matchAll(/<Tab\.Screen\s+name="([^"]+)"/g),
  (match) => match[1]
);
assert(
  JSON.stringify(tabRoutes) === JSON.stringify(["Together", "Nearby", "Inbox"]),
  "tab routes and order are unchanged"
);
const rootRoutes = Array.from(
  navigator.matchAll(/<RootStack\.Screen(?:\s|\n)+name="([^"]+)"/g),
  (match) => match[1]
);
assert(
  JSON.stringify(rootRoutes) ===
    JSON.stringify([
      "Tabs",
      "CreateAnnouncement",
      "AnnouncementDetail",
      "PlayMatch",
      "PlayCanvas",
      "PlayStorySparks",
      "PlayResult",
      "PlayHistory",
      "PlaySessionDetail",
      "DMChat",
      "NearbyRoomChat",
      "NearbyActivityPreferences",
      "UserProfile",
      "Profile",
      "Settings",
      "PrivacyPolicy",
      "LocationInfo",
    ]),
  "root routes are unchanged and no fake route was introduced"
);

console.log("appWideVisualSystem.test.ts: PASS");
