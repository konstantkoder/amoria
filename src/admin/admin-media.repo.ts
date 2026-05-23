import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  type MediaFileRow,
  type MediaModerationReviewRow,
  type NewMediaModerationReviewRow,
  mediaFiles,
  mediaModerationReviews,
  profileGalleryItems,
  users,
} from "../db/schema";
import {
  moderationStatusForReview,
  type AdminMediaQuery,
  type AdminMediaRow,
} from "./admin-media.types";

type MediaSelectRow = {
  media: MediaFileRow;
  owner: {
    id: string;
    amoriaId: string;
    displayName: string;
    email: string;
  };
  gallery: {
    visibility: string;
  } | null;
};

export async function listMedia(query: AdminMediaQuery): Promise<AdminMediaRow[]> {
  const conditions: SQL[] = [];

  if (query.ownerAmoriaId) {
    conditions.push(eq(users.amoriaId, query.ownerAmoriaId));
  }
  if (query.type) {
    conditions.push(eq(mediaFiles.type, query.type));
  }

  let selectQuery = mediaSelect().$dynamic();
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const rows = await selectQuery
    .orderBy(desc(mediaFiles.createdAt))
    .limit(query.limit);

  const withReviews = await attachLatestReviews(rows.map(toAdminMediaRow));
  if (!query.moderationStatus) {
    return withReviews;
  }

  return withReviews.filter((row) => moderationStatusForReview(row.latestReview) === query.moderationStatus);
}

export async function findMediaById(mediaId: string): Promise<AdminMediaRow | undefined> {
  const [row] = await mediaSelect().where(eq(mediaFiles.id, mediaId)).limit(1);
  if (!row) {
    return undefined;
  }

  const [withReview] = await attachLatestReviews([toAdminMediaRow(row)]);
  return withReview;
}

export async function listMediaReviews(mediaId: string): Promise<MediaModerationReviewRow[]> {
  return db
    .select()
    .from(mediaModerationReviews)
    .where(eq(mediaModerationReviews.mediaId, mediaId))
    .orderBy(desc(mediaModerationReviews.createdAt));
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

async function attachLatestReviews(rows: AdminMediaRow[]): Promise<AdminMediaRow[]> {
  const withReviews: AdminMediaRow[] = [];

  for (const row of rows) {
    const [latestReview] = await db
      .select()
      .from(mediaModerationReviews)
      .where(eq(mediaModerationReviews.mediaId, row.id))
      .orderBy(desc(mediaModerationReviews.createdAt))
      .limit(1);

    withReviews.push({
      ...row,
      latestReview: latestReview ?? null,
    });
  }

  return withReviews;
}

function mediaSelect() {
  return db
    .select({
      media: mediaFiles,
      owner: {
        id: users.id,
        amoriaId: users.amoriaId,
        displayName: users.displayName,
        email: users.email,
      },
      gallery: {
        visibility: profileGalleryItems.visibility,
      },
    })
    .from(mediaFiles)
    .innerJoin(users, eq(mediaFiles.ownerUserId, users.id))
    .leftJoin(profileGalleryItems, eq(mediaFiles.id, profileGalleryItems.mediaId));
}

function toAdminMediaRow(row: MediaSelectRow): AdminMediaRow {
  return {
    id: row.media.id,
    ownerUserId: row.media.ownerUserId,
    owner: row.owner,
    type: row.media.type,
    path: row.media.path,
    url: row.media.url,
    mimeType: row.media.mimeType,
    sizeBytes: row.media.sizeBytes,
    width: row.media.width,
    height: row.media.height,
    checksumSha256: row.media.checksumSha256,
    visibility: mediaVisibility(row.media.type, row.gallery?.visibility ?? null),
    createdAt: row.media.createdAt,
    latestReview: null,
  };
}

function mediaVisibility(
  mediaType: string,
  galleryVisibility: string | null,
): AdminMediaRow["visibility"] {
  if (mediaType === "avatar") {
    return "avatar";
  }

  if (galleryVisibility === "public" || galleryVisibility === "locked") {
    return galleryVisibility;
  }

  return null;
}
