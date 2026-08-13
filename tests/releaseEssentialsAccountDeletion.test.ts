const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
function read(file: string) { return fs.readFileSync(path.join(__dirname, "..", file), "utf8"); }
function assert(condition: boolean, message: string) { if (!condition) throw new Error(message); }

const screen = read("src/screens/AccountDeletionScreen.tsx");
const settings = read("src/screens/SettingsScreen.tsx");
const auth = read("src/contexts/AuthContext.tsx");
const accountApi = read("src/services/api/accountApi.ts");
const localData = read("src/services/accountLocalData.ts");
const session = read("src/services/api/sessionStorage.ts");

assert(settings.includes('navigation.navigate("AccountDeletion")'), "delete-account entry is visible in Settings → Account");
assert(screen.includes('const CONFIRMATION = "DELETE"'), "explicit irreversible confirmation phrase is required");
assert(screen.includes("secureTextEntry") && screen.includes("password.length > 0"), "current password confirmation is required");
assert(screen.includes("inFlight.current") && screen.includes("disabled={!confirmed || submitting}"), "double taps are guarded");
assert(accountApi.includes('apiRequest("/me/account", { method: "DELETE"'), "mobile calls the real authenticated backend route");
assert(auth.includes("await deleteMyAccount(password)") && auth.includes("await clearAccountLocalData()") && auth.includes("await clearSessionState()"), "successful server acceptance clears account caches and session");
assert(session.includes("setAccessToken(null)") && session.includes("setRefreshToken(null)"), "access and SecureStore refresh tokens are cleared");
assert(auth.includes("wsClient.resetForSession()"), "WebSocket state resets on deletion");
for (const key of ["amoria_location_consent_v1", "amoria_nearby_enabled", "amoria:together:radiusKm:v2", "amoria:together:ageFilter:v1"]) assert(localData.includes(key), `${key} is account-scoped and removed`);
assert(!localData.includes("amoria.locale") && !localData.includes("amoria.installId.v1"), "locale and installation identity are not incorrectly treated as profile caches");

for (const locale of ["en", "ru", "hr"]) {
  const dictionary = JSON.parse(read(`src/i18n/locales/${locale}.json`));
  for (const key of ["accountDeletion.title", "accountDeletion.warningBody", "accountDeletion.confirmLabel", "accountDeletion.wrongPassword", "accountDeletion.failed"]) assert(Boolean(dictionary[key]), `${locale} includes ${key}`);
}

console.log("releaseEssentialsAccountDeletion.test.ts: PASS");
