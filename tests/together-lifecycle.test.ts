import assert from "node:assert/strict";
import test from "node:test";
import type {
  NewTogetherEventRow,
  TogetherEventRow,
  TogetherQueueRow,
  TogetherRevealRow,
  TogetherSessionRow,
} from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const togetherService = require(
  "../src/together/together.service",
) as typeof import("../src/together/together.service");
const togetherRepo = require(
  "../src/together/together.repo",
) as typeof import("../src/together/together.repo");
const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

type RepoMock = Partial<Record<keyof typeof import("../src/together/together.repo"), unknown>>;
type ServiceDepsMock = Parameters<typeof togetherService.__setTogetherServiceDepsForTests>[0];

const sessionId = "00000000-0000-4000-8000-000000000101";
const userAId = "00000000-0000-4000-8000-000000000001";
const userBId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000301";
const createdAt = new Date("2026-01-01T00:00:00.000Z");
const endedAt = new Date("2026-01-01T00:01:00.000Z");

let restoreDeps: (() => void) | null = null;

test.after(async () => {
  restoreRepoMock();
  await closeDb();
});

test("leave active Together session marks it abandoned", async (t) => {
  t.after(restoreRepoMock);

  let leftMarked = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active" }),
    markSessionMemberLeft: async () => {
      leftMarked = true;
    },
    closeActiveSession: async () =>
      sessionRow({
        status: "abandoned",
        finishedAt: endedAt,
        endedReason: "participant_left",
      }),
  });

  const result = await togetherService.leaveSession(userAId, sessionId);

  assert.equal(leftMarked, true);
  assert.equal(result.changed, true);
  assert.equal(result.reason, "participant_left");
  assert.equal(result.actorUserId, userAId);
  assert.equal(result.response.session.status, "abandoned");
  assert.equal(result.response.session.endedReason, "participant_left");
});

test("second participant getSession sees abandoned session", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    findSessionForMember: async () =>
      sessionRow({
        status: "abandoned",
        finishedAt: endedAt,
        endedReason: "participant_left",
      }),
  });

  const response = await togetherService.getSession(userBId, sessionId);

  assert.equal(response.session.status, "abandoned");
  assert.equal(response.session.endedReason, "participant_left");
});

test("createEvent after abandoned session is rejected", async (t) => {
  t.after(restoreRepoMock);

  let eventWritten = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "abandoned" }),
    createEventIdempotent: async () => {
      eventWritten = true;
      throw new Error("Unexpected event write");
    },
  });

  await assert.rejects(
    togetherService.createEvent(userAId, sessionId, {
      clientEventId: "stroke-1",
      type: "stroke_batch",
      payload: { strokes: [] },
    }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "together_session_closed");
      assert.equal(appError.statusCode, 409);
      return true;
    },
  );
  assert.equal(eventWritten, false);
});

test("createEvent after finished or cancelled session is rejected", async (t) => {
  t.after(restoreRepoMock);

  for (const status of ["finished", "cancelled"] as const) {
    let eventWritten = false;
    mockRepo({
      findSessionForMember: async () => sessionRow({ status }),
      createEventIdempotent: async () => {
        eventWritten = true;
        throw new Error("Unexpected event write");
      },
    });

    await assert.rejects(
      togetherService.createEvent(userAId, sessionId, {
        clientEventId: `stroke-${status}`,
        type: "stroke_batch",
        payload: { strokes: [] },
      }),
      (error) => {
        const appError = error as { code?: string; statusCode?: number };
        assert.equal(appError.code, "together_session_closed");
        assert.equal(appError.statusCode, 409);
        return true;
      },
    );
    assert.equal(eventWritten, false);
  }
});

test("draw reveal before finish returns 409", async (t) => {
  t.after(restoreRepoMock);

  let revealWritten = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active", activity: "draw" }),
    upsertReveal: async () => {
      revealWritten = true;
    },
  });

  await assert.rejects(
    togetherService.reveal(userAId, sessionId, { decision: "open" }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "together_session_closed");
      assert.equal(appError.statusCode, 409);
      return true;
    },
  );
  assert.equal(revealWritten, false);
});

test("queue rejects removed color_mood activity", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let enqueued = false;
  mockRepo({
    enqueueAndMatch: async () => {
      enqueued = true;
      throw new Error("removed color_mood activity must not enqueue");
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "color_mood",
    },
  });

  const body = response.json();

  assert.equal(response.statusCode, 400);
  assert.equal(enqueued, false);
  assert.equal(body.error.code, "validation_error");
});

