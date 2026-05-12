import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import type { MediaFileRow, MediaUploadRow, NewMediaFileRow } from "../src/db/schema";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "http://localhost:4000/media";
process.env.S3_PUBLIC_BASE_URL = "http://localhost:9000/amoria";
process.env.UPLOADS_DIR = "./uploads-test";

const imageProcessing = require(
  "../src/media/image-processing",
) as typeof import("../src/media/image-processing");
const uploadsService = require(
  "../src/media/uploads.service",
) as typeof import("../src/media/uploads.service");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

const ownerId = "00000000-0000-4000-8000-000000000001";
const uploadId = "00000000-0000-4000-8000-000000000101";
const mediaId = "00000000-0000-4000-8000-000000000201";

const mimeByFormat = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

let restoreUploadsDeps: (() => void) | null = null;

test.after(async () => {
  restoreUploadServiceDeps();
  await closeDb();
});

for (const format of ["jpeg", "png", "webp"] as const) {
  test(`completeUpload validates and sanitizes valid ${format} profile photo`, async (t) => {
    t.after(restoreUploadServiceDeps);
    const rawBuffer = await imageBuffer(format, 640, 480);
    const state = mockCompleteProfilePhotoUpload(rawBuffer, mimeByFormat[format]);

    const response = await uploadsService.completeUpload(ownerId, uploadId, {
      sizeBytes: rawBuffer.length,
    });

    assert.equal(state.putObject?.key, `${state.upload.objectKey}.webp`);
    assert.equal(state.putObject?.contentType, "image/webp");
    assert.equal(state.deletedObjectKey, state.upload.objectKey);
    assert.equal(state.mediaInput?.path, `${state.upload.objectKey}.webp`);
    assert.equal(state.mediaInput?.url, `http://localhost:9000/amoria/${state.upload.objectKey}.webp`);
    assert.equal(state.mediaInput?.mimeType, "image/webp");
    assert.equal(state.mediaInput?.sizeBytes, state.putObject?.body.length);
    assert.equal(state.mediaInput?.width, 640);
    assert.equal(state.mediaInput?.height, 480);
    assert.equal(state.mediaInput?.checksumSha256, sha256(state.putObject?.body ?? Buffer.alloc(0)));
    assert.equal(state.galleryMedia?.type, "profile_photo");
    assert.equal(state.galleryMedia?.path, `${state.upload.objectKey}.webp`);
    assert.deepEqual(response.media, {
      id: mediaId,
      url: `http://localhost:9000/amoria/${state.upload.objectKey}.webp`,
      mimeType: "image/webp",
      sizeBytes: state.putObject?.body.length,
      purpose: "profile_photo",
    });
    assert.equal(JSON.stringify(response).includes("objectKey"), false);
    assert.equal(JSON.stringify(response).includes('"path"'), false);
  });
}

test("completeUpload rejects corrupt profile photo before storing media", async (t) => {
  t.after(restoreUploadServiceDeps);
  const rawBuffer = Buffer.from("this is not an image");
  const state = mockCompleteProfilePhotoUpload(rawBuffer, "image/jpeg");

  await assert.rejects(
    uploadsService.completeUpload(ownerId, uploadId, { sizeBytes: rawBuffer.length }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number };
      assert.equal(appError.code, "corrupt_image");
      assert.equal(appError.statusCode, 400);
      return true;
    },
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

test("profile photo helper rejects unsupported SVG images", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512"/></svg>',
  );

  await assertAppError(
    imageProcessing.processProfilePhotoImage(svg),
    "unsupported_image_type",
    415,
  );
});

test("profile photo helper rejects wrong content pretending to be an image", async () => {
  await assertAppError(
    imageProcessing.processProfilePhotoImage(Buffer.from("%PDF-1.7 fake image")),
    "corrupt_image",
    400,
  );
});

test("profile photo helper rejects too small dimensions", async () => {
  await assertAppError(
    imageProcessing.processProfilePhotoImage(await imageBuffer("png", 128, 128)),
    "image_too_small",
    422,
  );
});

test("profile photo helper rejects too large dimensions", async () => {
  await assertAppError(
    imageProcessing.processProfilePhotoImage(await imageBuffer("webp", 512, 512), {
      maxWidth: 300,
      maxHeight: 300,
    }),
    "image_too_large",
    422,
  );
});

function mockCompleteProfilePhotoUpload(rawBuffer: Buffer, contentType: string) {
  restoreUploadServiceDeps();
  const upload = uploadRow({
    mimeType: contentType,
    sizeBytes: rawBuffer.length,
  });
  const state: {
    upload: MediaUploadRow;
    putObject?: { key: string; body: Buffer; contentType: string };
    deletedObjectKey?: string;
    mediaInput?: NewMediaFileRow;
    galleryMedia?: MediaFileRow;
  } = { upload };

  restoreUploadsDeps = uploadsService.__setUploadsServiceDepsForTests({
    findMediaUploadById: async () => upload,
    headObject: async () => ({
      sizeBytes: rawBuffer.length,
      contentType,
    }),
    getObjectBuffer: async () => rawBuffer,
    putObjectBuffer: async (input) => {
      state.putObject = {
        key: input.key,
        body: input.body,
        contentType: input.contentType,
      };
    },
    deleteObject: async (input) => {
      state.deletedObjectKey = input.key;
    },
    completeMediaUploadWithFile: async (_completedUploadId, mediaInput, completedAt) => {
      state.mediaInput = mediaInput;
      return {
        upload: {
          ...upload,
          status: "completed",
          completedAt,
        },
        media: mediaRow(mediaInput),
      };
    },
    addCompletedProfilePhotoToGallery: async (_userId, media) => {
      state.galleryMedia = media;
    },
  });

  return state;
}

function restoreUploadServiceDeps(): void {
  if (restoreUploadsDeps) {
    restoreUploadsDeps();
    restoreUploadsDeps = null;
  }
}

function uploadRow(overrides: Partial<MediaUploadRow>): MediaUploadRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: uploadId,
    ownerUserId: ownerId,
    purpose: "profile_photo",
    objectKey: `users/${ownerId}/profile_photo/${uploadId}`,
    mimeType: "image/jpeg",
    sizeBytes: 1,
    checksumSha256: null,
    status: "prepared",
    expiresAt: new Date("2099-01-01T00:10:00.000Z"),
    createdAt: now,
    completedAt: null,
    ...overrides,
  };
}

function mediaRow(input: NewMediaFileRow): MediaFileRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: mediaId,
    ownerUserId: input.ownerUserId,
    type: input.type,
    path: input.path,
    url: input.url,
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width ?? null,
    height: input.height ?? null,
    checksumSha256: input.checksumSha256 ?? null,
    createdAt: now,
  };
}

async function imageBuffer(
  format: keyof typeof mimeByFormat,
  width: number,
  height: number,
): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 34, g: 120, b: 190 },
    },
  });

  if (format === "jpeg") {
    return image.jpeg({ quality: 90 }).toBuffer();
  }

  if (format === "png") {
    return image.png().toBuffer();
  }

  return image.webp({ quality: 90 }).toBuffer();
}

async function assertAppError(
  promise: Promise<unknown>,
  code: string,
  statusCode: number,
): Promise<void> {
  await assert.rejects(promise, (error) => {
    const appError = error as { code?: string; statusCode?: number };
    assert.equal(appError.code, code);
    assert.equal(appError.statusCode, statusCode);
    return true;
  });
}

function sha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
