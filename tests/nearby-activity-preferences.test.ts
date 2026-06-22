import assert from "node:assert/strict";
import test from "node:test";
import type { UserActivityPreferenceRow } from "../src/db/schema";
import type { NearbyActivityPreferenceInput } from "../src/nearby/nearby-activity-preferences.types";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { NEARBY_ACTIVITY_DEFINITIONS } =
  require("../src/config/constants") as typeof import("../src/config/constants");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const activityPreferencesService =
  require("../src/nearby/nearby-activity-preferences.service") as typeof import("../src/nearby/nearby-activity-preferences.service");

const now = new Date("2026-06-22T10:00:00.000Z");
const earlier = new Date("2026-06-21T10:00:00.000Z");
const viewerId = "00000000-0000-4000-8000-000000000001";

let restoreActivityPreferencesDeps: (() => void) | null = null;

test.after(async () => {
  restoreDeps();
  await closeDb();
});

test("GET /nearby/activity-preferences returns available activities and empty preferences", async (t) => {
  t.after(restoreDeps);
  mockActivityPreferences();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/nearby/activity-preferences",
    headers: authHeaders(viewerId),
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), {
    availableActivities: expectedAvailableActivities(),
    preferences: [],
  });
  assertNoPrivateNearbyFields(response.json());
});

test("PUT /nearby/activity-preferences saves valid preferences", async (t) => {
  t.after(restoreDeps);
  const state = mockActivityPreferences();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "PUT",
    url: "/nearby/activity-preferences",
    headers: authHeaders(viewerId),
    payload: {
      preferences: [
        { activityKey: "coffee_nearby" },
        { activityKey: "walk_nearby", geoBucket: "city:zagreb:center" },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().preferences, [
    preferenceDto("coffee_nearby", null),
    preferenceDto("walk_nearby", "city:zagreb:center"),
  ]);
  assert.equal(state.preference(viewerId, "coffee_nearby", null)?.status, "active");
  assert.equal(
    state.preference(viewerId, "walk_nearby", "city:zagreb:center")?.source,
    "nearby_questionnaire",
  );
  assertNoPrivateNearbyFields(response.json());
});

test("PUT /nearby/activity-preferences replaces old active preferences", async (t) => {
  t.after(restoreDeps);
  const state = mockActivityPreferences({
    preferences: [
      preferenceRow(viewerId, "coffee_nearby", null),
      preferenceRow(viewerId, "walk_nearby", "city:zagreb:center"),
      preferenceRow(viewerId, "bike_nearby", null, { status: "disabled" }),
    ],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "PUT",
    url: "/nearby/activity-preferences",
    headers: authHeaders(viewerId),
    payload: {
      preferences: [
        { activityKey: "bike_nearby" },
        { activityKey: "cinema_today", geoBucket: null },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json().preferences, [
    preferenceDto("bike_nearby", null),
    preferenceDto("cinema_today", null),
  ]);
  assert.equal(state.preference(viewerId, "coffee_nearby", null)?.status, "disabled");
  assert.equal(
    state.preference(viewerId, "walk_nearby", "city:zagreb:center")?.status,
    "disabled",
  );
  assert.equal(state.preference(viewerId, "bike_nearby", null)?.status, "active");
  assert.equal(state.preference(viewerId, "cinema_today", null)?.status, "active");
  assertNoPrivateNearbyFields(response.json());
});

test("PUT /nearby/activity-preferences rejects invalid activity keys", async (t) => {
  t.after(restoreDeps);
  mockActivityPreferences();
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "PUT",
    url: "/nearby/activity-preferences",
    headers: authHeaders(viewerId),
    payload: {
      preferences: [{ activityKey: "fake_nearby" }],
    },
  });

  assert.equal(response.statusCode, 400);
  assert.equal(response.json().error.code, "validation_error");
});

test("activity preferences responses expose no exact coordinates or birthDate", async (t) => {
  t.after(restoreDeps);
  mockActivityPreferences({
    preferences: [preferenceRow(viewerId, "language_exchange_nearby", "district:west")],
  });
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "GET",
    url: "/nearby/activity-preferences",
    headers: authHeaders(viewerId),
  });

  assert.equal(response.statusCode, 200);
  assertNoPrivateNearbyFields(response.json());
});

