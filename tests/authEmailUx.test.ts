import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.resolve(root, relativePath), "utf8");

test("mobile auth client implements verification and password-reset contracts", () => {
  const api = read("src/services/api/authApi.ts");
  assert.match(api, /\/auth\/verify-email/);
  assert.match(api, /\/auth\/resend-verification/);
  assert.match(api, /\/auth\/password-reset\/request/);
  assert.match(api, /\/auth\/password-reset\/confirm/);
});

test("registration remains unauthenticated until verification succeeds", () => {
  const context = read("src/contexts/AuthContext.tsx");
  const registerBlock = context.slice(context.indexOf("const register ="), context.indexOf("const verifyEmail ="));
  const verificationBlock = context.slice(context.indexOf("const verifyEmail ="), context.indexOf("const logout ="));

  assert.doesNotMatch(registerBlock, /await applyAuthResponse/);
  assert.match(verificationBlock, /applyAuthResponse/);
});

test("auth UI includes verification, resend cooldown, and forgot-password stages", () => {
  const login = read("src/screens/LoginScreen.tsx");
  const verification = read("src/screens/EmailVerificationScreen.tsx");
  const reset = read("src/screens/PasswordResetScreen.tsx");

  assert.match(login, /email_not_verified/);
  assert.match(login, /EmailVerificationScreen/);
  assert.match(login, /PasswordResetScreen/);
  assert.match(verification, /cooldownSec/);
  assert.match(verification, /textContentType="oneTimeCode"/);
  assert.match(reset, /genericRequest/);
  assert.match(reset, /newPassword/);
});

test("every API request reuses a persisted random install identifier", () => {
  const client = read("src/services/api/apiClient.ts");
  const device = read("src/services/deviceId.ts");

  assert.match(client, /headers\["x-device-id"\] = await getDeviceId\(\)/);
  assert.match(device, /AsyncStorage\.getItem/);
  assert.match(device, /AsyncStorage\.setItem/);
  assert.doesNotMatch(device, /return ["'](?:device|constant|amoria)["'];/i);
});

test("release locales contain all new authentication copy", () => {
  const keys = [
    "auth.verification.title",
    "auth.verification.resendCooldown",
    "auth.verification.invalidCode",
    "auth.reset.forgotPassword",
    "auth.reset.genericRequest",
    "auth.reset.invalidCode",
    "auth.rateLimited",
  ];
  for (const locale of ["en", "ru", "hr"]) {
    const messages = JSON.parse(read(`src/i18n/locales/${locale}.json`)) as Record<string, string>;
    for (const key of keys) assert.equal(typeof messages[key], "string", `${locale} missing ${key}`);
  }
});
