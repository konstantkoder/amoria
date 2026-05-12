import { createHash } from "node:crypto";
import { AppError } from "../common/errors";
import { MAX_AVATAR_INPUT_BYTES } from "../config/constants";

const supportedAvatarImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function hasBytes(buffer: Buffer, bytes: number[]): boolean {
  if (buffer.length < bytes.length) {
    return false;
  }

  return bytes.every((byte, index) => buffer[index] === byte);
}

export function detectImageMimeType(buffer: Buffer): string | undefined {
  if (hasBytes(buffer, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (hasBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return "image/gif";
  }

  return undefined;
}

export function assertAvatarInput(buffer: Buffer): string {
  if (buffer.length > MAX_AVATAR_INPUT_BYTES) {
    throw new AppError("file_too_large", "Avatar file must be 8 MB or smaller", 413, {
      file: "too_large",
    });
  }

  const detectedMimeType = detectImageMimeType(buffer);
  if (!detectedMimeType || !supportedAvatarImageMimeTypes.has(detectedMimeType)) {
    throw new AppError("unsupported_media_type", "Only JPEG, PNG, or WebP images are supported", 415, {
      file: "unsupported_media_type",
    });
  }

  return detectedMimeType;
}

export function checksumSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function isMultipartFileTooLarge(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: string; message?: string };
  return (
    candidate.code === "FST_REQ_FILE_TOO_LARGE" ||
    candidate.code === "LIMIT_FILE_SIZE" ||
    candidate.message?.toLowerCase().includes("file size") === true
  );
}
