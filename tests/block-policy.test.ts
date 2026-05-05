import assert from "node:assert/strict";
import test from "node:test";
import type { AnnouncementRow, ThreadRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.UPLOADS_DIR = "./uploads-test";

const dbClient = require("../src/db/client") as typeof import("../src/db/client");
const announcementsService = require(
  "../src/announcements/announcements.service",
) as typeof import("../src/announcements/announcements.service");
const chatService = require("../src/chat/chat.service") as typeof import("../src/chat/chat.service");

type MutableDb = {
  select: unknown;
  transaction: unknown;
};

type SelectResult = Record<string, unknown>[];

const mutableDb = dbClient.db as unknown as MutableDb;
const originalSelect = mutableDb.select;
const originalTransaction = mutableDb.transaction;

const userAId = "00000000-0000-4000-8000-000000000001";
const userBId = "00000000-0000-4000-8000-000000000002";
const threadId = "00000000-0000-4000-8000-000000000201";
const announcementId = "00000000-0000-4000-8000-000000000301";

test.after(async () => {
  await dbClient.closeDb();
});

test("openDirectThread with a blocked peer returns 403 blocked_pair", async (t) => {
  t.after(restoreDb);

  let writeAttempted = false;
  mockDb({
    selectResults: [
      [threadPeerRow(userBId)],
      [{ userId: userAId }],
    ],
    onWriteAttempt: () => {
      writeAttempted = true;
    },
  });

  await assertBlockedPair(
    chatService.openDirectThread(userAId, {
      peerUserId: userBId,
    }),
  );
  assert.equal(writeAttempted, false);
});

test("respondToAnnouncement with blocked author returns 403 blocked_pair", async (t) => {
  t.after(restoreDb);

  let writeAttempted = false;
  mockDb({
    selectResults: [
      [announcementRow()],
      [{ userId: userBId }],
    ],
    onWriteAttempt: () => {
      writeAttempted = true;
    },
  });

  await assertBlockedPair(
    announcementsService.respondToAnnouncement(userAId, announcementId, {
      openDirectChat: false,
    }),
  );
  assert.equal(writeAttempted, false);
});

test("sendMessage in an existing thread after blocking returns 403 blocked_pair", async (t) => {
  t.after(restoreDb);

  let writeAttempted = false;
  mockDb({
    selectResults: [
      [{ thread: threadRow() }],
      [threadPeerRow(userBId)],
      [{ userId: userAId }],
    ],
    onWriteAttempt: () => {
      writeAttempted = true;
    },
  });

  await assertBlockedPair(
    chatService.sendMessage(userAId, threadId, {
      clientMessageId: "client-message-1",
      text: "hello",
    }),
  );
  assert.equal(writeAttempted, false);
});

function mockDb(input: {
  selectResults: SelectResult[];
  onWriteAttempt?: () => void;
}): void {
  const selectResults = [...input.selectResults];

  mutableDb.select = () => queryChain(() => {
    const result = selectResults.shift();
    if (!result) {
      throw new Error("Unexpected select call in block policy test");
    }
    return result;
  });
  mutableDb.transaction = () => {
    input.onWriteAttempt?.();
    throw new Error("Unexpected transaction call in block policy test");
  };
}

function queryChain(resolve: () => SelectResult): unknown {
  const chain = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => chain,
    groupBy: () => chain,
    limit: () => Promise.resolve(resolve()),
    as: () => chain,
  };

  return chain;
}

function restoreDb(): void {
  mutableDb.select = originalSelect;
  mutableDb.transaction = originalTransaction;
}

async function assertBlockedPair(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(
    promise,
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "blocked_pair");
      assert.equal(appError.statusCode, 403);
      return true;
    },
  );
}

function threadPeerRow(userId: string): { id: string; displayName: string; avatarUrl: string | null } {
  return {
    id: userId,
    displayName: userId === userAId ? "User A" : "User B",
    avatarUrl: null,
  };
}

function threadRow(overrides: Partial<ThreadRow> = {}): ThreadRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: threadId,
    type: "direct",
    sourceType: null,
    sourceId: null,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    lastMessageText: null,
    ...overrides,
  };
}

function announcementRow(overrides: Partial<AnnouncementRow> = {}): AnnouncementRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: announcementId,
    authorUserId: userBId,
    status: "active",
    title: "Coffee",
    description: "Meet nearby",
    category: "social",
    placeLabel: null,
    photoMediaId: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}
