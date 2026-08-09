import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { MultipartFile } from "@fastify/multipart";
import sharp from "sharp";
import type { MediaFileRow, NewMediaFileRow, UserRow } from "../src/db/schema";
import { MAX_AVATAR_INPUT_BYTES } from "../src/config/constants";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL = "postgresql://amoria:amoria_password@localhost:5432/amoria_test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough";
process.env.PUBLIC_API_URL = "http://localhost:4000";
process.env.PUBLIC_MEDIA_URL = "https://api.example.test/media";
process.env.S3_ENDPOINT = "http://minio:9000";
process.env.S3_PUBLIC_BASE_URL = "https://media.example.test/amoria";
process.env.UPLOADS_DIR = "./uploads-test";

const mediaService = require("../src/media/media.service") as typeof import("../src/media/media.service");
const { closeDb } = require("../src/db/client") as typeof import("../src/db/client");

const ownerId = "00000000-0000-4000-8000-000000000001";
const oldObjectAvatarId = "00000000-0000-4000-8000-000000000101";
const oldObjectAvatarUrl =
  `https://media.example.test/amoria/users/${ownerId}/avatar/${oldObjectAvatarId}.webp`;
const legacyLocalAvatarUrl = `http://localhost:4000/media/users/${ownerId}/avatar.webp`;
const publicMediaPath = (mediaId: string) => `/media/public/${mediaId}`;

let restoreDeps: (() => void) | null = null;

test.after(async () => {
  restoreMediaDeps();
  await closeDb();
});

test("avatar upload stores a pending sanitized WebP and defers avatar replacement until approval", async (t) => {
  t.after(restoreMediaDeps);
  const inputBuffer = await imageBuffer("jpeg", 900, 700);
  const state = mockAvatarUpload({
    currentAvatarUrl: oldObjectAvatarUrl,
    previousMedia: mediaRow({
      id: oldObjectAvatarId,
      path: `users/${ownerId}/avatar/${oldObjectAvatarId}.webp`,
      url: oldObjectAvatarUrl,
    }),
  });

  const response = await mediaService.uploadAvatar(ownerId, multipartFile(inputBuffer));

  assert.equal(state.putObject?.contentType, "image/webp");
  assert.match(
    state.putObject?.key ?? "",
    new RegExp(`^users/${ownerId}/avatar/[0-9a-f-]{36}\\.webp$`),
  );
  const metadata = await sharp(state.putObject?.body).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  assert.equal(state.mediaInput?.id, state.putObject?.key.split("/").at(-1)?.replace(".webp", ""));
  assert.equal(state.mediaInput?.ownerUserId, ownerId);
  assert.equal(state.mediaInput?.type, "avatar");
  assert.equal(state.mediaInput?.path, state.putObject?.key);
  assert.equal(state.mediaInput?.url, publicMediaPath(state.mediaInput?.id ?? ""));
  assert.equal(state.mediaInput?.mimeType, "image/webp");
  assert.equal(state.mediaInput?.sizeBytes, state.putObject?.body.length);
  assert.equal(state.mediaInput?.width, 512);
  assert.equal(state.mediaInput?.height, 512);
  assert.equal(state.mediaInput?.checksumSha256, sha256(state.putObject?.body ?? Buffer.alloc(0)));
  assert.equal(state.mediaInput?.moderationState, "pending");
  assert.equal(state.mediaInput?.moderationOrigin, "awaiting_automatic");
  assert.deepEqual(state.moderationMediaIds, [state.mediaInput?.id]);
  assert.equal(state.updatedAvatarUrl, undefined);
  assert.equal(response.avatarUrl, state.mediaInput?.url);
  assert.equal(response.user.avatarUrl, oldObjectAvatarUrl);
  assert.equal(response.avatarUrl.includes("localhost"), false);
  assert.equal(response.avatarUrl.includes("minio"), false);
  assert.equal(JSON.stringify(response).includes("objectKey"), false);
  assert.equal(JSON.stringify(response).includes('"path"'), false);
  assert.deepEqual(state.deletedObjectKeys, []);
  assert.deepEqual(state.deletedMediaIds, []);
});

