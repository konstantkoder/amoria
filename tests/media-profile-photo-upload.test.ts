import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { MultipartFile } from "@fastify/multipart";
import sharp from "sharp";
import { AppError } from "../src/common/errors";
import type { MediaFileRow, MediaUploadRow, NewMediaFileRow } from "../src/db/schema";
import type { CompleteUploadResponse } from "../src/media/uploads.service";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "https://api.example.test/media";
process.env.S3_PUBLIC_BASE_URL = "http://localhost:9000/amoria";
process.env.UPLOADS_DIR = "./uploads-test";

const imageProcessing = require(
  "../src/media/image-processing",
) as typeof import("../src/media/image-processing");
const uploadsService = require(
  "../src/media/uploads.service",
) as typeof import("../src/media/uploads.service");
const { buildApp } = require("../src/app") as typeof import("../src/app");
const { signAccessToken } = require("../src/auth/jwt") as typeof import("../src/auth/jwt");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

const ownerId = "00000000-0000-4000-8000-000000000001";
const uploadId = "00000000-0000-4000-8000-000000000101";
const mediaId = "00000000-0000-4000-8000-000000000201";
const publicMediaPath = (mediaId: string) => `/media/public/${mediaId}`;

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
    assert.equal(state.mediaInput?.url, publicMediaPath(uploadId));
    assert.equal(state.mediaInput?.mimeType, "image/webp");
    assert.equal(state.mediaInput?.sizeBytes, state.putObject?.body.length);
    assert.equal(state.mediaInput?.width, 640);
    assert.equal(state.mediaInput?.height, 480);
    assert.equal(state.mediaInput?.checksumSha256, sha256(state.putObject?.body ?? Buffer.alloc(0)));
    assert.deepEqual(state.moderationMediaIds, [state.mediaInput?.id]);
    assert.equal(state.galleryMedia?.type, "profile_photo");
    assert.equal(state.galleryMedia?.path, `${state.upload.objectKey}.webp`);
    assert.deepEqual(response.media, {
      id: uploadId,
      url: publicMediaPath(uploadId),
      mimeType: "image/webp",
      sizeBytes: state.putObject?.body.length,
      purpose: "profile_photo",
    });
    assert.equal(JSON.stringify(response).includes("localhost"), false);
    assert.equal(JSON.stringify(response).includes("minio"), false);
    assert.equal(JSON.stringify(response).includes("objectKey"), false);
    assert.equal(JSON.stringify(response).includes('"path"'), false);
  });
}