test("queue accepts story_sparks activity", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let enqueuedActivity: string | undefined;
  mockRepo({
    enqueueAndMatch: async (input: { activity: string }) => {
      enqueuedActivity = input.activity;
      return queueRow({
        activity: input.activity,
        status: "waiting",
        matchedSessionId: null,
      });
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "story_sparks",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(enqueuedActivity, "story_sparks");
  assert.equal(response.json().entry.status, "waiting");
});

test("story_sparks queue does not match draw", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockRepo({
    enqueueAndMatch: async (input: { activity: string }) =>
      queueRow({
        activity: input.activity,
        status: input.activity === "story_sparks" ? "waiting" : "matched",
        matchedSessionId: input.activity === "story_sparks" ? null : sessionId,
      }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "story_sparks",
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.entry.status, "waiting");
  assert.equal(body.entry.sessionId, undefined);
});

test("story_sparks queue creates matched session activity", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockRepo({
    enqueueAndMatch: async (input: { activity: string }) =>
      queueRow({
        activity: input.activity,
        status: "matched",
        matchedSessionId: sessionId,
      }),
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "story_sparks",
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.entry.status, "matched");
  assert.equal(body.entry.sessionId, sessionId);
});

test("queue accepts valid Together location and radius", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let enqueuedLocation:
    | { latitude?: number | null; longitude?: number | null; radiusKm?: number | null }
    | undefined;
  mockRepo({
    enqueueAndMatch: async (input: {
      activity: string;
      latitude?: number | null;
      longitude?: number | null;
      radiusKm?: number | null;
    }) => {
      enqueuedLocation = {
        latitude: input.latitude,
        longitude: input.longitude,
        radiusKm: input.radiusKm,
      };
      return queueRow({
        activity: input.activity,
        status: "waiting",
        matchedSessionId: null,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        radiusKm: input.radiusKm ?? null,
        locationUpdatedAt: new Date(),
      });
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "draw",
      location: {
        latitude: 52.2297,
        longitude: 21.0122,
        radiusKm: 25,
      },
    },
  });
  const bodyText = response.body;

  assert.equal(response.statusCode, 200);
  assert.deepEqual(enqueuedLocation, {
    latitude: 52.2297,
    longitude: 21.0122,
    radiusKm: 25,
  });
  assert.equal(bodyText.includes("latitude"), false);
  assert.equal(bodyText.includes("longitude"), false);
});

test("queue defaults to no-limit matching without coordinates", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let enqueuedLocation:
    | { latitude?: number | null; longitude?: number | null; radiusKm?: number | null }
    | undefined;
  mockRepo({
    enqueueAndMatch: async (input: {
      activity: string;
      latitude?: number | null;
      longitude?: number | null;
      radiusKm?: number | null;
    }) => {
      enqueuedLocation = {
        latitude: input.latitude,
        longitude: input.longitude,
        radiusKm: input.radiusKm,
      };
      return queueRow({
        activity: input.activity,
        status: "matched",
        matchedSessionId: sessionId,
        latitude: null,
        longitude: null,
        radiusKm: null,
      });
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "story_sparks",
    },
  });
  const bodyText = response.body;
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.deepEqual(enqueuedLocation, {
    latitude: null,
    longitude: null,
    radiusKm: null,
  });
  assert.equal(body.entry.status, "matched");
  assert.equal(body.entry.sessionId, sessionId);
  assert.equal(bodyText.includes("latitude"), false);
  assert.equal(bodyText.includes("longitude"), false);
});

test("queue rejects invalid Together latitude and radius", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let enqueueCalled = false;
  mockRepo({
    enqueueAndMatch: async () => {
      enqueueCalled = true;
      return queueRow();
    },
  });

  const invalidLatitude = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "draw",
      location: {
        latitude: 91,
        longitude: 21.0122,
        radiusKm: 25,
      },
    },
  });

  const invalidRadius = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "draw",
      location: {
        latitude: 52.2297,
        longitude: 21.0122,
        radiusKm: 10,
      },
    },
  });

  assert.equal(invalidLatitude.statusCode, 400);
  assert.equal(invalidRadius.statusCode, 400);
  assert.equal(enqueueCalled, false);
});

test("queue rejects finite radius without coordinates", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "draw",
      location: {
        radiusKm: 5,
      },
    },
  });

  assert.equal(response.statusCode, 400);
});

test("Together geo matching accepts nearby users and rejects outside radius", () => {
  const { areQueueEntriesGeoCompatible } = togetherRepo.__geoForTests;
  const warsaw = { latitude: 52.2297, longitude: 21.0122, radiusKm: 25 };
  const nearbyWarsaw = { latitude: 52.25, longitude: 21.02, radiusKm: 25 };
  const berlin = { latitude: 52.52, longitude: 13.405, radiusKm: 250 };

  assert.equal(areQueueEntriesGeoCompatible(warsaw, nearbyWarsaw), true);
  assert.equal(areQueueEntriesGeoCompatible(warsaw, berlin), false);
});

test("Together geo matching uses stricter radius and supports unlimited mode", () => {
  const { areQueueEntriesGeoCompatible } = togetherRepo.__geoForTests;
  const warsawWide = { latitude: 52.2297, longitude: 21.0122, radiusKm: 250 };
  const warsawTight = { latitude: 52.2297, longitude: 21.0122, radiusKm: 5 };
  const nearbyWarsaw = { latitude: 52.25, longitude: 21.02, radiusKm: 5 };
  const lodzTight = { latitude: 51.7592, longitude: 19.456, radiusKm: 25 };
  const lodzUnlimited = { latitude: 51.7592, longitude: 19.456, radiusKm: null };
  const noLocationUnlimited = { radiusKm: null };

  assert.equal(areQueueEntriesGeoCompatible(warsawTight, nearbyWarsaw), true);
  assert.equal(areQueueEntriesGeoCompatible(warsawWide, lodzTight), false);
  assert.equal(areQueueEntriesGeoCompatible(warsawWide, lodzUnlimited), true);
  assert.equal(areQueueEntriesGeoCompatible(noLocationUnlimited, { radiusKm: null }), true);
  assert.equal(areQueueEntriesGeoCompatible(noLocationUnlimited, lodzTight), false);
});

test("draw queue retry delegates each attempt to the repository", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let callCount = 0;
  mockRepo({
    enqueueAndMatch: async (input: { activity: string }) => {
      callCount += 1;
      return queueRow({
        id: `00000000-0000-4000-8000-00000000050${callCount}`,
        activity: input.activity,
        status: "waiting",
        matchedSessionId: null,
      });
    },
  });

  const first = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "draw",
    },
  });

  const second = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "draw",
    },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(callCount, 2);
  assert.notEqual(first.json().entry.id, second.json().entry.id);
});

