import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { APP_LOCALES, normalizeAppLocale } from "../src/i18n/app-locales";
import { normalizeEmailLocale, renderAuthEmail } from "../src/email/email-templates";
import { pushCopy, safeData } from "../src/notifications/push-delivery.service";
import { parsePushTokenBody } from "../src/notifications/notifications.schemas";
import type { NotificationType } from "../src/notifications/notifications.types";
import * as usersRepo from "../src/users/users.repo";
import * as usersService from "../src/users/users.service";
import type { UserRow } from "../src/db/schema";

const expectedLocales = ["en","ru","hr","uk","pl","de","fr","es","it","pt","nl","sv","no","da","fi","cs","sk","sl","sr","bs","ro","hu","el","tr"] as const;
const notificationTypes: NotificationType[] = [
  "direct_message", "together_match", "together_action", "announcement",
  "founder_activated", "founder_premium_started", "founder_premium_expiring",
  "founder_premium_expired", "premium_activated", "premium_restored",
  "premium_billing_issue", "community_activity",
];

test("the server locale contract exposes exactly the 24 release languages", () => {
  assert.deepEqual(APP_LOCALES, expectedLocales);
  assert.equal(new Set(APP_LOCALES).size, 24);
  assert.equal(normalizeAppLocale("de-DE"), "de");
  assert.equal(normalizeAppLocale("UK_ua"), "uk");
  assert.equal(normalizeAppLocale("unknown"), "en");
});

test("verification and password reset email copy is complete in all 24 languages", () => {
  for (const locale of APP_LOCALES) {
    for (const purpose of ["verify_email", "password_reset"] as const) {
      const rendered = renderAuthEmail({ purpose, locale, code: "127127", expiresInMinutes: 15 });
      assert.ok(rendered.subject.trim(), `${locale}/${purpose} subject`);
      assert.equal(rendered.text.match(/127127/g)?.length, 1, `${locale}/${purpose} text code`);
      assert.equal(rendered.html.match(/127127/g)?.length, 1, `${locale}/${purpose} html code`);
      const expiryValue = new Intl.NumberFormat(locale).format(15);
      assert.ok(rendered.text.includes(expiryValue), `${locale}/${purpose} text expiry`);
      assert.ok(rendered.html.includes(expiryValue), `${locale}/${purpose} html expiry`);
      assert.doesNotMatch(`${rendered.subject}${rendered.text}${rendered.html}`, /(?:verification|password_reset)\.[a-z_]+/);
      assert.equal(/accessToken|refreshToken|passwordHash/i.test(`${rendered.text}${rendered.html}`), false);
    }
  }
  assert.equal(normalizeEmailLocale("not-a-locale"), "en");
  assert.equal(normalizeEmailLocale(undefined), "en");
});

test("remote push catalog covers every notification type in every recipient locale", () => {
  for (const locale of APP_LOCALES) {
    for (const type of notificationTypes) {
      const copy = pushCopy(type, locale);
      assert.equal(copy.title, "Amoria");
      assert.ok(copy.body.trim(), `${locale}/${type}`);
    }
  }
  assert.deepEqual(pushCopy("direct_message", "unknown"), pushCopy("direct_message", "en"));
});

test("push-token locale validation supports current and legacy clients", () => {
  const base = { token: "ExpoPushToken[release-i18n-token]", platform: "android", deviceId: "device-123" };
  assert.equal(parsePushTokenBody({ ...base, locale: "el" }).locale, "el");
  assert.equal(parsePushTokenBody(base).locale, undefined);
  assert.throws(() => parsePushTokenBody({ ...base, locale: "xx" }));
});

test("preferred locale is strictly validated and persisted through the user repository", async () => {
  const calls: Array<{ userId: string; locale: string }> = [];
  const restore = usersService.__setUsersServiceDepsForTests({
    repo: {
      ...usersRepo,
      updateUserPreferredLocale: async (userId, locale) => {
        calls.push({ userId, locale });
        return { id: userId, preferredLocale: locale } as UserRow;
      },
    },
  });
  try {
    assert.deepEqual(await usersService.updatePreferredLocale("user-id", "de"), { preferredLocale: "de" });
    assert.deepEqual(calls, [{ userId: "user-id", locale: "de" }]);
    await assert.rejects(() => usersService.updatePreferredLocale("user-id", "de-DE"));
    assert.equal(calls.length, 1);
  } finally {
    restore();
  }
});

test("push routing keeps secrets and exact location out of OS payloads", () => {
  const row = {
    notification: {
      id: "notification-id",
      type: "direct_message",
      payload: { threadId: "thread-id", messageBody: "secret", exactLocation: "45,16" },
    },
  } as unknown as Parameters<typeof safeData>[0];
  assert.deepEqual(safeData(row), { notificationId: "notification-id", type: "direct_message", threadId: "thread-id" });
});

test("0041 is forward-only, validates locale columns, and leaves account deletion ownership intact", () => {
  const migration = fs.readFileSync(path.resolve("src/db/migrations/0041_user_locale_support.sql"), "utf8");
  const previousMigration = fs.readFileSync(path.resolve("src/db/migrations/0040_release_monetization_founder_growth.sql"), "utf8");
  const deletion = fs.readFileSync(path.resolve("src/users/account-deletion.service.ts"), "utf8");
  assert.match(migration, /ADD COLUMN "preferred_locale"/);
  assert.match(migration, /ADD COLUMN "locale"/);
  for (const locale of APP_LOCALES) assert.ok(migration.includes(`'${locale}'`));
  assert.doesNotMatch(migration, /DROP TABLE|DROP COLUMN|TRUNCATE/i);
  assert.ok(previousMigration.length > 0);
  assert.match(deletion, /DELETE FROM push_tokens WHERE user_id=\$1/);
  assert.match(deletion, /preferred_locale='en'/);
});
