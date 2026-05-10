import assert from "node:assert/strict";
import test from "node:test";
import type { TogetherRevealRow, TogetherSessionRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const togetherService = require(
  "../src/together/together.service",
) as typeof import("../src/together/together.service");
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

function revealRow(userId: string, decision: string): TogetherRevealRow {
  return {
    sessionId,
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