test("story_sparks queue passes geo filtering payload", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let enqueuedActivity = "";
  let enqueuedRadius: number | null | undefined;
  mockRepo({
    enqueueAndMatch: async (input: { activity: string; radiusKm?: number | null }) => {
      enqueuedActivity = input.activity;
      enqueuedRadius = input.radiusKm;
      return queueRow({
        activity: input.activity,
        status: "waiting",
        matchedSessionId: null,
        radiusKm: input.radiusKm ?? null,
      });
    },
  });

  const response = await app.inject({
    method: "POST",
    url: "/together/queue",
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      activity: "story_sparks",
      location: {
        latitude: 45.815,
        longitude: 15.9819,
        radiusKm: 100,
      },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(enqueuedActivity, "story_sparks");
  assert.equal(enqueuedRadius, 100);
});

test("participant can get Together session events through endpoint", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockRepo({
    listSessionEventsForMember: async () => [
      eventRow({
        id: "00000000-0000-4000-8000-000000000111",
        clientEventId: "stroke-1",
        payload: { strokes: [] },
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000112",
        clientEventId: "system-1",
        type: "system",
        payload: { name: "finish" },
      }),
    ],
  });

  const response = await app.inject({
    method: "GET",
    url: `/together/sessions/${sessionId}/events`,
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 200);
  assert.equal(body.nextCursor, null);
  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].sessionId, sessionId);
  assert.equal(body.items[0].fromUserId, userAId);
  assert.equal(body.items[0].clientEventId, "stroke-1");
  assert.equal(body.items[0].type, "stroke_batch");
  assert.equal(body.items[1].clientEventId, "system-1");
  assert.equal(body.items[1].type, "system");
  assert.deepEqual(body.items[1].payload, { name: "finish" });
});

test("nonparticipant cannot get Together session events through endpoint", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockRepo({
    listSessionEventsForMember: async () => undefined,
  });

  const response = await app.inject({
    method: "GET",
    url: `/together/sessions/${sessionId}/events`,
    headers: {
      Authorization: `Bearer ${signAccessToken("00000000-0000-4000-8000-000000000003")}`,
    },
  });
  const body = response.json();

  assert.equal(response.statusCode, 404);
  assert.equal(body.error.code, "not_found");
  assert.equal(body.items, undefined);
});

test("Together session events endpoint returns stable event order", async (t) => {
  t.after(restoreRepoMock);

  const sameCreatedAt = new Date("2026-01-01T00:00:02.000Z");
  mockRepo({
    listSessionEventsForMember: async () => [
      eventRow({
        id: "00000000-0000-4000-8000-000000000202",
        clientEventId: "same-created-b",
        createdAt: sameCreatedAt,
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000101",
        clientEventId: "earlier",
        createdAt: new Date("2026-01-01T00:00:01.000Z"),
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000201",
        clientEventId: "same-created-a",
        createdAt: sameCreatedAt,
      }),
    ],
  });

  const response = await togetherService.listSessionEventsForMember(userAId, sessionId);

  assert.deepEqual(
    response.items.map((event) => event.clientEventId),
    ["earlier", "same-created-a", "same-created-b"],
  );
  assert.equal(response.nextCursor, null);
});

test("Together session events endpoint returns empty items for empty member session", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    listSessionEventsForMember: async () => [],
  });

  const response = await togetherService.listSessionEventsForMember(userAId, sessionId);

  assert.deepEqual(response, { items: [], nextCursor: null });
});

test("Together sendEvent endpoint still creates events", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let insertedClientEventId: string | undefined;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active" }),
    createEventIdempotent: async (input: NewTogetherEventRow) => {
      insertedClientEventId = input.clientEventId;
      return {
        event: eventRow({
          clientEventId: input.clientEventId,
          payload: input.payload,
        }),
        created: true,
      };
    },
  });

  const response = await app.inject({
    method: "POST",
    url: `/together/sessions/${sessionId}/events`,
    headers: {
      Authorization: `Bearer ${signAccessToken(userAId)}`,
    },
    payload: {
      clientEventId: "stroke-post-1",
      type: "stroke_batch",
      payload: { strokes: [] },
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true, created: true });
  assert.equal(insertedClientEventId, "stroke-post-1");
});

test("draw session rejects removed palette events", async (t) => {
  t.after(restoreRepoMock);

  let eventWritten = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active", activity: "draw" }),
    createEventIdempotent: async () => {
      eventWritten = true;
      throw new Error("Palette events must not be written");
    },
  });

  await assert.rejects(
    togetherService.createEvent(userAId, sessionId, {
      clientEventId: "palette-1",
      type: "palette",
      payload: { color: "#38BDF8", label: "calm" },
    } as never),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "validation_error");
      assert.equal(appError.statusCode, 400);
      return true;
    },
  );
  assert.equal(eventWritten, false);
});

test("story_sparks session accepts story_choice events", async (t) => {
  t.after(restoreRepoMock);

  let insertedType: string | undefined;
  let insertedPayload: unknown;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active", activity: "story_sparks" }),
    findStoryChoiceEventForRound: async () => undefined,
    createEventIdempotent: async (input: NewTogetherEventRow) => {
      insertedType = input.type;
      insertedPayload = input.payload;
      return {
        event: eventRow({
          clientEventId: input.clientEventId,
          type: input.type,
          payload: input.payload,
        }),
        created: true,
      };
    },
  });

  const result = await togetherService.createEvent(userAId, sessionId, {
    clientEventId: "story-place-1",
    type: "story_choice",
    payload: {
      roundId: "place",
      cardId: "night_train",
      packId: "first_sparks_v1",
      clientRoundIndex: 0,
    },
  });

  assert.equal(result.response.created, true);
  assert.equal(result.event.type, "story_choice");
  assert.equal(insertedType, "story_choice");
  assert.deepEqual(insertedPayload, {
    roundId: "place",
    cardId: "night_train",
    packId: "first_sparks_v1",
    clientRoundIndex: 0,
  });
});

