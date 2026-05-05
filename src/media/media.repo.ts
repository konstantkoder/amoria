import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  type MediaFileRow,
  type MediaUploadRow,
  type NewMediaFileRow,
  type NewMediaUploadRow,
  mediaFiles,
  mediaUploads,
} from "../db/schema";

export async function createMediaFile(input: NewMediaFileRow): Promise<MediaFileRow> {
  const [created] = await db.insert(mediaFiles).values(input).returning();
  return created;
}

export async function createMediaUpload(input: NewMediaUploadRow): Promise<MediaUploadRow> {
  const [created] = await db.insert(mediaUploads).values(input).returning();
  return created;
}

export async function findMediaUploadById(uploadId: string): Promise<MediaUploadRow | undefined> {
  const [upload] = await db.select().from(mediaUploads).where(eq(mediaUploads.id, uploadId)).limit(1);
  return upload;
}

export async function findMediaFileByOwner(
  mediaId: string,
  ownerUserId: string,
): Promise<MediaFileRow | undefined> {
  const [media] = await db
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.ownerUserId, ownerUserId)))
    .limit(1);

  return media;
}

export async function findOwnedMediaFilesByIds(
  ownerUserId: string,
  ids: string[],
): Promise<MediaFileRow[]> {
  if (ids.length === 0) {
    return [];
  }

  return db
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.ownerUserId, ownerUserId), inArray(mediaFiles.id, ids)));
}

export async function findOwnedMediaFileByUrl(
  ownerUserId: string,
  url: string,
): Promise<MediaFileRow | undefined> {
  const [media] = await db
    .select()
    .from(mediaFiles)
    .where(and(eq(mediaFiles.ownerUserId, ownerUserId), eq(mediaFiles.url, url)))
    .limit(1);

  return media;
}

export async function completeMediaUploadWithFile(
  uploadId: string,
  mediaInput: NewMediaFileRow,
  completedAt: Date,
): Promise<{ upload: MediaUploadRow; media: MediaFileRow } | undefined> {
  return db.transaction(async (tx) => {
    const [upload] = await tx
      .update(mediaUploads)
      .set({
        status: "completed",
        completedAt,
      })
      .where(and(eq(mediaUploads.id, uploadId), eq(mediaUploads.status, "prepared")))
      .returning();

    if (!upload) {
      return undefined;
    }

    const [media] = await tx.insert(mediaFiles).values(mediaInput).returning();
    return { upload, media };
  });
}

export async function deleteMediaFileByOwner(
  mediaId: string,
  ownerUserId: string,
): Promise<MediaFileRow | undefined> {
  const [deleted] = await db
    .delete(mediaFiles)
    .where(and(eq(mediaFiles.id, mediaId), eq(mediaFiles.ownerUserId, ownerUserId)))
    .returning();

  return deleted;
}
