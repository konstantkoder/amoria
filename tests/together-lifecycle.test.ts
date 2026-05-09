import assert from "node:assert/strict";
import test from "node:test";
import type { TogetherSessionRow } from "../src/db/schema";

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

const sessionId = "00000000-0000-4000-8000-000000000101";
const userAId = "00000000-0000-4000-8000-000000000001";
const userBId = "00000000-0000-4000-8000-000000000002";
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

function mockRepo(overrides: RepoMock): void {
  restoreRepoMock();
  const defaults: RepoMock = {
    listSessionParticipants: async () => [
      { id: userAId, displayName: "User A", avatarUrl: null },
      { id: userBId, displayName: "User B", avatarUrl: null },
    ],
    countSessionEvents: async () => 0,
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
