import { createHash } from "node:crypto";
import { pool } from "../db/client";
import { env } from "../config/env";
import { headObject, listObjectKeys } from "./object-storage";

export type MediaOrphanDiagnostics = {
  checkedAt: string;
  bounded: true;
  databaseMediaCount: number;
  objectCount: number;
  objectListingTruncated: boolean;
  mediaRowsWithMissingObject: string[];
  objectKeyHashesWithoutMediaRow: string[];
  galleryRowsWithoutUsableMedia: string[];
  avatarReferencesWithoutUsableMedia: string[];
};

export async function diagnoseMediaOrphans(maximumRows = 1000): Promise<MediaOrphanDiagnostics> {
  if (!Number.isInteger(maximumRows) || maximumRows < 1 || maximumRows > 10_000) {
    throw new Error("maximumRows must be between 1 and 10000");
  }
  const mediaResult = await pool.query<{ id: string; path: string }>(
    "SELECT id, path FROM media_files ORDER BY created_at LIMIT $1",
    [maximumRows],
  );
  const mediaRowsWithMissingObject: string[] = [];
  for (const media of mediaResult.rows) {
    try {
      await headObject({ bucket: env.S3_BUCKET, key: media.path });
    } catch {
      mediaRowsWithMissingObject.push(media.id);
    }
  }

  const objects = await listObjectKeys({ bucket: env.S3_BUCKET, maximumKeys: maximumRows });
  const matchingObjectPaths = objects.keys.length === 0
    ? { rows: [] as { path: string }[] }
    : await pool.query<{ path: string }>(
      "SELECT path FROM media_files WHERE path = ANY($1::text[])",
      [objects.keys],
    );
  const databasePaths = new Set(matchingObjectPaths.rows.map((row) => row.path));
  const objectKeyHashesWithoutMediaRow = objects.keys
    .filter((key) => !databasePaths.has(key))
    .map((key) => createHash("sha256").update(key).digest("hex"));
  const gallery = await pool.query<{ id: string }>(
    `SELECT g.id FROM profile_gallery_items g
     LEFT JOIN media_files m ON m.id=g.media_id
     WHERE m.id IS NULL OR m.moderation_state='removed' OR g.media_id=ANY($2::uuid[])
     ORDER BY g.created_at LIMIT $1`,
    [maximumRows, mediaRowsWithMissingObject],
  );
  const avatars = await pool.query<{ id: string }>(
    `SELECT u.id FROM users u
     LEFT JOIN media_files m ON m.owner_user_id=u.id AND m.url=u.avatar_url
     WHERE u.avatar_url IS NOT NULL
       AND (m.id IS NULL OR m.moderation_state <> 'approved' OR m.id=ANY($2::uuid[]))
     ORDER BY u.created_at LIMIT $1`,
    [maximumRows, mediaRowsWithMissingObject],
  );

  return {
    checkedAt: new Date().toISOString(),
    bounded: true,
    databaseMediaCount: mediaResult.rows.length,
    objectCount: objects.keys.length,
    objectListingTruncated: objects.truncated,
    mediaRowsWithMissingObject,
    objectKeyHashesWithoutMediaRow,
    galleryRowsWithoutUsableMedia: gallery.rows.map((row) => row.id),
    avatarReferencesWithoutUsableMedia: avatars.rows.map((row) => row.id),
  };
}
