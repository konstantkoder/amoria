const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
function read(file: string) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }

const app = read("App.tsx");
const notifications = read("src/services/notifications.ts");
const api = read("src/services/api/notificationsApi.ts");
const screen = read("src/screens/NotificationsScreen.tsx");
const auth = read("src/contexts/AuthContext.tsx");
const routing = read("src/services/pushRouting.ts");
const config = JSON.parse(read("app.json")).expo;

assert(screen.includes("listNotifications") && screen.includes("useFocusEffect"), "durable notifications reload whenever their screen is opened");
assert(screen.includes("markNotificationRead") && screen.includes("resolvePushRoute") && screen.includes("navigation.navigate(route.name"), "notification taps mark read and navigate through exact guarded screens");
assert(screen.includes("requestAndRegisterPush"), "permission request happens from an explanatory user-facing action");
assert(notifications.includes("Device.isDevice") && notifications.includes('Platform.OS !== "android"') && notifications.includes('Platform.OS !== "ios"'), "registration is limited to physical mobile devices");
assert(notifications.includes("getExpoPushTokenAsync({ projectId: projectId(), devicePushToken })"), "Expo token uses the configured EAS project id and supports rotation");
assert(notifications.includes("setNotificationChannelAsync") && config.plugins.some((entry: unknown) => Array.isArray(entry) && entry[0] === "expo-notifications" && entry[1].defaultChannel === "amoria_updates"), "Android channel and Expo config agree");
assert(api.includes('method: "PUT"') && api.includes('method: "DELETE"'), "token association can be registered and unlinked");
assert(auth.includes("await unlinkPushToken().catch"), "logout and account switch unlink the previous device association");
assert(app.includes("syncPushTokenIfGranted") && app.includes("subscribePushTokenChanges"), "granted token state and token rotation sync after sign-in");
assert(app.includes("addNotificationResponseReceivedListener") && app.includes("getLastNotificationResponseAsync"), "warm and cold push taps are handled");
assert(routing.includes('type === "direct_message"') && routing.includes('name: "DMChat"') && routing.includes('name: "AnnouncementDetail"'), "tap data resolves exact chat and announcement destinations");
assert(routing.includes("return null"), "unknown push types are ignored");
assert(app.includes("isSignedIn") && app.includes("pendingPushData"), "signed-out and pre-navigation taps cannot bypass authentication");
assert(notifications.includes("shouldShowBanner: false") && notifications.includes("shouldShowList: false"), "foreground push banners are suppressed to avoid WS/UI duplication");
assert(app.includes("addNotificationReceivedListener") && app.includes("foregroundNotice"), "foreground notifications use the in-app banner rather than a duplicate OS banner");

for (const locale of ["en", "ru", "hr", "uk", "pl", "de", "fr", "es", "it", "pt", "nl", "sv", "no", "da", "fi", "cs", "sk", "sl", "sr", "bs", "ro", "hu", "el", "tr"]) {
  const dictionary = JSON.parse(read(`src/i18n/locales/${locale}.json`));
  for (const key of ["notifications.title", "notifications.enablePush", "notifications.body.direct_message", "notifications.body.together_action"]) assert(Boolean(dictionary[key]), `${locale} includes ${key}`);
}

console.log("releaseEssentialsNotifications.test.ts: PASS");
