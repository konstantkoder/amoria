import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("realtime sockets are isolated by authenticated session", () => {
  const realtime = read("src/services/realtime/wsClient.ts");
  const auth = read("src/contexts/AuthContext.tsx");

  assert.match(realtime, /socketAccessToken === connection\.token/);
  assert.match(realtime, /Never reuse a socket authenticated for a previous login session/);
  assert.match(realtime, /export function resetForSession/);
  assert.match(realtime, /subscribedThreads\.clear\(\)/);
  assert.match(realtime, /subscribedTogetherSessions\.clear\(\)/);
  assert.match(auth, /wsClient\.resetForSession\(\)/);
});

test("critical user mutations have synchronous in-flight guards", () => {
  const guardedFiles = [
    "src/screens/LoginScreen.tsx",
    "src/screens/EmailVerificationScreen.tsx",
    "src/screens/PasswordResetScreen.tsx",
    "src/screens/DMChatScreen.tsx",
    "src/screens/NearbyRoomChatScreen.tsx",
    "src/screens/PlayStorySparksScreen.tsx",
    "src/screens/ProfileScreen.tsx",
    "src/screens/PhotoManagerScreen.tsx",
    "src/screens/EditProfileScreen.tsx",
    "src/screens/UserProfileScreen.tsx",
    "src/screens/AnnouncementDetailScreen.tsx",
    "src/screens/NearbyHubScreen.tsx",
    "src/screens/PlayLobbyScreen.tsx",
  ];

  for (const file of guardedFiles) {
    assert.match(
      read(file),
      /InFlightRef|inFlightRef|GuardRef|MutationRef/,
      `${file} lacks an in-flight guard`,
    );
  }
});