test("duplicate story_sparks round choice is idempotent for same card", async (t) => {
  t.after(restoreRepoMock);

  let eventWritten = false;
  const existing = eventRow({
    type: "story_choice",
    clientEventId: "story-place-existing",
    payload: {
      roundId: "place",
      cardId: "night_train",
      packId: "first_sparks_v1",
      clientRoundIndex: 0,
    },
  });
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active", activity: "story_sparks" }),
    findStoryChoiceEventForRound: async () => existing,
    createEventIdempotent: async () => {
      eventWritten = true;
      throw new Error("Duplicate story choice must not create a second event");
    },
  });

  const result = await togetherService.createEvent(userAId, sessionId, {
    clientEventId: "story-place-retry",
    type: "story_choice",
    payload: {
      roundId: "place",
      cardId: "night_train",
      packId: "first_sparks_v1",
      clientRoundIndex: 0,
    },
  });

  assert.equal(eventWritten, false);
  assert.equal(result.response.created, false);
  assert.equal(result.event.clientEventId, "story-place-existing");
});

test("duplicate story_sparks round choice rejects different card", async (t) => {
  t.after(restoreRepoMock);

  let eventWritten = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active", activity: "story_sparks" }),
    findStoryChoiceEventForRound: async () =>
      eventRow({
        type: "story_choice",
        payload: {
          roundId: "place",
          cardId: "night_train",
          packId: "first_sparks_v1",
          clientRoundIndex: 0,
        },
      }),
    createEventIdempotent: async () => {
      eventWritten = true;
      throw new Error("Conflicting story choice must not create an event");
    },
  });

  await assert.rejects(
    togetherService.createEvent(userAId, sessionId, {
      clientEventId: "story-place-conflict",
      type: "story_choice",
      payload: {
        roundId: "place",
        cardId: "small_cafe",
        packId: "first_sparks_v1",
        clientRoundIndex: 0,
      },
    }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "validation_error");
      assert.equal(appError.statusCode, 400);
      return true;
    },
  );
  assert.equal(eventWritten, false);
});

test("story_choice is rejected for non-story activity", async (t) => {
  t.after(restoreRepoMock);

  let eventWritten = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active", activity: "draw" }),
    createEventIdempotent: async () => {
      eventWritten = true;
      throw new Error("story_choice must not be written to draw sessions");
    },
  });

  await assert.rejects(
    togetherService.createEvent(userAId, sessionId, {
      clientEventId: "story-invalid",
      type: "story_choice",
      payload: {
        roundId: "place",
        cardId: "night_train",
        packId: "first_sparks_v1",
        clientRoundIndex: 0,
      },
    }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "validation_error");
      assert.equal(appError.statusCode, 400);
      return true;
    },
  );
  assert.equal(eventWritten, false);
});

test("finish active Together session marks it finished", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active" }),
    finishActiveSession: async () =>
      sessionRow({
        status: "finished",
        finishedAt: endedAt,
        endedReason: "completed",
      }),
  });

  const result = await togetherService.finishSession(userAId, sessionId);

  assert.equal(result.changed, true);
  assert.equal(result.reason, "completed");
  assert.equal(result.response.session.status, "finished");
  assert.equal(result.response.session.endedReason, "completed");
});

test("finish story_sparks Together session keeps activity and story pack in response", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    findSessionForMember: async () =>
      sessionRow({ status: "active", activity: "story_sparks" }),
    finishActiveSession: async () =>
      sessionRow({
        status: "finished",
        activity: "story_sparks",
        finishedAt: endedAt,
        endedReason: "completed",
      }),
  });

  const result = await togetherService.finishSession(userAId, sessionId);

  assert.equal(result.changed, true);
  assert.equal(result.response.session.activity, "story_sparks");
  assert.equal(result.response.session.storyPack?.packId, "first_sparks_v1");
  assert.equal(result.response.session.status, "finished");
});

test("finish abandoned Together session does not turn it finished", async (t) => {
  t.after(restoreRepoMock);

  let finishCalled = false;
  mockRepo({
    findSessionForMember: async () =>
      sessionRow({
        status: "abandoned",
        finishedAt: endedAt,
        endedReason: "participant_left",
      }),
    finishActiveSession: async () => {
      finishCalled = true;
      return sessionRow({ status: "finished" });
    },
  });

  const result = await togetherService.finishSession(userAId, sessionId);

  assert.equal(finishCalled, false);
  assert.equal(result.changed, false);
  assert.equal(result.response.session.status, "abandoned");
});

test("reveal abandoned Together session does not create outcome or chat", async (t) => {
  t.after(restoreRepoMock);

  let revealWritten = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "abandoned" }),
    upsertReveal: async () => {
      revealWritten = true;
    },
  });

  await assert.rejects(
    togetherService.reveal(userAId, sessionId, { decision: "open" }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "together_session_closed");
      assert.equal(appError.statusCode, 409);
      return true;
    },
  );
  assert.equal(revealWritten, false);
});

test("getSession includes empty revealState before any decision", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    findSessionForMember: async () =>
      sessionRow({
        status: "finished",
        finishedAt: endedAt,
        endedReason: "completed",
      }),
  });

  const response = await togetherService.getSession(userAId, sessionId);

  assert.deepEqual(response.revealState, {
    myDecision: null,
    outcome: "pending",
    threadId: null,
    canOpenChat: true,
    peerDecisionKnown: false,
    nextSessionId: null,
    nextActivity: null,
  });
});