function mockActivityPreferences(input: { preferences?: UserActivityPreferenceRow[] } = {}) {
  restoreDeps();

  const preferences = new Map<string, UserActivityPreferenceRow>(
    (input.preferences ?? []).map((preference) => [toPreferenceKey(preference), preference]),
  );

  restoreActivityPreferencesDeps =
    activityPreferencesService.__setNearbyActivityPreferencesServiceDepsForTests({
      now: () => new Date(now),
      repo: {
        listActiveUserActivityPreferences: async (userId) =>
          sortedActivePreferences([...preferences.values()].filter((row) => row.userId === userId)),
        replaceUserActivityPreferences: async (userId, requested, updatedAt) => {
          const requestedKeys = new Set(
            requested.map((preference) => toPreferenceKey({ userId, ...preference })),
          );

          for (const [key, row] of preferences.entries()) {
            if (row.userId === userId && row.status === "active" && !requestedKeys.has(key)) {
              preferences.set(key, { ...row, status: "disabled", updatedAt });
            }
          }

          for (const preference of requested) {
            const geoBucket = normalizeGeoBucket(preference.geoBucket);
            const key = toPreferenceKey({ userId, ...preference, geoBucket });
            const existing = preferences.get(key);
            preferences.set(
              key,
              existing
                ? { ...existing, status: "active", source: "nearby_questionnaire", updatedAt }
                : preferenceRow(userId, preference.activityKey, geoBucket, {
                    createdAt: updatedAt,
                    updatedAt,
                  }),
            );
          }

          return sortedActivePreferences(
            [...preferences.values()].filter((row) => row.userId === userId),
          );
        },
      },
    });

  return {
    preference: (
      userId: string,
      activityKey: UserActivityPreferenceRow["activityKey"],
      geoBucket: string | null,
    ) =>
      preferences.get(toPreferenceKey({ userId, activityKey, geoBucket })),
  };
}

function restoreDeps() {
  restoreActivityPreferencesDeps?.();
  restoreActivityPreferencesDeps = null;
}

function authHeaders(userId: string) {
  return {
    Authorization: `Bearer ${signAccessToken(userId)}`,
  };
}

function expectedAvailableActivities() {
  return NEARBY_ACTIVITY_DEFINITIONS.map((activity) => ({
    activityKey: activity.key,
    title: activity.title,
  }));
}

function preferenceRow(
  userId: string,
  activityKey: UserActivityPreferenceRow["activityKey"],
  geoBucket: string | null,
  overrides: Partial<UserActivityPreferenceRow> = {},
): UserActivityPreferenceRow {
  return {
    userId,
    activityKey,
    status: "active",
    geoBucket,
    source: "nearby_questionnaire",
    createdAt: earlier,
    updatedAt: now,
    ...overrides,
  };
}

function preferenceDto(
  activityKey: UserActivityPreferenceRow["activityKey"],
  geoBucket: string | null,
) {
  return {
    activityKey,
    status: "active",
    geoBucket,
    source: "nearby_questionnaire",
    updatedAt: now.toISOString(),
  };
}

function sortedActivePreferences(rows: UserActivityPreferenceRow[]) {
  return rows
    .filter((row) => row.status === "active" && row.source === "nearby_questionnaire")
    .sort((left, right) =>
      `${left.activityKey}:${left.geoBucket ?? ""}`.localeCompare(
        `${right.activityKey}:${right.geoBucket ?? ""}`,
      ),
    );
}

function toPreferenceKey(
  preference: Pick<NearbyActivityPreferenceInput, "activityKey" | "geoBucket"> & {
    userId: string;
  },
) {
  return `${preference.userId}:${preference.activityKey}:${normalizeGeoBucket(preference.geoBucket) ?? ""}`;
}

function normalizeGeoBucket(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function assertNoPrivateNearbyFields(value: unknown) {
  const serialized = JSON.stringify(value);
  assert.equal(serialized.includes("latitude"), false);
  assert.equal(serialized.includes("longitude"), false);
  assert.equal(serialized.includes("birthDate"), false);
  assert.equal(serialized.includes("birth_date"), false);
  assert.equal(serialized.includes("distanceKm"), false);
  assert.equal(serialized.includes("distanceMeters"), false);
}
