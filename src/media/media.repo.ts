import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db } from "../db/client";
import {
  type MediaFileRow,
  type MediaModerationJobRow,
  type MediaModerationReviewRow,
  type MediaUploadRow,
  type NewMediaFileRow,
  type NewMediaModerationReviewRow,
  type NewMediaUploadRow,
  mediaFiles,
  mediaModerationJobs,
  mediaModerationReviews,
  mediaUploads,
  profileGalleryItems,
} from "../db/schema";
import {
  MEDIA_MODERATION_ENGINE,
  MEDIA_MODERATION_MODEL_VERSION,
  MEDIA_MODERATION_POLICY_VERSION,
  type MediaModerationState,
} from "./media-moderation.constants";

export async function createMediaFile(input: NewMediaFileRow): Promise<MediaFileRow> {
  const [created] = await db.insert(mediaFiles).values(input).returning();
  return created;
}

export async function createMediaModerationReview(
  input: NewMediaModerationReviewRow,
): Promise<MediaModerationReviewRow> {
  const [created] = await db.insert(mediaModerationReviews).values(input).returning();
  if (!created) {
    throw new Error("Failed to create media moderation review");
  }

  return created;
}

export async function enqueueMediaModerationJob(
  mediaId: string,
): Promise<MediaModerationJobRow | undefined> {
  const [created] = await db
    .insert(mediaModerationJobs)
    .values({
      mediaId,
      status: "queued",
      providerEngine: MEDIA_MODERATION_ENGINE,
      modelVersion: MEDIA_MODERATION_MODEL_VERSION,
      policyVersion: MEDIA_MODERATION_POLICY_VERSION,
    })
    .onConflictDoNothing()
    .returning();
  return created;
}

export async function updateMediaModerationState(
  mediaId: string,
  state: MediaModerationState,
  origin: string,
): Promise<MediaFileRow | undefined> {
  const [updated] = await db
    .update(mediaFiles)
    .set({
      moderationState: state,
      moderationOrigin: origin,
      moderationUpdatedAt: new Date(),
    })
    .where(eq(mediaFiles.id, mediaId))
    .returning();
  return updated;
}

export type PublicMediaModerationCandidate = Pick<
  MediaFileRow,
  "id" | "ownerUserId" | "type" | "moderationState"
>;

export async function listPublicMediaModerationCandidates(
  mediaIds: string[],
): Promise<PublicMediaModerationCandidate[]> {
  if (mediaIds.length === 0) {
    return [];
  }

  const uniqueIds = [...new Set(mediaIds)];
  const rows = await db
    .select({
      id: mediaFiles.id,
      ownerUserId: mediaFiles.ownerUserId,
      type: mediaFiles.type,
      moderationState: mediaFiles.moderationState,
      galleryVisibility: profileGalleryItems.visibility,
    })
    .from(mediaFiles)
    .leftJoin(profileGalleryItems, eq(profileGalleryItems.mediaId, mediaFiles.id))
    .where(and(
      inArray(mediaFiles.id, uniqueIds),
      or(
        eq(mediaFiles.type, "avatar"),
        and(eq(mediaFiles.type, "profile_photo"), eq(profileGalleryItems.visibility, "public")),
      ),
    ));

  return rows.map(({ galleryVisibility: _galleryVisibility, ...media }) => media);
}

export async function findLatestMediaModerationJob(
  mediaId: string,
): Promise<MediaModerationJobRow | undefined> {
  const [job] = await db
    .select()
    .from(mediaModerationJobs)
    .where(eq(mediaModerationJobs.mediaId, mediaId))
    .orderBy(desc(mediaModerationJobs.createdAt))
    .limit(1);
  return job;
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

export async function findMediaFileById(mediaId: string): Promise<MediaFileRow | undefined> {
  const [media] = await db
    .select()
    .from(mediaFiles)
    .where(eq(mediaFiles.id, mediaId))
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
