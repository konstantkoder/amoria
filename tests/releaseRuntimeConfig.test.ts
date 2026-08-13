import assert from "node:assert/strict";
import test from "node:test";

const buildExpoConfig = require("../app.config.js") as (input?: {
  config?: Record<string, unknown>;
}) => { android?: { usesCleartextTraffic?: boolean } };

function withEnvironment(values: Record<string, string>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("production Expo config requires public encrypted backend URLs", () => {
  withEnvironment({
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_API_URL: "https://api.amoria.example",
    EXPO_PUBLIC_WS_URL: "wss://api.amoria.example/ws",
  }, () => {
    const config = buildExpoConfig();
    assert.equal(config.android?.usesCleartextTraffic, false);
  });

  withEnvironment({
    EAS_BUILD_PROFILE: "production",
    EXPO_PUBLIC_API_URL: "http://192.168.1.10:4000",
    EXPO_PUBLIC_WS_URL: "ws://192.168.1.10:4000/ws",
  }, () => {
    assert.throws(() => buildExpoConfig(), /EXPO_PUBLIC_API_URL/);
  });
});
