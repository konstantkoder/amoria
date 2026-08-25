import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.AUTH_SECURITY_HMAC_SECRET = "test-auth-security-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const root = path.resolve(__dirname, "..");
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("src/db/migrations/0034_release_essentials.sql");
const repo = read("src/notifications/notifications.repo.ts");
const sender = read("src/notifications/push-delivery.service.ts");

test("notification and token persistence has authoritative ownership and idempotency constraints", () => {
  assert.match(migration, /CREATE TABLE "notifications"/);
  assert.match(migration, /notifications_user_event_unique/);
  assert.match(migration, /push_tokens_token_unique/);
  assert.match(migration, /push_tokens_user_device_unique/);
  assert.match(migration, /disabled_at/);
  assert.match(repo, /onConflictDoNothing/);
  assert.match(repo, /delete\(pushTokens\)[\s\S]*pushTokens\.token[\s\S]*pushTokens\.deviceId/);
});

test("notification API exposes only the signed-in user's list/read/token operations", () => {
  const routes = read("src/notifications/notifications.routes.ts");
  for (const endpoint of ["/notifications", "/notifications/:id/read", "/push/token"]) assert.ok(routes.includes(endpoint));
  assert.match(routes, /preHandler: authMiddleware/g);
  assert.match(repo, /eq\(notifications\.userId, userId\)/);
  assert.match(repo, /eq\(pushTokens\.userId, userId\)/);
});

test("real chat and Together events persist generic, idempotent notification rows after business commit", () => {
  const chat = read("src/chat/chat.routes.ts");
  const together = read("src/together/together.routes.ts");
  assert.match(chat, /type: "direct_message"/);
  assert.match(chat, /payload: \{ threadId: result\.threadId \}/);
  assert.doesNotMatch(chat, /payload: \{[^}]*message\.text/);
  assert.match(together, /type: "together_match"/);
  assert.match(together, /type: "together_action"/);
  assert.match(chat, /await Promise\.all[\s\S]*\.catch/);
  assert.match(together, /await Promise\.all[\s\S]*\.catch/);
});

test("Expo sender is privacy-safe, bounded, timeout-controlled and retries only transient failures", () => {
  const push = require("../src/notifications/push-delivery.service") as typeof import("../src/notifications/push-delivery.service");
  assert.deepEqual(push.pushCopy("direct_message"), { title: "Amoria", body: "You have a new message." });
  const safe = push.safeData({
    notification: { id: "notification-id", type: "direct_message", payload: { threadId: "thread-id", messageBody: "secret", exactLocation: "45,16" } },
  } as never);
  assert.deepEqual(safe, { notificationId: "notification-id", type: "direct_message", threadId: "thread-id" });
  assert.equal(push.transientStatus(429), true);
  assert.equal(push.transientStatus(503), true);
  assert.equal(push.transientStatus(400), false);
  assert.match(sender, /const MAX_BATCH = 100/);
  assert.match(sender, /AbortController/);
  assert.match(sender, /PUSH_REQUEST_TIMEOUT_MS/);
  assert.match(sender, /attemptCount >= 3|markDeliveryRetry/);
  assert.match(sender, /DeviceNotRegistered/);
  assert.match(sender, /processPushReceipts/);
  assert.match(repo, /attemptCount >= 4/);
  assert.match(repo, /status, "sending"[\s\S]*staleSendingAt/);
});

test("account deletion removes both notification records and push associations", () => {
  const deletion = read("src/users/account-deletion.service.ts");
  assert.match(deletion, /DELETE FROM push_tokens WHERE user_id=\$1/);
  assert.match(deletion, /DELETE FROM notifications WHERE user_id=\$1/);
});
