import assert from "node:assert/strict";
import test from "node:test";

type ExpoConfig = {
  name?: string;
  scheme?: string;
  android?: { package?: string; usesCleartextTraffic?: boolean };
  ios?: { bundleIdentifier?: string };
};

const buildExpoConfig = require("../app.config.js") as (input?: {
  config?: Record<string, unknown>;
}) => ExpoConfig;

const MANAGED_ENV_KEYS = [
  "APP_VARIANT",
  "EAS_BUILD_PROFILE",
  "EXPO_PUBLIC_API_URL",
  "EXPO_PUBLIC_WS_URL",
];

function withEnvironment(values: Record<string, string>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of MANAGED_ENV_KEYS) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  Object.assign(process.env, values);
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("Expo config resolves isolated development, preview, and production identities", () => {
  const expected = {
    development: ["Amoria Dev", "com.kostiantyndemidets.amoria.dev", "amoria-dev", undefined],
    preview: ["Amoria Preview", "com.kostiantyndemidets.amoria.preview", "amoria-preview", undefined],
    production: ["Amoria", "com.kostiantyndemidets.amoria", "amoria", false],
  } as const;

  for (const [variant, [name, identifier, scheme, cleartext]] of Object.entries(expected)) {
    withEnvironment({
      APP_VARIANT: variant,
      ...(variant === "production" ? {
        EXPO_PUBLIC_API_URL: "https://api.amoria.example",
        EXPO_PUBLIC_WS_URL: "wss://api.amoria.example/ws",
      } : {}),
    }, () => {
      const config = buildExpoConfig();
      assert.equal(config.name, name);
      assert.equal(config.scheme, scheme);
      assert.equal(config.android?.package, identifier);
      assert.equal(config.ios?.bundleIdentifier, identifier);
      assert.equal(config.android?.usesCleartextTraffic, cleartext);
    });
  }
});

test("production Expo config requires public encrypted backend URLs", () => {
  withEnvironment({
    APP_VARIANT: "production",
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_API_URL: "https://api.amoria.example",
    EXPO_PUBLIC_WS_URL: "wss://api.amoria.example/ws",
  }, () => {
    const config = buildExpoConfig();
    assert.equal(config.android?.usesCleartextTraffic, false);
  });

  withEnvironment({
    APP_VARIANT: "production",
    EXPO_PUBLIC_API_URL: "http://192.168.1.10:4000",
    EXPO_PUBLIC_WS_URL: "ws://192.168.1.10:4000/ws",
  }, () => {
    assert.throws(() => buildExpoConfig(), /EXPO_PUBLIC_API_URL/);
  });

  withEnvironment({
    APP_VARIANT: "production",
    EXPO_PUBLIC_API_URL: "https://api.amoria.example",
    EXPO_PUBLIC_WS_URL: "ws://api.amoria.example/ws",
  }, () => {
    assert.throws(() => buildExpoConfig(), /EXPO_PUBLIC_WS_URL/);
  });
});

test("invalid or mismatched variants fail closed", () => {
  withEnvironment({ APP_VARIANT: "staging" }, () => {
    assert.throws(() => buildExpoConfig(), /APP_VARIANT/);
  });
  withEnvironment({ APP_VARIANT: "preview", EAS_BUILD_PROFILE: "production" }, () => {
    assert.throws(() => buildExpoConfig(), /does not match/);
  });
});
