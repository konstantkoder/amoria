import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db } from "../db/client";
import {
  type MediaFileRow,
  type MediaModerationReviewRow,
  type ProfileGalleryItemRow,
  type ProfileLockedGallerySettingsRow,
  mediaFiles,
  mediaModerationReviews,
  profileGalleryItems,
  profileLockedGallerySettings,
} from "../db/schema";

export type ProfileGalleryVisibility = "public" | "locked";

export type ProfileGalleryItemWithMedia = {
  item: ProfileGalleryItemRow;
  media: MediaFileRow;
};

export type GalleryItemUpdate = {
  mediaId: string;
  visibility: ProfileGalleryVisibility;
  position: number;
};

export async function listGalleryItemsForUser(
  userId: string,
): Promise<ProfileGalleryItemWithMedia[]> {
  const rows = await db
    .select({
      item: profileGalleryItems,
      media: mediaFiles,
    })
    .from(profileGalleryItems)
    .innerJoin(mediaFiles, eq(mediaFiles.id, profileGalleryItems.mediaId))
    .where(eq(profileGalleryItems.userId, userId))
    .orderBy(asc(profileGalleryItems.position), asc(profileGalleryItems.createdAt));

  return rows;
}

export async function findGalleryItemForMedia(
  userId: string,
  mediaId: string,
): Promise<ProfileGalleryItemWithMedia | undefined> {
  const [row] = await db
    .select({
      item: profileGalleryItems,
      media: mediaFiles,
    })
    .from(profileGalleryItems)
    .innerJoin(mediaFiles, eq(mediaFiles.id, profileGalleryItems.mediaId))
    .where(and(eq(profileGalleryItems.userId, userId), eq(profileGalleryItems.mediaId, mediaId)))
    .limit(1);

  return row;
}

export async function listLatestModerationReviewsForMediaIds(
  mediaIds: string[],
): Promise<Record<string, MediaModerationReviewRow>> {
  const uniqueMediaIds = [...new Set(mediaIds)];
  if (uniqueMediaIds.length === 0) {
    return {};
  }

  const rows = await db
    .select()
    .from(mediaModerationReviews)
    .where(inArray(mediaModerationReviews.mediaId, uniqueMediaIds))
    .orderBy(desc(mediaModerationReviews.createdAt));

  const latestByMediaId: Record<string, MediaModerationReviewRow> = {};
  for (const row of rows) {
    if (!latestByMediaId[row.mediaId]) {
      latestByMediaId[row.mediaId] = row;
    }
  }

  return latestByMediaId;
}

export async function getLockedGallerySettings(
  userId: string,
): Promise<ProfileLockedGallerySettingsRow | undefined> {
  const [settings] = await db
    .select()
    .from(profileLockedGallerySettings)
    .where(eq(profileLockedGallerySettings.userId, userId))
    .limit(1);

  return settings;
}

export async function upsertLockedGalleryPasswordHash(
  userId: string,
  passwordHash: string,
  now: Date,
): Promise<void> {
  await db
    .insert(profileLockedGallerySettings)
    .values({
      userId,
      passwordHash,
      passwordSetAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profileLockedGallerySettings.userId,
      set: {
        passwordHash,
        passwordSetAt: now,
        updatedAt: now,
      },
    });
}

export async function clearLockedGalleryPasswordHash(userId: string, now: Date): Promise<void> {
  await db
    .insert(profileLockedGallerySettings)
    .values({
      userId,
      passwordHash: null,
      passwordSetAt: null,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profileLockedGallerySettings.userId,
      set: {
        passwordHash: null,
        passwordSetAt: null,
        updatedAt: now,
      },
    });
}

export async function upsertPublicGalleryItemForMedia(
  userId: string,
  mediaId: string,
): Promise<void> {
  const position = await nextGalleryPosition(userId);
  const now = new Date();

  await db
    .insert(profileGalleryItems)
    .values({
      userId,
      mediaId,
      visibility: "public",
      position,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [profileGalleryItems.userId, profileGalleryItems.mediaId],
      set: {
        visibility: "public",
        position,
        updatedAt: now,
      },
    });
}

export async function replacePublicGalleryItems(
  userId: string,
  mediaIds: string[],
): Promise<void> {
  const uniqueMediaIds = [...new Set(mediaIds)];
  const now = new Date();

  await db.transaction(async (tx) => {
    if (uniqueMediaIds.length === 0) {
      await tx
        .delete(profileGalleryItems)
        .where(
          and(eq(profileGalleryItems.userId, userId), eq(profileGalleryItems.visibility, "public")),
        );
      return;
    }

    await tx
      .delete(profileGalleryItems)
      .where(
        and(
          eq(profileGalleryItems.userId, userId),
          eq(profileGalleryItems.visibility, "public"),
          notInArray(profileGalleryItems.mediaId, uniqueMediaIds),
        ),
      );

    for (const [position, mediaId] of uniqueMediaIds.entries()) {
      await tx
        .insert(profileGalleryItems)
        .values({
          userId,
          mediaId,
          visibility: "public",
          position,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [profileGalleryItems.userId, profileGalleryItems.mediaId],
          set: {
            visibility: "public",
            position,
            updatedAt: now,
          },
        });
    }
  });
}

export async function updateGalleryItems(
  userId: string,
  updates: GalleryItemUpdate[],
): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    for (const update of updates) {
      await tx
        .insert(profileGalleryItems)
        .values({
          userId,
          mediaId: update.mediaId,
          visibility: update.visibility,
          position: update.position,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [profileGalleryItems.userId, profileGalleryItems.mediaId],
          set: {
            visibility: update.visibility,
            position: update.position,
            updatedAt: now,
          },
        });
    }
  });
}

export async function listOwnedProfilePhotoMedia(
  userId: string,
  mediaIds: string[],
): Promise<MediaFileRow[]> {
  if (mediaIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(mediaFiles)
    .where(
      and(
        eq(mediaFiles.ownerUserId, userId),
        eq(mediaFiles.type, "profile_photo"),
        inArray(mediaFiles.id, [...new Set(mediaIds)]),
      ),
    );
}

async function nextGalleryPosition(userId: string): Promise<number> {
  const [last] = await db
    .select({ position: profileGalleryItems.position })
    .from(profileGalleryItems)
    .where(eq(profileGalleryItems.userId, userId))
    .orderBy(desc(profileGalleryItems.position))
    .limit(1);

  return (last?.position ?? -1) + 1;
}
