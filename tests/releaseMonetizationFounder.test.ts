import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(__dirname, "..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

test("approved Founder badge assets remain byte-identical", () => {
  const hashes: Record<string, string> = {
    "amoria_founder_badge_A_master_1024.png": "27a654ab3ab294538cec989ea7e1dc9fddf70a41f1af206f13e389ce5a7e9ef5",
    "amoria_founder_badge_A_small_256.png": "c4c4f430c68818a23b559f432aed39fc7cc88c340444c05249b9981507244a97",
    "amoria_founder_badge_A_small_64.png": "2d3bf59a1ac99c621938cda13bc75c81ee1aa2ae6cb0be40133c744fa331983a",
    "amoria_founder_badge_A_small_32.png": "35ed0b854f72368d5f4f9ae4d4a427da681f1e32f8a5a9911190592e2ff1a162",
  };
  for (const [name, expected] of Object.entries(hashes)) {
    const actual = createHash("sha256").update(readFileSync(path.join(root, "src/assets/founder", name))).digest("hex");
    assert.equal(actual, expected, name);
  }
});

test("Billing verifies on the server before acknowledging and offers restore", () => {
  const screen = read("src/screens/PremiumScreen.tsx");
  assert.ok(screen.indexOf("await monetizationApi.verifyGooglePurchase") < screen.indexOf("await finishTransaction"));
  assert.match(screen, /getAvailablePurchases/);
  assert.match(screen, /product\?\.displayPrice/);
  assert.doesNotMatch(screen, /20\s*(EUR|€)/i);
});

test("free gates are contextual and backed by the authoritative snapshot", () => {
  const photos = read("src/screens/PhotoManagerScreen.tsx");
  const lobby = read("src/screens/PlayLobbyScreen.tsx");
  const profile = read("src/screens/EditProfileScreen.tsx");
  const history = read("src/screens/TogetherHistoryScreen.tsx");
  assert.match(photos, /totalPhotos >= 6 && !hasPremiumFeature/);
  assert.match(photos, /visibility === "locked" && !hasPremiumFeature/);
  assert.match(lobby, /id !== "any" && !hasPremiumFeature/);
  assert.match(profile, /value && !hasPremiumFeature/);
  assert.match(history, /!hasPremiumFeature/);
  assert.match(history, /togetherApi\.getHistory\(50\)/);
  assert.match(history, /navigation\.navigate\("Premium"\)/);
});

test("invite attribution is privacy-bounded and app links are conditional", () => {
  const attribution = read("src/services/attribution.ts");
  const attributionParsing = read("src/services/attributionParsing.ts");
  const config = read("app.config.js");
  assert.match(attributionParsing, /\^\[A-Z0-9\]\{6\}\$/);
  assert.match(attribution, /getInstallReferrerAsync/);
  assert.match(config, /EXPO_PUBLIC_APP_LINK_HOST/);
  assert.match(config, /pathPrefix: "\/i\/"/);
});

test("growth screens use the server wire contracts and allowlisted events", () => {
  const api = read("src/services/api/growthApi.ts");
  const invite = read("src/screens/InviteScreen.tsx");
  const availability = read("src/screens/CommunityAvailabilityScreen.tsx");
  const premium = read("src/screens/PremiumScreen.tsx");
  assert.match(api, /link: string/);
  assert.match(api, /shares: number/);
  assert.match(api, /activeToday: boolean/);
  assert.match(api, /notifyWhenActivity: boolean/);
  assert.match(api, /shareMode: "joint_result" \| "neutral_amoria_card"/);
  assert.match(invite, /invite\.link/);
  assert.match(availability, /activeToday:true/);
  assert.match(availability, /notifyWhenActivity:value/);
  assert.doesNotMatch(`${invite}\n${availability}\n${premium}`, /invite_screen_opened|availability_updated|purchase_verified|purchase_restored/);
});

test("push notification types match the server notification constraint", () => {
  const notifications = read("src/services/api/notificationsApi.ts");
  for (const type of [
    "founder_activated", "founder_premium_started", "founder_premium_expiring",
    "founder_premium_expired", "premium_activated", "premium_restored",
    "premium_billing_issue", "community_activity",
  ]) assert.match(notifications, new RegExp(`"${type}"`));
});
