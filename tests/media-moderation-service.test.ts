import assert from "node:assert/strict";
import test from "node:test";
import type { MediaFileRow, MediaModerationJobRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "https://api.example.test/media";
process.env.UPLOADS_DIR = "./uploads-test";

const moderationService = require(
  "../src/media/media-moderation.service",
) as typeof import("../src/media/media-moderation.service");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

const mediaId = "00000000-0000-4000-8000-000000000301";
const ownerId = "00000000-0000-4000-8000-000000000001";
let restoreDeps: (() => void) | null = null;

test.after(async () => {
  restoreMediaModerationDeps();
  await closeDb();
});

test("public profile photo queues a durable job only after public gallery intent exists", async (t) => {
  t.after(restoreMediaModerationDeps);
  const stateChanges: string[] = [];
  let enqueueCount = 0;
  restoreDeps = moderationService.__setMediaModerationDepsForTests({
    findGalleryItemForMedia: async () => ({
      item: {
        id: "00000000-0000-4000-8000-000000000302",
        userId: ownerId,
        mediaId,
        visibility: "public",
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      media: mediaRow(),
    }),
    updateMediaModerationState: async (_id, state) => {
      stateChanges.push(state);
      return mediaRow({ moderationState: state });
    },
    enqueueMediaModerationJob: async () => {
      enqueueCount += 1;
      return jobRow();
    },
  });

  const job = await moderationService.queueInitialMediaModeration(mediaRow(), "public");
  assert.equal(job?.status, "queued");
  assert.deepEqual(stateChanges, ["pending"]);
  assert.equal(enqueueCount, 1);
});

test("locked profile photo is structurally rejected before state update or enqueue", async (t) => {
  t.after(restoreMediaModerationDeps);
  let touched = false;
  restoreDeps = moderationService.__setMediaModerationDepsForTests({
    findGalleryItemForMedia: async () => ({
      item: {
        id: "00000000-0000-4000-8000-000000000302",
        userId: ownerId,
        mediaId,
        visibility: "locked",
        position: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      media: mediaRow(),
    }),
    updateMediaModerationState: async () => {
      touched = true;
      return undefined;
    },
    enqueueMediaModerationJob: async () => {
      touched = true;
      return undefined;
    },
  });

  await assert.rejects(
    moderationService.queueInitialMediaModeration(mediaRow(), "public"),
    /Locked or unclassified gallery media/,
  );
  assert.equal(touched, false);
});

test("bounded bulk moderation dry-run reports only eligible public media without mutation", async (t) => {
  t.after(restoreMediaModerationDeps);
  let touched = false;
  restoreDeps = moderationService.__setMediaModerationDepsForTests({
    listPublicMediaModerationCandidates: async () => [
      { id: mediaId, ownerUserId: ownerId, type: "profile_photo", moderationState: "approved" },
      { id: "00000000-0000-4000-8000-000000000399", ownerUserId: ownerId, type: "avatar", moderationState: "removed" },
    ],
    updateMediaModerationState: async () => {
      touched = true;
      return undefined;
    },
  });
  const result = await moderationService.enqueuePublicMediaModerationByIds({
    mediaIds: [mediaId, "00000000-0000-4000-8000-000000000399"],
    dryRun: true,
    maximumBatchSize: 2,
  });
  assert.deepEqual(result.eligibleMediaIds, [mediaId]);
  assert.deepEqual(result.enqueuedMediaIds, []);
  assert.equal(touched, false);
});

function restoreMediaModerationDeps(): void {
  restoreDeps?.();
  restoreDeps = null;
}

function mediaRow(overrides: Partial<MediaFileRow> = {}): MediaFileRow {
  const now = new Date("2026-01-01T00:00:00.000Z");
  return {
    id: mediaId,
    ownerUserId: ownerId,
    type: "profile_photo",
    path: `users/${ownerId}/profile_photo/${mediaId}.webp`,
    url: `https://api.example.test/media/public/${mediaId}`,
    mimeType: "image/webp",
    sizeBytes: 1234,
    width: 640,
    height: 640,
    checksumSha256: "checksum",
    moderationState: "pending",
    moderationOrigin: "awaiting_automatic",
    automatedCheckedAt: null,
    moderationUpdatedAt: now,
    createdAt: now,
    ...overrides,
  };
}

function jobRow(): MediaModerationJobRow {
  const now = new Date("2026-01-01T00:00:01.000Z");
  return {
    id: "00000000-0000-4000-8000-000000000303",
    mediaId,
    status: "queued",
    attemptCount: 0,
    nextAttemptAt: now,
    startedAt: null,
    completedAt: null,
    providerEngine: "opennsfw_onnx_cpu",
    modelVersion: "test-model",
    policyVersion: "test-policy",
    errorCode: null,
    rawResult: null,
    policyDecision: null,
    createdAt: now,
    updatedAt: now,
  };
}
