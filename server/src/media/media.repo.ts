import { db } from "../db/client";
import { type MediaFileRow, type NewMediaFileRow, mediaFiles } from "../db/schema";

export async function createMediaFile(input: NewMediaFileRow): Promise<MediaFileRow> {
  const [created] = await db.insert(mediaFiles).values(input).returning();
  return created;
}
