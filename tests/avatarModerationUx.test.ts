import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const profileScreen = fs.readFileSync(path.join(root, "src/screens/ProfileScreen.tsx"), "utf8");

test("avatar upload remains pending until the server adopts it", () => {
  assert.match(profileScreen, /await uploadUserAvatar\(/);
  assert.doesNotMatch(profileScreen, /updateUserAvatarUrl/);
  assert.match(profileScreen, /refreshUserProfile\(\)/);
  assert.match(profileScreen, /photos\.avatarSubmittedForReview/);
});

test("avatar review confirmation exists in every release locale", () => {
  for (const locale of ["en", "ru", "hr"]) {
    const messages = JSON.parse(
      fs.readFileSync(path.join(root, `src/i18n/locales/${locale}.json`), "utf8"),
    );
    assert.equal(typeof messages["photos.avatarSubmittedForReview"], "string");
    assert.ok(messages["photos.avatarSubmittedForReview"].trim().length > 0);
  }
});