test("POST /media/profile-photo uploads profile photo through backend", async (t) => {
  t.after(restoreUploadServiceDeps);
  const app = buildApp();
  t.after(async () => {
    await app.close();
  });
  const rawBuffer = await imageBuffer("jpeg", 640, 480);
  const state = mockBackendProfilePhotoUpload();

  const response = await app.inject({
    method: "POST",
    url: "/media/profile-photo",
    headers: {
      Authorization: `Bearer ${signAccessToken(ownerId)}`,
      ...multipartHeaders("photo-boundary"),
    },
    payload: multipartPayload({
      boundary: "photo-boundary",
      fieldName: "file",
      filename: "profile.jpg",
      contentType: "image/jpeg",
      body: rawBuffer,
    }),
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as CompleteUploadResponse;
  assert.equal(state.putObject?.contentType, "image/webp");
  assert.match(
    state.putObject?.key ?? "",
    new RegExp(`^users/${ownerId}/profile_photo/[0-9a-f-]{36}\\.webp$`),
  );
  assert.equal(state.mediaInput?.ownerUserId, ownerId);
  assert.equal(state.mediaInput?.type, "profile_photo");
  assert.deepEqual(state.moderationMediaIds, [state.mediaInput?.id]);
  assert.equal(state.galleryMedia?.id, state.mediaInput?.id);
  assert.equal(body.media.id, state.mediaInput?.id);
  assert.equal(body.media.url, publicMediaPath(state.mediaInput?.id ?? ""));
  assert.equal(body.media.mimeType, "image/webp");
  assert.equal(body.media.purpose, "profile_photo");
  assert.equal(JSON.stringify(body).includes("localhost"), false);
  assert.equal(JSON.stringify(body).includes("minio"), false);
  assert.equal(JSON.stringify(body).includes("objectKey"), false);
  assert.equal(JSON.stringify(body).includes('"path"'), false);
});

test("POST /media/profile-photo requires authentication", async () => {
  const app = buildApp();
  await app.ready();
  try {
    const response = await app.inject({
      method: "POST",
      url: "/media/profile-photo",
      headers: multipartHeaders("photo-boundary"),
      payload: multipartPayload({
        boundary: "photo-boundary",
        fieldName: "file",
        filename: "profile.jpg",
        contentType: "image/jpeg",
        body: await imageBuffer("jpeg", 640, 480),
      }),
    });

    assert.equal(response.statusCode, 401);
  } finally {
    await app.close();
  }
});

test("uploadProfilePhoto rejects unsupported HEIC before storing media", async (t) => {
  t.after(restoreUploadServiceDeps);
  const state = mockBackendProfilePhotoUpload();

  await assertAppError(
    uploadsService.uploadProfilePhoto(
      ownerId,
      multipartFile(Buffer.from("heic payload"), "image/heic"),
    ),
    "unsupported_media_type",
    415,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

test("uploadProfilePhoto rejects oversized multipart input", async (t) => {
  t.after(restoreUploadServiceDeps);
  const state = mockBackendProfilePhotoUpload();

  await assertAppError(
    uploadsService.uploadProfilePhoto(
      ownerId,
      multipartFile(Buffer.alloc(10 * 1024 * 1024 + 1), "image/jpeg"),
    ),
    "file_too_large",
    413,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

test("uploadProfilePhoto rejects invalid image before object storage write", async (t) => {
  t.after(restoreUploadServiceDeps);
  const state = mockBackendProfilePhotoUpload();

  await assertAppError(
    uploadsService.uploadProfilePhoto(
      ownerId,
      multipartFile(Buffer.from("this is not an image"), "image/jpeg"),
    ),
    "corrupt_image",
    400,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

test("uploadProfilePhoto enforces profile gallery limit", async (t) => {
  t.after(restoreUploadServiceDeps);
  const state = mockBackendProfilePhotoUpload({ galleryLimitReached: true });

  await assertAppError(
    uploadsService.uploadProfilePhoto(
      ownerId,
      multipartFile(await imageBuffer("jpeg", 640, 480), "image/jpeg"),
    ),
    "profile_gallery_limit_reached",
    409,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

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

test("completeUpload rejects profile photo when gallery limit is reached and cleans raw object", async (t) => {
  t.after(restoreUploadServiceDeps);
  const rawBuffer = await imageBuffer("jpeg", 640, 480);
  const state = mockCompleteProfilePhotoUpload(rawBuffer, "image/jpeg", {
    galleryLimitReached: true,
  });

  await assertAppError(
    uploadsService.completeUpload(ownerId, uploadId, { sizeBytes: rawBuffer.length }),
    "profile_gallery_limit_reached",
    409,
  );

  assert.equal(state.deletedObjectKey, state.upload.objectKey);
  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

test("completeUpload rejects upload owned by another user", async (t) => {
  t.after(restoreUploadServiceDeps);
  const rawBuffer = await imageBuffer("jpeg", 640, 480);
  const state = mockCompleteProfilePhotoUpload(rawBuffer, "image/jpeg", {
    uploadOwnerUserId: "00000000-0000-4000-8000-000000000099",
  });

  await assertAppError(
    uploadsService.completeUpload(ownerId, uploadId, { sizeBytes: rawBuffer.length }),
    "not_found",
    404,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

test("completeUpload requires checksum when prepare included checksum", async (t) => {
  t.after(restoreUploadServiceDeps);
  const rawBuffer = await imageBuffer("jpeg", 640, 480);
  const state = mockCompleteProfilePhotoUpload(rawBuffer, "image/jpeg", {
    checksumSha256: sha256(rawBuffer),
  });

  await assert.rejects(
    uploadsService.completeUpload(ownerId, uploadId, { sizeBytes: rawBuffer.length }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number; details?: Record<string, string> };
      assert.equal(appError.code, "validation_error");
      assert.equal(appError.statusCode, 400);
      assert.equal(appError.details?.checksumSha256, "required");
      return true;
    },
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.galleryMedia, undefined);
});

test("completeUpload rejects checksum mismatch before storing media", async (t) => {
  t.after(restoreUploadServiceDeps);
  const rawBuffer = await imageBuffer("jpeg", 640, 480);
  const state = mockCompleteProfilePhotoUpload(rawBuffer, "image/jpeg", {
    checksumSha256: sha256(rawBuffer),
  });

  await assert.rejects(
    uploadsService.completeUpload(ownerId, uploadId, {
      sizeBytes: rawBuffer.length,
      checksumSha256: sha256(Buffer.from("different")),
    }),
    (error) => {
      const appError = error as { code?: string; statusCode?: number; details?: Record<string, string> };
      assert.equal(appError.code, "validation_error");
      assert.equal(appError.statusCode, 400);
      assert.equal(appError.details?.checksumSha256, "mismatch");
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

function mockBackendProfilePhotoUpload(
  options: {
    galleryLimitReached?: boolean;
  } = {},
) {
  restoreUploadServiceDeps();
  const state: {
    putObject?: { key: string; body: Buffer; contentType: string };
    deletedObjectKeys: string[];
    deletedMediaIds: string[];
    moderationMediaIds: string[];
    mediaInput?: NewMediaFileRow;
    galleryMedia?: MediaFileRow;
  } = {
    deletedObjectKeys: [],
    deletedMediaIds: [],
    moderationMediaIds: [],
  };

  restoreUploadsDeps = uploadsService.__setUploadsServiceDepsForTests({
    assertCanAddProfilePhotoToGallery: async () => {
      if (options.galleryLimitReached) {
        throw new AppError(
          "profile_gallery_limit_reached",
          "Profile gallery photo limit has been reached",
          409,
        );
      }
    },
    putObjectBuffer: async (input) => {
      state.putObject = {
        key: input.key,
        body: input.body,
        contentType: input.contentType,
      };
    },
    createMediaFile: async (mediaInput) => {
      state.mediaInput = mediaInput;
      return mediaRow(mediaInput);
    },
    queueInitialMediaModeration: async (media) => {
      state.moderationMediaIds.push(media.id);
      return undefined as never;
    },
    addCompletedProfilePhotoToGallery: async (_userId, media) => {
      state.galleryMedia = media;
    },
    deleteObject: async (input) => {
      state.deletedObjectKeys.push(input.key);
    },
    deleteMediaFileByOwner: async (mediaId) => {
      state.deletedMediaIds.push(mediaId);
      return undefined;
    },
  });

  return state;
}

function mockCompleteProfilePhotoUpload(
  rawBuffer: Buffer,
  contentType: string,
  options: {
    checksumSha256?: string;
    galleryLimitReached?: boolean;
    uploadOwnerUserId?: string;
  } = {},
) {
  restoreUploadServiceDeps();
  const upload = uploadRow({
    ownerUserId: options.uploadOwnerUserId ?? ownerId,
    mimeType: contentType,
    sizeBytes: rawBuffer.length,
    checksumSha256: options.checksumSha256 ?? null,
  });
  const state: {
    upload: MediaUploadRow;
    putObject?: { key: string; body: Buffer; contentType: string };
    deletedObjectKey?: string;
    mediaInput?: NewMediaFileRow;
    galleryMedia?: MediaFileRow;
    moderationMediaIds: string[];
  } = { upload, moderationMediaIds: [] };

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
    assertCanAddProfilePhotoToGallery: async () => {
      if (options.galleryLimitReached) {
        throw new AppError(
          "profile_gallery_limit_reached",
          "Profile gallery photo limit has been reached",
          409,
        );
      }
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
    queueInitialMediaModeration: async (media) => {
      state.moderationMediaIds.push(media.id);
      return undefined as never;
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
    id: String(input.id ?? mediaId),
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

function multipartFile(buffer: Buffer, mimetype: string): MultipartFile {
  return {
    mimetype,
    file: { truncated: false },
    toBuffer: async () => buffer,
  } as unknown as MultipartFile;
}

function multipartHeaders(boundary: string): Record<string, string> {
  return {
    "content-type": `multipart/form-data; boundary=${boundary}`,
  };
}

function multipartPayload(input: {
  boundary: string;
  fieldName: string;
  filename: string;
  contentType: string;
  body: Buffer;
}): Buffer {
  return Buffer.concat([
    Buffer.from(
      `--${input.boundary}\r\n` +
        `Content-Disposition: form-data; name="${input.fieldName}"; filename="${input.filename}"\r\n` +
        `Content-Type: ${input.contentType}\r\n\r\n`,
    ),
    input.body,
    Buffer.from(`\r\n--${input.boundary}--\r\n`),
  ]);
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
