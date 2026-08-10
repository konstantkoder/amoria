import { and, desc, eq, gte, inArray, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/client";
import {
  type MediaFileRow,
  type MediaModerationReviewRow,
  type NewMediaModerationReviewRow,
  mediaFiles,
  mediaModerationJobs,
  mediaModerationReviews,
  profileGalleryItems,
  users,
  adminAuditLog,
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
  if (query.createdFrom) {
    conditions.push(gte(mediaFiles.createdAt, query.createdFrom));
  }
  if (query.createdTo) {
    conditions.push(lte(mediaFiles.createdAt, query.createdTo));
  }
  if (query.visibility === "avatar") {
    conditions.push(eq(mediaFiles.type, "avatar"));
  } else if (query.visibility) {
    conditions.push(eq(profileGalleryItems.visibility, query.visibility));
  }

  let selectQuery = mediaSelect().$dynamic();
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const rows = await selectQuery
    .orderBy(desc(mediaFiles.createdAt))
    .limit(query.limit);

  const withReviews = await attachLatestHistory(rows.map(toAdminMediaRow));
  if (!query.moderationStatus) {
    return withReviews;
  }

  return withReviews.filter((row) => moderationStatusForReview(row.latestReview, row) === query.moderationStatus);
}

export async function findMediaById(mediaId: string): Promise<AdminMediaRow | undefined> {
  const [row] = await mediaSelect().where(eq(mediaFiles.id, mediaId)).limit(1);
  if (!row) {
    return undefined;
  }

  const [withReview] = await attachLatestHistory([toAdminMediaRow(row)]);
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

export async function createEffectiveMediaDecision(
  input: NewMediaModerationReviewRow,
): Promise<MediaModerationReviewRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`
      SELECT id FROM ${mediaFiles}
      WHERE ${mediaFiles.id} = ${input.mediaId}
      FOR UPDATE
    `);
    await tx.execute(sql`
      SELECT id FROM ${profileGalleryItems}
      WHERE ${profileGalleryItems.mediaId} = ${input.mediaId}
      FOR UPDATE
    `);
    const state = input.action === "approve"
      ? "approved"
      : input.action === "restrict"
        ? "restricted"
        : input.action === "remove"
          ? "removed"
          : "needs_review";
    const now = new Date();
    const [media] = await tx
      .update(mediaFiles)
      .set({ moderationState: state, moderationOrigin: "manual", moderationUpdatedAt: now })
      .where(eq(mediaFiles.id, input.mediaId))
      .returning();
    if (!media) {
      throw new Error("Media disappeared during moderation decision");
    }

    await tx
      .update(mediaModerationJobs)
      .set({ status: "cancelled", completedAt: now, updatedAt: now, errorCode: "manual_decision" })
      .where(and(
        eq(mediaModerationJobs.mediaId, input.mediaId),
        inArray(mediaModerationJobs.status, ["queued", "running"]),
      ));

    if (input.action === "remove") {
      await tx.delete(profileGalleryItems).where(eq(profileGalleryItems.mediaId, input.mediaId));
    }
    if (input.action === "remove" || input.action === "restrict") {
      await tx
        .update(users)
        .set({ avatarUrl: null, updatedAt: now })
        .where(and(eq(users.id, media.ownerUserId), eq(users.avatarUrl, media.url)));
    } else if (input.action === "approve" && media.type === "avatar") {
      const [owner] = await tx
        .select({ avatarUrl: users.avatarUrl })
        .from(users)
        .where(eq(users.id, media.ownerUserId))
        .limit(1);
      await tx.update(users).set({ avatarUrl: media.url, updatedAt: now }).where(eq(users.id, media.ownerUserId));
      if (owner && owner.avatarUrl !== media.url) {
        const retiredAvatars = await tx
          .update(mediaFiles)
          .set({
            moderationState: "removed",
            moderationOrigin: "avatar_replaced",
            moderationUpdatedAt: now,
          })
          .where(and(
            eq(mediaFiles.ownerUserId, media.ownerUserId),
            eq(mediaFiles.type, "avatar"),
            ne(mediaFiles.id, media.id),
            ne(mediaFiles.moderationState, "removed"),
            or(
              owner.avatarUrl ? eq(mediaFiles.url, owner.avatarUrl) : undefined,
              lt(mediaFiles.createdAt, media.createdAt),
            ),
          ))
          .returning();
        for (const retiredAvatar of retiredAvatars) {
          await tx
            .update(mediaModerationJobs)
            .set({ status: "cancelled", completedAt: now, updatedAt: now, errorCode: "avatar_replaced" })
            .where(and(
              eq(mediaModerationJobs.mediaId, retiredAvatar.id),
              inArray(mediaModerationJobs.status, ["queued", "running"]),
            ));
          await tx.insert(mediaModerationReviews).values({
            mediaId: retiredAvatar.id,
            ownerUserId: media.ownerUserId,
            adminUserId: input.adminUserId,
            action: "remove",
            reason: "Superseded by a newly approved avatar",
            metadata: { source: "avatar_replacement", replacementMediaId: media.id },
          });
        }
      }
    }

    if (media.type === "profile_photo") {
      const approvedRows = await tx
        .select({ mediaId: mediaFiles.id, url: mediaFiles.url })
        .from(profileGalleryItems)
        .innerJoin(mediaFiles, eq(mediaFiles.id, profileGalleryItems.mediaId))
        .where(and(
          eq(profileGalleryItems.userId, media.ownerUserId),
          eq(profileGalleryItems.visibility, "public"),
          eq(mediaFiles.moderationState, "approved"),
        ))
        .orderBy(profileGalleryItems.position);
      await tx.update(users).set({ photos: approvedRows, updatedAt: now }).where(eq(users.id, media.ownerUserId));
    }

    const [created] = await tx.insert(mediaModerationReviews).values(input).returning();
    if (!created) {
      throw new Error("Failed to create media moderation review");
    }
    return created;
  });
}

export async function hasRecentLockedMediaContentAccess(
  adminUserId: string,
  mediaId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000);
  const [entry] = await db
    .select({ id: adminAuditLog.id })
    .from(adminAuditLog)
    .where(and(
      eq(adminAuditLog.adminUserId, adminUserId),
      eq(adminAuditLog.action, "admin.media.locked.content.read"),
      eq(adminAuditLog.targetId, mediaId),
      gte(adminAuditLog.createdAt, cutoff),
    ))
    .limit(1);
  return Boolean(entry);
}

async function attachLatestHistory(rows: AdminMediaRow[]): Promise<AdminMediaRow[]> {
  const withReviews: AdminMediaRow[] = [];

  for (const row of rows) {
    const [latestReview] = await db
      .select()
      .from(mediaModerationReviews)
      .where(eq(mediaModerationReviews.mediaId, row.id))
      .orderBy(desc(mediaModerationReviews.createdAt))
      .limit(1);
    const [latestJob] = await db
      .select()
      .from(mediaModerationJobs)
      .where(eq(mediaModerationJobs.mediaId, row.id))
      .orderBy(desc(mediaModerationJobs.createdAt))
      .limit(1);

    withReviews.push({
      ...row,
      latestReview: latestReview ?? null,
      latestJob: latestJob ?? null,
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
    moderationState: row.media.moderationState,
    moderationOrigin: row.media.moderationOrigin,
    automatedCheckedAt: row.media.automatedCheckedAt,
    visibility: mediaVisibility(row.media.type, row.gallery?.visibility ?? null),
    createdAt: row.media.createdAt,
    latestReview: null,
    latestJob: null,
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