test("avatar upload keeps legacy local avatar URL intact during replacement", async (t) => {
  t.after(restoreMediaDeps);
  const inputBuffer = await imageBuffer("png", 700, 700);
  const state = mockAvatarUpload({
    currentAvatarUrl: legacyLocalAvatarUrl,
    previousMedia: mediaRow({
      id: oldObjectAvatarId,
      path: `users/${ownerId}/avatar.webp`,
      url: legacyLocalAvatarUrl,
    }),
  });

  const response = await mediaService.uploadAvatar(ownerId, multipartFile(inputBuffer));

  assert.equal(response.avatarUrl.startsWith("/media/public/"), true);
  assert.deepEqual(state.deletedObjectKeys, []);
  assert.deepEqual(state.deletedMediaIds, []);
});

test("avatar upload with normalized crop stores cropped WebP", async (t) => {
  t.after(restoreMediaDeps);
  const inputBuffer = await splitImageBuffer("jpeg", 800, 400);
  const state = mockAvatarUpload();

  await mediaService.uploadAvatar(ownerId, multipartFile(inputBuffer), {
    x: 0,
    y: 0,
    width: 0.5,
    height: 1,
  });

  assert.equal(state.putObject?.contentType, "image/webp");
  const metadata = await sharp(state.putObject?.body).metadata();
  assert.equal(metadata.width, 512);
  assert.equal(metadata.height, 512);
  const center = await centerPixel(state.putObject?.body ?? Buffer.alloc(0));
  assert.ok(center.r > 180, `expected red crop, got ${JSON.stringify(center)}`);
  assert.ok(center.b < 80, `expected red crop, got ${JSON.stringify(center)}`);
});

test("avatar upload rejects invalid non-square crop metadata", async (t) => {
  t.after(restoreMediaDeps);
  const inputBuffer = await imageBuffer("jpeg", 800, 400);
  const state = mockAvatarUpload();

  await assertAppError(
    mediaService.uploadAvatar(ownerId, multipartFile(inputBuffer), {
      x: 0,
      y: 0,
      width: 0.25,
      height: 0.25,
    }),
    "invalid_crop",
    400,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.updatedAvatarUrl, undefined);
});

test("avatar upload rejects corrupt JPEG content before object storage write", async (t) => {
  t.after(restoreMediaDeps);
  const corruptJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff]),
    Buffer.from("not a readable jpeg"),
  ]);
  const state = mockAvatarUpload();

  await assertAppError(
    mediaService.uploadAvatar(ownerId, multipartFile(corruptJpeg)),
    "corrupt_image",
    400,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
  assert.equal(state.updatedAvatarUrl, undefined);
});