test("first open reveal stores decision and remains pending without a thread", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [];
  let openedThread = false;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
    },
    {
      openDirectThread: async () => {
        openedThread = true;
        throw new Error("First reveal must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userAId, sessionId, { decision: "open" });

  assert.equal(openedThread, false);
  assert.equal(result.response.outcome, "pending");
  assert.equal(result.response.threadId, undefined);
  assert.deepEqual(result.response.revealState, {
    myDecision: "open",
    outcome: "pending",
    threadId: null,
    canOpenChat: true,
    peerDecisionKnown: false,
    nextSessionId: null,
    nextActivity: null,
  });
});

test("second open reveal returns open_open with threadId", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "open")];
  let sourceThreadId: string | null = null;
  let openedSource: unknown = null;
  let openThreadCalls = 0;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
    },
    {
      openDirectThread: async (_userId, input) => {
        openThreadCalls += 1;
        openedSource = input.source;
        sourceThreadId = threadId;
        return {
          thread: {
            id: threadId,
            type: "direct",
            peer: { id: userAId, displayName: "User A", avatarUrl: null },
            lastMessage: null,
            unreadCount: 0,
            source: { type: "together", sourceId: sessionId },
            contexts: [],
          },
        };
      },
      findDirectThreadIdBySource: async () => sourceThreadId,
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, { decision: "open" });

  assert.equal(result.response.outcome, "open_open");
  assert.equal(result.response.threadId, threadId);
  assert.equal(openThreadCalls, 1);
  assert.deepEqual(openedSource, {
    type: "together",
    sourceId: sessionId,
    metadata: {
      activity: "draw",
      promptText: "Draw together",
      promptKey: null,
    },
  });
  assert.deepEqual(result.response.revealState, {
    myDecision: "open",
    outcome: "open_open",
    threadId,
    canOpenChat: true,
    peerDecisionKnown: true,
    nextSessionId: null,
    nextActivity: null,
  });
  assert.equal(result.broadcasts.length, 2);
  assert.equal(
    result.broadcasts.find((broadcast) => broadcast.userId === userAId)?.revealState.threadId,
    threadId,
  );
});

test("story_sparks open_open reveal creates one thread with story context", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "open")];
  const storyEvents = [
    storyChoiceEvent("story-a-place", userAId, "place", "night_train", 0),
    storyChoiceEvent("story-b-place", userBId, "place", "small_cafe", 0),
    storyChoiceEvent("story-a-detail", userAId, "detail", "lost_key", 1),
    storyChoiceEvent("story-b-detail", userBId, "detail", "old_camera", 1),
    storyChoiceEvent("story-a-twist", userAId, "twist", "lights_went_out", 2),
    storyChoiceEvent("story-b-twist", userBId, "twist", "recognized_melody", 2),
    storyChoiceEvent("story-a-ending", userAId, "ending", "meet_again", 3),
    storyChoiceEvent("story-b-ending", userBId, "ending", "story_began", 3),
  ];
  let sourceThreadId: string | null = null;
  const openedSources: { metadata?: Record<string, unknown> }[] = [];
  let openThreadCalls = 0;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          activity: "story_sparks",
          promptText: "Build a tiny story together",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
      listSessionEventsForMember: async () => storyEvents,
    },
    {
      openDirectThread: async (_userId, input) => {
        openThreadCalls += 1;
        openedSources.push(input.source as { metadata?: Record<string, unknown> });
        sourceThreadId = threadId;
        return {
          thread: {
            id: threadId,
            type: "direct",
            peer: { id: userAId, displayName: "User A", avatarUrl: null },
            lastMessage: null,
            unreadCount: 0,
            source: { type: "together", sourceId: sessionId },
            contexts: [],
          },
        };
      },
      findDirectThreadIdBySource: async () => sourceThreadId,
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, { decision: "open" });

  assert.equal(result.response.outcome, "open_open");
  assert.equal(result.response.threadId, threadId);
  assert.equal(openThreadCalls, 1);
  const openedMetadata = openedSources[0]?.metadata;
  assert.equal(openedMetadata?.activity, "story_sparks");
  assert.equal(openedMetadata?.promptText, "Build a tiny story together");
  assert.equal(openedMetadata?.promptKey, null);
  assert.deepEqual(openedMetadata?.storyTitle, {
    ru: "История: Ночной поезд",
    en: "Story: Night train",
    hr: "Priča: Noćni vlak",
  });
  assert.ok(openedMetadata?.summary);
  assert.ok(openedMetadata?.selectedCards);
});

test("repeated open_open reveal reuses existing together thread context", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [
    revealRow(userAId, "open"),
    revealRow(userBId, "open"),
  ];
  let openThreadCalls = 0;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
    },
    {
      findDirectThreadIdBySource: async () => threadId,
      openDirectThread: async () => {
        openThreadCalls += 1;
        throw new Error("Repeated open_open reveal must not create another thread context");
      },
    },
  );

  const result = await togetherService.reveal(userAId, sessionId, { decision: "open" });

  assert.equal(result.response.outcome, "open_open");
  assert.equal(result.response.threadId, threadId);
  assert.equal(openThreadCalls, 0);
});

test("first opener getSession after peer opens sees same threadId", async (t) => {
  t.after(restoreRepoMock);

  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      listSessionReveals: async () => [revealRow(userAId, "open"), revealRow(userBId, "open")],
    },
    {
      findDirectThreadIdBySource: async () => threadId,
    },
  );

  const response = await togetherService.getSession(userAId, sessionId);

  assert.equal(response.revealState.outcome, "open_open");
  assert.equal(response.revealState.threadId, threadId);
  assert.equal(response.revealState.myDecision, "open");
});

