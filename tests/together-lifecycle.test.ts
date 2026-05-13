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

test("color_mood reveal before finish returns 409", async (t) => {
  t.after(restoreRepoMock);

  let revealWritten = false;
  mockRepo({
    findSessionForMember: async () =>
      sessionRow({ status: "active", activity: "color_mood" }),
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

test("queue accepts color_mood activity", async (t) => {
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
      activity: "color_mood",
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(enqueuedActivity, "color_mood");
  assert.equal(response.json().entry.status, "waiting");
});

test("color_mood queue does not reuse a draw-only match", async (t) => {
  t.after(restoreRepoMock);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  mockRepo({
    enqueueAndMatch: async (input: { activity: string }) =>
      queueRow({
        activity: input.activity,
        status: input.activity === "color_mood" ? "waiting" : "matched",
        matchedSessionId: input.activity === "color_mood" ? null : sessionId,
      }),
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

  assert.equal(response.statusCode, 200);
  assert.equal(body.entry.status, "waiting");
  assert.equal(body.entry.sessionId, undefined);
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
        clientEventId: "palette-1",
        type: "palette",
        payload: { color: "#F97393" },
      }),
      eventRow({
        id: "00000000-0000-4000-8000-000000000113",
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
  assert.equal(body.items.length, 3);
  assert.equal(body.items[0].sessionId, sessionId);
  assert.equal(body.items[0].fromUserId, userAId);
  assert.equal(body.items[0].clientEventId, "stroke-1");
  assert.equal(body.items[0].type, "stroke_batch");
  assert.equal(body.items[1].clientEventId, "palette-1");
  assert.equal(body.items[1].type, "palette");
  assert.deepEqual(body.items[1].payload, { color: "#F97393" });
  assert.equal(body.items[2].clientEventId, "system-1");
  assert.equal(body.items[2].type, "system");
  assert.deepEqual(body.items[2].payload, { name: "finish" });
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

test("color_mood session accepts palette events", async (t) => {
  t.after(restoreRepoMock);

  let insertedType: string | undefined;
  let insertedPayload: unknown;
  mockRepo({
    findSessionForMember: async () => sessionRow({ status: "active", activity: "color_mood" }),
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
    clientEventId: "palette-1",
    type: "palette",
    payload: { color: "#38BDF8", label: "calm" },
  });

  assert.equal(result.response.created, true);
  assert.equal(result.event.type, "palette");
  assert.equal(insertedType, "palette");
  assert.deepEqual(insertedPayload, { color: "#38BDF8", label: "calm" });
});

test("color_mood events can be fetched through session events endpoint", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    listSessionEventsForMember: async () => [
      eventRow({
        type: "palette",
        clientEventId: "palette-1",
        payload: { color: "#A78BFA", label: "romantic" },
      }),
    ],
  });

  const response = await togetherService.listSessionEventsForMember(userAId, sessionId);

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.type, "palette");
  assert.deepEqual(response.items[0]?.payload, {
    color: "#A78BFA",
    label: "romantic",
  });
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

test("finish color_mood Together session keeps activity in response", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    findSessionForMember: async () =>
      sessionRow({ status: "active", activity: "color_mood" }),
    finishActiveSession: async () =>
      sessionRow({
        status: "finished",
        activity: "color_mood",
        finishedAt: endedAt,
        endedReason: "completed",
      }),
  });

  const result = await togetherService.finishSession(userAId, sessionId);

  assert.equal(result.changed, true);
  assert.equal(result.response.session.activity, "color_mood");
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

test("reveal abandoned color_mood session does not create outcome or chat", async (t) => {
  t.after(restoreRepoMock);

  let revealWritten = false;
  mockRepo({
    findSessionForMember: async () =>
      sessionRow({ status: "abandoned", activity: "color_mood" }),
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
    },
  });
  assert.deepEqual(result.response.revealState, {
    myDecision: "open",
    outcome: "open_open",
    threadId,
    canOpenChat: true,
    peerDecisionKnown: true,
  });
  assert.equal(result.broadcasts.length, 2);
  assert.equal(
    result.broadcasts.find((broadcast) => broadcast.userId === userAId)?.revealState.threadId,
    threadId,
  );
});

test("color_mood open_open reveal creates direct thread with together context", async (t) => {
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
          activity: "color_mood",
          promptText: "Build a small shared palette",
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
      activity: "color_mood",
      promptText: "Build a small shared palette",
    },
  });
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

test("color_mood open and skip reveal does not create a mutual chat", async (t) => {
  t.after(restoreRepoMock);

  const reveals: TogetherRevealRow[] = [revealRow(userAId, "open")];
  let openedThread = false;
  mockRepo(
    {
      findSessionForMember: async () =>
        sessionRow({
          status: "finished",
          activity: "color_mood",
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
        throw new Error("Mixed color_mood reveal must not open a thread");
      },
    },
  );

  const result = await togetherService.reveal(userBId, sessionId, { decision: "skip" });

  assert.equal(openedThread, false);
  assert.equal(result.response.outcome, "open_skip");
  assert.equal(result.response.revealState.threadId, null);
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

test("history item exposes color_mood activity", async (t) => {
  t.after(restoreRepoMock);

  mockRepo({
    listHistorySessions: async () => [
      {
        session: sessionRow({
          status: "finished",
          activity: "color_mood",
          finishedAt: endedAt,
          endedReason: "completed",
        }),
        peer: { id: userBId, displayName: "User B", avatarUrl: null },
      },
    ],
    listRevealsForSessions: async () => [],
  });

  const response = await togetherService.getHistory(userAId, 30);

  assert.equal(response.items.length, 1);
  assert.equal(response.items[0]?.activity, "color_mood");
  assert.equal(response.items[0]?.status, "finished");
});

test("history includes correct activity and threadId for draw and color_mood", async (t) => {
  t.after(restoreRepoMock);

  const drawSessionId = "00000000-0000-4000-8000-000000000401";
  const colorMoodSessionId = "00000000-0000-4000-8000-000000000402";
  const drawThreadId = "00000000-0000-4000-8000-000000000501";
  const colorMoodThreadId = "00000000-0000-4000-8000-000000000502";

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
        {
          session: sessionRow({
            id: colorMoodSessionId,
            status: "finished",
            activity: "color_mood",
            finishedAt: endedAt,
            endedReason: "completed",
          }),
          peer: { id: userBId, displayName: "User B", avatarUrl: null },
        },
      ],
      listRevealsForSessions: async () => [
        revealRow(userAId, "open", drawSessionId),
        revealRow(userBId, "open", drawSessionId),
        revealRow(userAId, "open", colorMoodSessionId),
        revealRow(userBId, "open", colorMoodSessionId),
      ],
    },
    {
      findDirectThreadIdBySource: async (source) =>
        source.sourceId === colorMoodSessionId ? colorMoodThreadId : drawThreadId,
    },
  );

  const response = await togetherService.getHistory(userAId, 30);

  assert.equal(response.items.length, 2);
  assert.equal(response.items[0]?.activity, "draw");
  assert.equal(response.items[0]?.outcome, "open_open");
  assert.equal(response.items[0]?.threadId, drawThreadId);
  assert.equal(response.items[0]?.canOpenChat, true);
  assert.equal(response.items[1]?.activity, "color_mood");
  assert.equal(response.items[1]?.outcome, "open_open");
  assert.equal(response.items[1]?.threadId, colorMoodThreadId);
  assert.equal(response.items[1]?.canOpenChat, true);
});

test("nonmember cannot access color_mood session, events, or reveal", async (t) => {
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