test("avatar upload rejects unsupported GIF input", async (t) => {
  t.after(restoreMediaDeps);
  const gif = Buffer.from("GIF89a");
  const state = mockAvatarUpload();

  await assertAppError(
    mediaService.uploadAvatar(ownerId, multipartFile(gif)),
    "unsupported_media_type",
    415,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
});

test("avatar upload rejects oversized input", async (t) => {
  t.after(restoreMediaDeps);
  const oversized = Buffer.alloc(MAX_AVATAR_INPUT_BYTES + 1);
  const state = mockAvatarUpload();

  await assertAppError(
    mediaService.uploadAvatar(ownerId, multipartFile(oversized)),
    "file_too_large",
    413,
  );

  assert.equal(state.putObject, undefined);
  assert.equal(state.mediaInput, undefined);
});

function mockAvatarUpload(input: {
  currentAvatarUrl?: string | null;
  previousMedia?: MediaFileRow;
} = {}) {
  restoreMediaDeps();

  const state: {
    putObject?: { key: string; body: Buffer; contentType: string };
    mediaInput?: NewMediaFileRow;
    updatedAvatarUrl?: string;
    moderationMediaIds: string[];
    deletedObjectKeys: string[];
    deletedMediaIds: string[];
  } = {
    moderationMediaIds: [],
    deletedObjectKeys: [],
    deletedMediaIds: [],
  };

  restoreDeps = mediaService.__setMediaServiceDepsForTests({
    findUserById: async () => userRow({ avatarUrl: input.currentAvatarUrl ?? null }),
    putObjectBuffer: async (objectInput) => {
      state.putObject = {
        key: objectInput.key,
        body: objectInput.body,
        contentType: objectInput.contentType,
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
    updateUserAvatar: async (_userId, avatarUrl) => {
      state.updatedAvatarUrl = avatarUrl;
      return userRow({ avatarUrl });
    },
    findOwnedMediaFileByUrl: async (_userId, avatarUrl) =>
      input.previousMedia?.url === avatarUrl ? input.previousMedia : undefined,
    deleteObject: async (objectInput) => {
      state.deletedObjectKeys.push(objectInput.key);
    },
    deleteMediaFileByOwner: async (mediaId) => {
      state.deletedMediaIds.push(mediaId);
      return undefined;
    },
  });

  return state;
}

function restoreMediaDeps(): void {
  if (restoreDeps) {
    restoreDeps();
    restoreDeps = null;
  }
}

function multipartFile(buffer: Buffer): MultipartFile {
  return {
    file: { truncated: false },
    toBuffer: async () => buffer,
  } as unknown as MultipartFile;
}

function userRow(overrides: Partial<UserRow> = {}): UserRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: ownerId,
    email: "owner@example.test",
    emailVerifiedAt: now,
    passwordHash: "hash",
    displayName: "Owner",
    about: null,
    amoriaId: "AM23456",
    avatarUrl: null,
    photos: [],
    gender: null,
    preferredGenders: [],
    goal: null,
    mood: null,
    interests: [],
    flirtEnabled: false,
    allowAdultMode: false,
    mysteryMode: false,
    birthDate: "1995-01-01",
    preferredAgeMin: 18,
    preferredAgeMax: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
    lastSeenAt: overrides.lastSeenAt ?? null,
  };
}

function mediaRow(overrides: Partial<MediaFileRow | NewMediaFileRow>): MediaFileRow {
  const now = new Date("2026-01-01T00:00:00.000Z");

  return {
    id: String(overrides.id ?? oldObjectAvatarId),
    ownerUserId: String(overrides.ownerUserId ?? ownerId),
    type: String(overrides.type ?? "avatar"),
    path: String(overrides.path ?? `users/${ownerId}/avatar/${oldObjectAvatarId}.webp`),
    url: String(overrides.url ?? oldObjectAvatarUrl),
    mimeType: String(overrides.mimeType ?? "image/webp"),
    sizeBytes: Number(overrides.sizeBytes ?? 1234),
    width: Number(overrides.width ?? 512),
    height: Number(overrides.height ?? 512),
    checksumSha256: overrides.checksumSha256 ?? null,
    moderationState: String(overrides.moderationState ?? "approved"),
    moderationOrigin: String(overrides.moderationOrigin ?? "legacy_pre_moderation"),
    automatedCheckedAt: overrides.automatedCheckedAt ?? null,
    moderationUpdatedAt: now,
    createdAt: now,
  };
}

async function imageBuffer(
  format: "jpeg" | "png",
  width: number,
  height: number,
): Promise<Buffer> {
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 80, g: 120, b: 200 },
    },
  });

  return format === "jpeg" ? image.jpeg({ quality: 90 }).toBuffer() : image.png().toBuffer();
}

async function splitImageBuffer(
  format: "jpeg" | "png",
  width: number,
  height: number,
): Promise<Buffer> {
  const left = await sharp({
    create: {
      width: Math.floor(width / 2),
      height,
      channels: 3,
      background: { r: 230, g: 20, b: 20 },
    },
  }).png().toBuffer();
  const right = await sharp({
    create: {
      width: width - Math.floor(width / 2),
      height,
      channels: 3,
      background: { r: 20, g: 40, b: 230 },
    },
  }).png().toBuffer();
  const image = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  }).composite([
    { input: left, left: 0, top: 0 },
    { input: right, left: Math.floor(width / 2), top: 0 },
  ]);

  return format === "jpeg" ? image.jpeg({ quality: 95 }).toBuffer() : image.png().toBuffer();
}

async function centerPixel(buffer: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data, info } = await sharp(buffer)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const x = Math.floor(info.width / 2);
  const y = Math.floor(info.height / 2);
  const index = (y * info.width + x) * info.channels;
  return {
    r: data[index] ?? 0,
    g: data[index + 1] ?? 0,
    b: data[index + 2] ?? 0,
  };
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