test("skip and open reveal does not create a thread", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "skip")];
  let openedThread = false;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
    },
    {
      openDirectThread: async () => {
        openedThread = true;
        throw new Error("Mixed reveal must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, { decision: "open" });

  assert.equal(openedThread, false);
  assert.equal(result.response.outcome, "open_skip");
  assert.equal(result.response.revealState.threadId, null);
});

test("draw continue_story and continue_story creates one story_sparks continuation session", async (t) => {
  t.after(restoreRepoMock);

  const storySessionId = "00000000-0000-4000-8000-000000000701";
  const reveals: TogetherRevealRow[] = [revealRow(userAId, "continue_story")];
  let continuationSession: TogetherSessionRow | undefined;
  let openThreadCalls = 0;
  let createContinuationCalls = 0;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          activity: "draw",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
      findContinuationSessionBySource: async () => continuationSession,
      createStoryContinuationSession: async (input: { sourceSessionId: string; memberUserIds: string[] }) => {
        createContinuationCalls += 1;
        assert.equal(input.sourceSessionId, sessionId);
        assert.deepEqual(input.memberUserIds, [userAId, userBId]);
        continuationSession ??= sessionRow({
          id: storySessionId,
          activity: "story_sparks",
          status: "active",
          promptText: "Build a tiny story together",
          sourceSessionId: sessionId,
        });
        return continuationSession;
      },
    },
    {
      openDirectThread: async () => {
        openThreadCalls += 1;
        throw new Error("continue_story must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, {
    decision: "continue_story",
  });

  assert.equal(openThreadCalls, 0);
  assert.equal(createContinuationCalls, 1);
  assert.equal(result.response.outcome, "continue_story");
  assert.equal(result.response.nextSessionId, storySessionId);
  assert.equal(result.response.nextActivity, "story_sparks");
  assert.deepEqual(result.response.revealState, {
    myDecision: "continue_story",
    outcome: "continue_story",
    threadId: null,
    canOpenChat: true,
    peerDecisionKnown: true,
    nextSessionId: storySessionId,
    nextActivity: "story_sparks",
  });
  assert.equal(
    result.broadcasts.find((broadcast) => broadcast.userId === userAId)?.revealState.nextSessionId,
    storySessionId,
  );
});

test("repeated continue_story reveal reuses existing story_sparks continuation session", async (t) => {
  t.after(restoreRepoMock);

  const storySessionId = "00000000-0000-4000-8000-000000000702";
  const reveals: TogetherRevealRow[] = [
    revealRow(userAId, "continue_story"),
    revealRow(userBId, "continue_story"),
  ];
  let createContinuationCalls = 0;
  const continuationSession = sessionRow({
    id: storySessionId,
    activity: "story_sparks",
    status: "active",
    promptText: "Build a tiny story together",
    sourceSessionId: sessionId,
  });
  mockRepo({
    findSessionForMember: async () =>
      sessionRow({
        status: "finished",
        activity: "draw",
        finishedAt: endedAt,
        endedReason: "completed",
      }),
    upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
      upsertRevealRow(reveals, userId, decision);
    },
    listSessionMemberUserIds: async () => [userAId, userBId],
    listSessionReveals: async () => reveals,
    findContinuationSessionBySource: async () => continuationSession,
    createStoryContinuationSession: async () => {
      createContinuationCalls += 1;
      return continuationSession;
    },
  });

  const result = await togetherService.reveal(userAId, sessionId, {
    decision: "continue_story",
  });

  assert.equal(createContinuationCalls, 1);
  assert.equal(result.response.outcome, "continue_story");
  assert.equal(result.response.nextSessionId, storySessionId);
});

test("continue_story and skip reveal creates no chat and no story continuation", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "continue_story")];
  let openedThread = false;
  let createdContinuation = false;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          activity: "draw",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
      createStoryContinuationSession: async () => {
        createdContinuation = true;
        throw new Error("Mixed continuation must not create story session");
      },
    },
    {
      openDirectThread: async () => {
        openedThread = true;
        throw new Error("Mixed continuation must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, { decision: "skip" });

  assert.equal(openedThread, false);
  assert.equal(createdContinuation, false);
  assert.equal(result.response.outcome, "mixed_intent");
  assert.equal(result.response.revealState.threadId, null);
  assert.equal(result.response.revealState.nextSessionId, null);
});

test("open and continue_story reveal creates no chat and no story continuation", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "open")];
  let openedThread = false;
  let createdContinuation = false;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          activity: "draw",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
      createStoryContinuationSession: async () => {
        createdContinuation = true;
        throw new Error("Mixed continuation must not create story session");
      },
    },
    {
      openDirectThread: async () => {
        openedThread = true;
        throw new Error("Mixed continuation must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, {
    decision: "continue_story",
  });

  assert.equal(openedThread, false);
  assert.equal(createdContinuation, false);
  assert.equal(result.response.outcome, "mixed_intent");
  assert.equal(result.response.revealState.threadId, null);
  assert.equal(result.response.revealState.nextSessionId, null);
});

test("skip and skip reveal does not create a mutual chat", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "skip")];
  let openedThread = false;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
    },
    {
      openDirectThread: async () => {
        openedThread = true;
        throw new Error("skip_skip reveal must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, { decision: "skip" });

  assert.equal(openedThread, false);
  assert.equal(result.response.outcome, "skip_skip");
  assert.equal(result.response.revealState.threadId, null);
});

test("blocked pair returns blocked reveal outcome without opening chat", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "open")];
  let openedThread = false;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
      upsertReveal: async (_sessionId: string, userId: string, decision: string) => {
        upsertRevealRow(reveals, userId, decision);
      },
      listSessionMemberUserIds: async () => [userAId, userBId],
      listSessionReveals: async () => reveals,
    },
    {
      isBlockedEitherWay: async () => true,
      openDirectThread: async () => {
        openedThread = true;
        throw new Error("Blocked pair must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, { decision: "open" });

  assert.equal(openedThread, false);
  assert.equal(result.response.outcome, "blocked");
  assert.equal(result.response.revealState.threadId, null);
  assert.equal(result.response.revealState.canOpenChat, false);
});

test("history item exposes reveal read model fields", async (t) => {
  t.after(restoreRepoMock);

  mockRepo(
    {
      listHistorySessions: async () => [
        {
          session: sessionRow({
            status: "finished",
            finishedAt: endedAt,
            endedReason: "completed",
          }),
          peer: { id: userBId, displayName: "User B", avatarUrl: null },
        },
      ],
      listRevealsForSessions: async () => [
        revealRow(userAId, "open"),
        revealRow(userBId, "open"),
      ],
    },
    {
      findDirectThreadIdBySource: async () => threadId,
    },
  );

  const response = await togetherService.getHistory(userAId, 30);

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.outcome, "open_open");
  assert.equal(response.items[0]?.myDecision, "open");
  assert.equal(response.items[0]?.threadId, threadId);
  assert.equal(response.items[0]?.canOpenChat, true);
  assert.equal(response.items[0]?.peerDecisionKnown, true);
});

