import assert from "node:assert/strict";
import test from "node:test";
import type { MediaFileRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "https://api.example.test/media";
process.env.UPLOADS_DIR = "./uploads-test";

const { buildApp } = require("../src/app") as typeof import("../src/app");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");
const mediaService = require("../src/media/media.service") as typeof import("../src/media/media.service");

const mediaId = "00000000-0000-4000-8000-000000000101";
const ownerId = "00000000-0000-4000-8000-000000000001";
const objectKey = `users/${ownerId}/avatar/${mediaId}.webp`;
const objectBody = Buffer.from("webp-bytes");

let restoreDeps: (() => void) | null = null;

test.after(async () => {
  restoreMediaDeps();
  await closeDb();
});

test("GET /media/public/:mediaId streams media object by current media id", async (t) => {
  t.after(restoreMediaDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let requestedKey = "";
  restoreDeps = mediaService.__setMediaServiceDepsForTests({
    findMediaFileById: async (requestedMediaId) =>
      requestedMediaId === mediaId
        ? mediaRow({
            id: mediaId,
            ownerUserId: ownerId,
            type: "avatar",
            path: objectKey,
          })
        : undefined,
    getObjectBuffer: async (input) => {
      requestedKey = input.key;
      return objectBody;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: `/media/public/${mediaId}`,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "image/webp");
  assert.equal(response.headers["cache-control"], "public, max-age=31536000, immutable");
  assert.equal(requestedKey, objectKey);
  assert.deepEqual(response.rawPayload, objectBody);
});

test("GET /media/public/:mediaId streams only public profile gallery media", async (t) => {
  t.after(restoreMediaDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  restoreDeps = mediaService.__setMediaServiceDepsForTests({
    findMediaFileById: async () => mediaRow({
      id: mediaId,
      ownerUserId: ownerId,
      type: "profile_photo",
      path: `users/${ownerId}/profile_photo/${mediaId}.webp`,
    }),
    findGalleryItemForMedia: async () => ({
      item: { visibility: "public" },
      media: mediaRow({ type: "profile_photo" }),
    }) as never,
    getObjectBuffer: async () => objectBody,
  });

  const response = await app.inject({
    method: "GET",
    url: `/media/public/${mediaId}`,
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.rawPayload, objectBody);
});

test("GET /media/public/:mediaId does not expose locked gallery media", async (t) => {
  t.after(restoreMediaDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });

  let objectRead = false;
  restoreDeps = mediaService.__setMediaServiceDepsForTests({
    findMediaFileById: async () => mediaRow({
      id: mediaId,
      ownerUserId: ownerId,
      type: "profile_photo",
      path: `users/${ownerId}/profile_photo/${mediaId}.webp`,
    }),
    findGalleryItemForMedia: async () => ({
      item: { visibility: "locked" },
      media: mediaRow({ type: "profile_photo" }),
    }) as never,
    getObjectBuffer: async () => {
      objectRead = true;
      return objectBody;
    },
  });

  const response = await app.inject({
    method: "GET",
    url: `/media/public/${mediaId}`,
  });

  assert.equal(response.statusCode, 404);
  assert.equal(objectRead, false);
});

function restoreMediaDeps(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function mediaRow(overrides: Partial<MediaFileRow>): MediaFileRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: String(overrides.id ?? mediaId),
    ownerUserId: String(overrides.ownerUserId ?? ownerId),
    type: String(overrides.type ?? "avatar"),
    path: String(overrides.path ?? objectKey),
    url: String(overrides.url ?? `https://api.example.test/media/public/${mediaId}`),
    mimeType: String(overrides.mimeType ?? "image/webp"),
    sizeBytes: Number(overrides.sizeBytes ?? objectBody.length),
    width: Number(overrides.width ?? 512),
    height: Number(overrides.height ?? 512),
    checksumSha256: overrides.checksumSha256 ?? null,
    createdAt: now,
  };
}
