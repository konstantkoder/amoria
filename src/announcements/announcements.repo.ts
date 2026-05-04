import { and, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import {
  type AnnouncementResponseRow,
  type AnnouncementRow,
  type MediaFileRow,
  type NewAnnouncementResponseRow,
  type NewAnnouncementRow,
  announcementResponses,
  announcements,
  mediaFiles,
  users,
} from "../db/schema";
import type { AnnouncementStatus } from "./announcements.types";

export type AnnouncementDetailsRow = {
  id: string;
  authorUserId: string;
  status: string;
  title: string;
  description: string;
  category: string;
  placeLabel: string | null;
  photoUrl: string | null;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
  responseCount: number;
  hasResponded: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export async function listActiveAnnouncementDetails(
  viewerUserId: string,
  limit: number,
): Promise<AnnouncementDetailsRow[]> {
  const responseCounts = responseCountsSubquery();
  const myResponse = alias(announcementResponses, "my_announcement_response");

  return db
    .select({
      id: announcements.id,
      authorUserId: announcements.authorUserId,
      status: announcements.status,
      title: announcements.title,
      description: announcements.description,
      category: announcements.category,
      placeLabel: announcements.placeLabel,
      photoUrl: mediaFiles.url,
      author: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
      responseCount: sql<number>`coalesce(${responseCounts.responseCount}, 0)`,
      hasResponded: sql<boolean>`${myResponse.id} is not null`,
      createdAt: announcements.createdAt,
      updatedAt: announcements.updatedAt,
    })
    .from(announcements)
    .innerJoin(users, eq(users.id, announcements.authorUserId))
    .leftJoin(mediaFiles, eq(mediaFiles.id, announcements.photoMediaId))
    .leftJoin(responseCounts, eq(responseCounts.announcementId, announcements.id))
    .leftJoin(
      myResponse,
      and(eq(myResponse.announcementId, announcements.id), eq(myResponse.fromUserId, viewerUserId)),
    )
    .where(eq(announcements.status, "active"))
    .orderBy(desc(announcements.createdAt), desc(announcements.id))
    .limit(limit);
}

export async function findAnnouncementDetails(
  announcementId: string,
  viewerUserId: string,
): Promise<AnnouncementDetailsRow | undefined> {
  const responseCounts = responseCountsSubquery();
  const myResponse = alias(announcementResponses, "my_announcement_response");

  const [row] = await db
    .select({
      id: announcements.id,
      authorUserId: announcements.authorUserId,
      status: announcements.status,
      title: announcements.title,
      description: announcements.description,
      category: announcements.category,
      placeLabel: announcements.placeLabel,
      photoUrl: mediaFiles.url,
      author: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
      responseCount: sql<number>`coalesce(${responseCounts.responseCount}, 0)`,
      hasResponded: sql<boolean>`${myResponse.id} is not null`,
      createdAt: announcements.createdAt,
      updatedAt: announcements.updatedAt,
    })
    .from(announcements)
    .innerJoin(users, eq(users.id, announcements.authorUserId))
    .leftJoin(mediaFiles, eq(mediaFiles.id, announcements.photoMediaId))
    .leftJoin(responseCounts, eq(responseCounts.announcementId, announcements.id))
    .leftJoin(
      myResponse,
      and(eq(myResponse.announcementId, announcements.id), eq(myResponse.fromUserId, viewerUserId)),
    )
    .where(eq(announcements.id, announcementId))
    .limit(1);

  return row;
}

export async function findAnnouncementById(
  announcementId: string,
): Promise<AnnouncementRow | undefined> {
  const [announcement] = await db
    .select()
    .from(announcements)
    .where(eq(announcements.id, announcementId))
    .limit(1);

  return announcement;
}

export async function createAnnouncement(input: NewAnnouncementRow): Promise<AnnouncementRow> {
  const [created] = await db.insert(announcements).values(input).returning();
  return created;
}

export async function updateAnnouncementStatus(
  announcementId: string,
  status: AnnouncementStatus,
): Promise<AnnouncementRow | undefined> {
  const [updated] = await db
    .update(announcements)
    .set({
      status,
      updatedAt: new Date(),
    })
    .where(eq(announcements.id, announcementId))
    .returning();

  return updated;
}

export async function findOwnedMediaFile(
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

export async function createAnnouncementResponseIdempotent(
  input: NewAnnouncementResponseRow,
): Promise<AnnouncementResponseRow> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(announcementResponses)
      .values(input)
      .onConflictDoNothing({
        target: [announcementResponses.announcementId, announcementResponses.fromUserId],
      })
      .returning();

    if (created) {
      return created;
    }

    const [existing] = await tx
      .select()
      .from(announcementResponses)
      .where(
        and(
          eq(announcementResponses.announcementId, input.announcementId),
          eq(announcementResponses.fromUserId, input.fromUserId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Announcement response conflict target was not found after insert conflict");
    }

    return existing;
  });
}

function responseCountsSubquery() {
  return db
    .select({
      announcementId: announcementResponses.announcementId,
      responseCount: sql<number>`cast(count(${announcementResponses.id}) as int)`.as(
        "response_count",
      ),
    })
    .from(announcementResponses)
    .groupBy(announcementResponses.announcementId)
    .as("response_counts");
}