test("history exposes story_sparks activity and artifact", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    listHistorySessions: async () => [
      {
        session: sessionRow({
          status: "finished",
          activity: "story_sparks",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
        peer: { id: userBId, displayName: "User B", avatarUrl: null },
      },
    ],
    listRevealsForSessions: async () => [],
    listSessionEventsForMember: async () => [
      storyChoiceEvent("story-a-place", userAId, "place", "night_train", 0),
      storyChoiceEvent("story-b-place", userBId, "place", "small_cafe", 0),
      storyChoiceEvent("story-a-detail", userAId, "detail", "lost_key", 1),
      storyChoiceEvent("story-b-detail", userBId, "detail", "old_camera", 1),
      storyChoiceEvent("story-a-twist", userAId, "twist", "lights_went_out", 2),
      storyChoiceEvent("story-b-twist", userBId, "twist", "recognized_melody", 2),
      storyChoiceEvent("story-a-ending", userAId, "ending", "meet_again", 3),
      storyChoiceEvent("story-b-ending", userBId, "ending", "story_began", 3),
    ],
  });

  const response = await togetherService.getHistory(userAId, 30);

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.activity, "story_sparks");
  assert.equal(response.items[0]?.storyArtifact?.packId, "first_sparks_v1");
  assert.equal(response.items[0]?.storyArtifact?.rounds.length, 4);
  assert.equal(response.items[0]?.storyArtifact?.rounds[0]?.choices.length, 2);
  assert.equal(response.items[0]?.storyArtifact?.title.en, "Story: Night train");
});

test("history includes correct activity and threadId for draw", async (t) => {
  t.after(restoreRepoMock);

  const drawSessionId = "00000000-0000-4000-8000-000000000401";
  const drawThreadId = "00000000-0000-4000-8000-000000000501";

  mockRepo(
    {
      listHistorySessions: async () => [
        {
          session: sessionRow({
            id: drawSessionId,
            status: "finished",
            activity: "draw",
            finishedAt: endedAt,
            endedReason: "completed",
          }),
          peer: { id: userBId, displayName: "User B", avatarUrl: null },
        },
      ],
      listRevealsForSessions: async () => [
        revealRow(userAId, "open", drawSessionId),
        revealRow(userBId, "open", drawSessionId),
      ],
    },
    {
      findDirectThreadIdBySource: async () => drawThreadId,
    },
  );

  const response = await togetherService.getHistory(userAId, 30);

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.activity, "draw");
  assert.equal(response.items[0]?.outcome, "open_open");
  assert.equal(response.items[0]?.threadId, drawThreadId);
  assert.equal(response.items[0]?.canOpenChat, true);
});

test("nonmember cannot access Together session, events, or reveal", async (t) => {
  t.after(restoreRepoMock);

  let revealWritten = false;
  mockRepo({
    findSessionForMember: async () => undefined,
    listSessionEventsForMember: async () => undefined,
    upsertReveal: async () => {
      revealWritten = true;
    },
  });

  for (const task of [
    () => togetherService.getSession(userAId, sessionId),
    () => togetherService.listSessionEventsForMember(userAId, sessionId),
    () => togetherService.reveal(userAId, sessionId, { decision: "open" }),
    () => togetherService.reveal(userAId, sessionId, { decision: "continue_story" }),
  ]) {
    await assert.rejects(task, (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "not_found");
      assert.equal(appError.statusCode, 404);
      return true;
    });
  }

  assert.equal(revealWritten, false);
});

test("nonmember cannot continue a draw story", async (t) => {
  t.after(restoreRepoMock);

  let revealWritten = false;
  let createdContinuation = false;
  mockRepo({
    findSessionForMember: async () => undefined,
    upsertReveal: async () => {
      revealWritten = true;
    },
    createStoryContinuationSession: async () => {
      createdContinuation = true;
      throw new Error("Nonmember must not create continuation");
    },
  });

  await assert.rejects(
    togetherService.reveal(userAId, sessionId, { decision: "continue_story" }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "not_found");
      assert.equal(appError.statusCode, 404);
      return true;
    },
  );

  assert.equal(revealWritten, false);
  assert.equal(createdContinuation, false);
});

test("nonmember cannot access story_sparks session events", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    listSessionEventsForMember: async () => undefined,
  });

  await assert.rejects(
    togetherService.listSessionEventsForMember(userAId, sessionId),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "not_found");
      assert.equal(appError.statusCode, 404);
      return true;
    },
  );
});

