import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { AppError } from "../common/errors";
import { env } from "../config/env";

export type StoredAvatar = {
  relativePath: string;
  absolutePath: string;
  url: string;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function ensureUploadsRootSync(): void {
  fsSync.mkdirSync(env.UPLOADS_ROOT, { recursive: true });
}

function safeResolve(relativePath: string): string {
  const absolutePath = path.resolve(env.UPLOADS_ROOT, relativePath);
  const relative = path.relative(env.UPLOADS_ROOT, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new AppError("storage_write_failed", "Invalid storage path", 500);
  }

  return absolutePath;
}

export async function saveAvatar(userId: string, buffer: Buffer): Promise<StoredAvatar> {
  if (!uuidPattern.test(userId)) {
    throw new AppError("storage_write_failed", "Invalid user storage path", 500);
  }

  const relativePath = path.join("users", userId, "avatar.webp");
  const absolutePath = safeResolve(relativePath);
  const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(tempPath, buffer, { flag: "wx" });
    await fs.rename(tempPath, absolutePath);
  } catch {
    await fs.rm(tempPath, { force: true }).catch(() => undefined);
    throw new AppError("storage_write_failed", "Could not write avatar file", 500);
  }

  const urlPath = `users/${userId}/avatar.webp`;
  return {
    relativePath: urlPath,
    absolutePath,
    url: `${env.PUBLIC_MEDIA_URL}/${urlPath}`,
  };
}
