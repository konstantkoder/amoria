import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { NEARBY_ACTIVITY_DEFINITIONS } from "../src/config/constants";

const migrationSql = fs.readFileSync(
  path.join(process.cwd(), "src/db/migrations/0023_expanded_activity_catalog.sql"),
  "utf8",
);
const scheduledRoomFieldsMigrationSql = fs.readFileSync(
  path.join(process.cwd(), "src/db/migrations/0024_scheduled_nearby_room_fields.sql"),
  "utf8",
);

test("expanded activity catalog migration updates the preference key check", () => {
  const roomTypeInsertStart = migrationSql.indexOf('INSERT INTO "nearby_room_types"');
  assert.notEqual(roomTypeInsertStart, -1);
  const constraintSql = migrationSql.slice(0, roomTypeInsertStart);

  for (const activity of NEARBY_ACTIVITY_DEFINITIONS) {
    assert.equal(
      constraintSql.includes(sqlLiteral(activity.key)),
      true,
      `Missing activity key check entry for ${activity.key}`,
    );
  }
});

test("expanded activity catalog migration seeds system room types only", () => {
  const roomTypeInsertStart = migrationSql.indexOf('INSERT INTO "nearby_room_types"');
  assert.notEqual(roomTypeInsertStart, -1);
  const roomTypeInsertSql = migrationSql.slice(roomTypeInsertStart);

  for (const activity of NEARBY_ACTIVITY_DEFINITIONS) {
    const expectedRow = `(${sqlLiteral(activity.key)}, ${sqlLiteral(activity.title)}, 'active', true, ${activity.sortOrder})`;
    assert.equal(
      roomTypeInsertSql.includes(expectedRow),
      true,
      `Missing room type seed row for ${activity.key}`,
    );
  }

  assert.equal(roomTypeInsertSql.includes('ON CONFLICT ("key") DO NOTHING'), true);
  assertNoFakeNearbyDataWrites(migrationSql);
});

test("scheduled nearby room fields migration only adds nullable room columns", () => {
  for (const column of [
    '"title" text',
    '"description" text',
    '"location_label" text',
    '"starts_at" timestamp with time zone',
    '"ends_at" timestamp with time zone',
    '"expires_at" timestamp with time zone',
    '"created_from_demand_snapshot" jsonb',
  ]) {
    assert.equal(
      scheduledRoomFieldsMigrationSql.includes(`ADD COLUMN ${column}`),
      true,
      `Missing nullable column addition for ${column}`,
    );
  }

  assert.equal(scheduledRoomFieldsMigrationSql.toLowerCase().includes("not null"), false);
  assertNoFakeNearbyScheduledDataWrites(scheduledRoomFieldsMigrationSql);
});

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertNoFakeNearbyDataWrites(sql: string): void {
  for (const forbiddenStatement of [
    'INSERT INTO "nearby_rooms"',
    'UPDATE "nearby_rooms"',
    'INSERT INTO "nearby_room_memberships"',
    'UPDATE "nearby_room_memberships"',
    'INSERT INTO "messages"',
    'UPDATE "messages"',
    'INSERT INTO "user_activity_preferences"',
    'UPDATE "user_activity_preferences"',
  ]) {
    assert.equal(sql.includes(forbiddenStatement), false, forbiddenStatement);
  }

  assert.equal(sql.includes("memberCount"), false);
  assert.equal(sql.includes("member_count"), false);
  assert.equal(sql.toLowerCase().includes("demand"), false);
}

function assertNoFakeNearbyScheduledDataWrites(sql: string): void {
  for (const forbiddenStatement of [
    'INSERT INTO "nearby_rooms"',
    'UPDATE "nearby_rooms"',
    'INSERT INTO "nearby_room_memberships"',
    'UPDATE "nearby_room_memberships"',
    'INSERT INTO "messages"',
    'UPDATE "messages"',
    'INSERT INTO "user_activity_preferences"',
    'UPDATE "user_activity_preferences"',
  ]) {
    assert.equal(sql.includes(forbiddenStatement), false, forbiddenStatement);
  }
}