test("reveal updated broadcast sends recipient-specific reveal state", async () => {
  const { wsHub } = require("../src/realtime/ws.hub") as typeof import("../src/realtime/ws.hub");
  const sentA: string[] = [];
  const sentB: string[] = [];
  const socketA = {
    readyState: 1,
    send: (payload: string) => sentA.push(payload),
  };
  const socketB = {
    readyState: 1,
    send: (payload: string) => sentB.push(payload),
  };

  wsHub.addSocket(userAId, socketA as never);
  wsHub.addSocket(userBId, socketB as never);
  wsHub.subscribeTogether(socketA as never, sessionId);
  wsHub.subscribeTogether(socketB as never, sessionId);

  try {
    wsHub.broadcastTogetherRevealUpdated(
      sessionId,
      [
        {
          userId: userAId,
          revealState: {
            myDecision: "open",
            outcome: "pending",
            threadId: null,
            canOpenChat: true,
            peerDecisionKnown: false,
            nextSessionId: null,
            nextActivity: null,
          },
        },
        {
          userId: userBId,
          revealState: {
            myDecision: null,
            outcome: "pending",
            threadId: null,
            canOpenChat: true,
            peerDecisionKnown: true,
            nextSessionId: null,
            nextActivity: null,
          },
        },
      ],
      userAId,
    );

    const payloadA = JSON.parse(sentA[0] ?? "{}") as { revealState?: { myDecision?: string | null } };
    const payloadB = JSON.parse(sentB[0] ?? "{}") as { revealState?: { myDecision?: string | null } };
    assert.equal(payloadA.revealState?.myDecision, "open");
    assert.equal(payloadB.revealState?.myDecision, null);
  } finally {
    wsHub.removeSocket(socketA as never);
    wsHub.removeSocket(socketB as never);
  }
});

test("heartbeat timeout marks session abandoned with stale peer as actor", async (t) => {
  t.after(restoreRepoMock);

  let heartbeatWritten = false;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active" }),
    updateSessionMemberLastSeen: async () => {
      heartbeatWritten = true;
    },
    findStalePeerUserId: async () => userBId,
    closeActiveSession: async () =>
      sessionRow({
        status: "abandoned",
        finishedAt: endedAt,
        endedReason: "partner_disconnected",
      }),
  });

  const result = await togetherService.heartbeatSession(userAId, sessionId);

  assert.equal(heartbeatWritten, true);
  assert.equal(result.changed, true);
  assert.equal(result.reason, "partner_disconnected");
  assert.equal(result.actorUserId, userBId);
  assert.equal(result.response.session.status, "abandoned");
});

function mockRepo(
  overrides: RepoMock,
  serviceOverrides: ServiceDepsMock = {},
): void {
  restoreRepoMock();
  const defaults: RepoMock = {
    listSessionParticipants: async () => [
      { id: userAId, displayName: "User A", avatarUrl: null },
      { id: userBId, displayName: "User B", avatarUrl: null },
    ],
    countSessionEvents: async () => 0,
    listSessionMemberUserIds: async () => [userAId, userBId],
    listSessionReveals: async () => [],
    listRevealsForSessions: async () => [],
    listHistorySessions: async () => [],
    findStoryChoiceEventForRound: async () => undefined,
  };

  const repo = new Proxy(
    { ...defaults, ...overrides },
    {
      get(target, property) {
        if (typeof property === "string" && property in target) {
          return target[property as keyof typeof target];
        }
        throw new Error(`Unexpected Together repo call: ${String(property)}`);
      },
    },
  );

  restoreDeps = togetherService.__setTogetherServiceDepsForTests({
    repo: repo as unknown as typeof import("../src/together/together.repo"),
    openDirectThread: (async () => {
      throw new Error("Unexpected openDirectThread call");
    }) as never,
    findDirectThreadIdBySource: (async () => null) as never,
    findDirectThreadIdBetween: (async () => null) as never,
    isBlockedEitherWay: (async () => false) as never,
    ...serviceOverrides,
  });
}

function restoreRepoMock(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function sessionRow(overrides: Partial<TogetherSessionRow> = {}): TogetherSessionRow {
  return {
    id: sessionId,
    activity: "draw",
    status: "active",
    promptText: "Draw together",
    sourceSessionId: null,
    createdAt,
    finishedAt: null,
    endedReason: null,
    deadlineAt: null,
    updatedAt: createdAt,
    ...overrides,
  };
}

function queueRow(overrides: Partial<TogetherQueueRow> = {}): TogetherQueueRow {
  return {
    id: "00000000-0000-4000-8000-000000000210",
    userId: userAId,
    activity: "draw",
    status: "waiting",
    createdAt,
    expiresAt: new Date("2026-01-01T00:05:00.000Z"),
    matchedSessionId: null,
    latitude: null,
    longitude: null,
    radiusKm: null,
    locationUpdatedAt: null,
    ...overrides,
  };
}

function eventRow(overrides: Partial<TogetherEventRow> = {}): TogetherEventRow {
  return {
    id: "00000000-0000-4000-8000-000000000110",
    sessionId,
    fromUserId: userAId,
    clientEventId: "stroke-1",
    type: "stroke_batch",
    payload: { strokes: [] },
    createdAt,
    ...overrides,
  };
}

function storyChoiceEvent(
  clientEventId: string,
  fromUserId: string,
  roundId: string,
  cardId: string,
  clientRoundIndex: number,
): TogetherEventRow {
  const suffix = String(
    Math.abs([...clientEventId].reduce((total, char) => total + char.charCodeAt(0), 0)) % 1000,
  ).padStart(3, "0");
  return eventRow({
    id: `00000000-0000-4000-8000-000000000${suffix}`,
    fromUserId,
    clientEventId,
    type: "story_choice",
    payload: {
      roundId,
      cardId,
      packId: "first_sparks_v1",
      clientRoundIndex,
    },
  });
}

function revealRow(
  userId: string,
  decision: string,
  revealSessionId = sessionId,
): TogetherRevealRow {
  return {
    sessionId: revealSessionId,
    userId,
    decision,
    createdAt,
  };
}

function upsertRevealRow(
  reveals: TogetherRevealRow[],
  userId: string,
  decision: string,
): void {
  const index = reveals.findIndex((reveal) => reveal.userId === userId);
  const next = revealRow(userId, decision);
  if (index >= 0) {
    reveals[index] = next;
    return;
  }

  reveals.push(next);
}
