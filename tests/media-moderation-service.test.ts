import assert from "node:assert/strict";
import test from "node:test";
import type { MediaFileRow, MediaModerationReviewRow, NewMediaModerationReviewRow } from "../src/db/schema";

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

test("not configured media moderation provider creates manual review without fake approval", async (t) => {
  t.after(restoreMediaModerationDeps);
  let reviewInput: NewMediaModerationReviewRow | undefined;

  restoreDeps = moderationService.__setMediaModerationDepsForTests({
    createMediaModerationReview: async (input) => {
      reviewInput = input;
      return mediaReviewRow(input);
    },
  });

  const review = await moderationService.queueInitialMediaModeration(mediaRow());

  assert.equal(review.action, "mark_under_review");
  assert.equal(reviewInput?.action, "mark_under_review");
  assert.equal(reviewInput?.adminUserId, null);
  assert.equal(reviewInput?.metadata && typeof reviewInput.metadata === "object", true);
  const metadata = reviewInput?.metadata as Record<string, unknown>;
  assert.equal(metadata.automatedStatus, "not_configured");
  assert.equal(metadata.automatedProvider, "NOT_CONFIGURED");
  assert.equal(metadata.needsHumanReview, true);
  assert.notEqual(reviewInput?.action, "approve");
});

function restoreMediaModerationDeps(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function mediaRow(): MediaFileRow {
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
    height: 800,
    checksumSha256: "checksum",
    createdAt: now,
  };
}

function mediaReviewRow(input: NewMediaModerationReviewRow): MediaModerationReviewRow {
  return {
    id: "00000000-0000-4000-8000-000000000302",
    mediaId: input.mediaId,
    ownerUserId: input.ownerUserId ?? null,
    adminUserId: input.adminUserId ?? null,
    action: input.action,
    reason: input.reason ?? null,
    metadata: input.metadata ?? null,
    createdAt: new Date("2026-01-01T00:01:00.000Z"),
  };
}
