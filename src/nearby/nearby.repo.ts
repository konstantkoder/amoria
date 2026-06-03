import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import {
  type NearbyProfileVisibilityRow,
  type NearbyStatusRow,
  type NewNearbyProfileVisibilityRow,
  type NewNearbyStatusRow,
  type UserRow,
  blockedUsers,
  nearbyProfileVisibility,
  nearbyStatuses,
  users,
} from "../db/schema";

export type NearbyFeedRow = {
  id: string;
  authorUserId: string;
  text: string;
  distanceMeters: number;
  createdAt: Date;
  expiresAt: Date;
  author: {
    id: string;
    displayName: string;
    avatarUrl: string | null;
  };
};

export type NearbyProfileFeedRow = {
  visibility: NearbyProfileVisibilityRow;
  user: UserRow;
  distanceKm: number;
};

export async function createNearbyStatus(input: NewNearbyStatusRow): Promise<NearbyStatusRow> {
  const [created] = await db.insert(nearbyStatuses).values(input).returning();
  return created;
}

export async function findNearbyProfileVisibility(
  userId: string,
): Promise<NearbyProfileVisibilityRow | undefined> {
  return db.query.nearbyProfileVisibility.findFirst({
    where: eq(nearbyProfileVisibility.userId, userId),
  });
}

export async function upsertNearbyProfileVisibility(
  input: NewNearbyProfileVisibilityRow,
): Promise<NearbyProfileVisibilityRow> {
  const [row] = await db
    .insert(nearbyProfileVisibility)
    .values(input)
    .onConflictDoUpdate({
      target: nearbyProfileVisibility.userId,
      set: {
        status: input.status,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        radiusKm: input.radiusKm ?? null,
        nearbyStatus: input.nearbyStatus ?? null,
        statusKind: input.statusKind ?? null,
        updatedAt: input.updatedAt ?? new Date(),
        expiresAt: input.expiresAt ?? null,
      },
    })
    .returning();

  return row;
}

export async function listNearbyProfileFeedRows(
  viewerUserId: string,
  viewerLatitude: number,
  viewerLongitude: number,
  viewerRadiusKm: number,
  limit: number,
): Promise<NearbyProfileFeedRow[]> {
  const now = new Date();
  const distanceKm = haversineDistanceKm(viewerLatitude, viewerLongitude);
  const viewerBlock = alias(blockedUsers, "nearby_profile_viewer_block");
  const candidateBlock = alias(blockedUsers, "nearby_profile_candidate_block");

  return db
    .select({
      visibility: nearbyProfileVisibility,
      user: users,
      distanceKm,
    })
    .from(nearbyProfileVisibility)
    .innerJoin(users, eq(users.id, nearbyProfileVisibility.userId))
    .leftJoin(
      viewerBlock,
      and(
        eq(viewerBlock.userId, viewerUserId),
        eq(viewerBlock.blockedUserId, nearbyProfileVisibility.userId),
      ),
    )
    .leftJoin(
      candidateBlock,
      and(
        eq(candidateBlock.userId, nearbyProfileVisibility.userId),
        eq(candidateBlock.blockedUserId, viewerUserId),
      ),
    )
    .where(
      and(
        ne(nearbyProfileVisibility.userId, viewerUserId),
        eq(nearbyProfileVisibility.status, "active"),
        gt(nearbyProfileVisibility.expiresAt, now),
        isNull(viewerBlock.blockedUserId),
        isNull(candidateBlock.blockedUserId),
        sql`${distanceKm} <= ${viewerRadiusKm}`,
        sql`${distanceKm} <= ${nearbyProfileVisibility.radiusKm}`,
      ),
    )
    .orderBy(sql`${distanceKm}`, desc(nearbyProfileVisibility.updatedAt))
    .limit(limit);
}

export async function listNearbyFeedRows(
  viewerUserId: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number,
): Promise<NearbyFeedRow[]> {
  const now = new Date();
  const distance = haversineDistanceMeters(lat, lng);

  return db
    .select({
      id: nearbyStatuses.id,
      authorUserId: nearbyStatuses.authorUserId,
      text: nearbyStatuses.text,
      distanceMeters: distance,
      createdAt: nearbyStatuses.createdAt,
      expiresAt: nearbyStatuses.expiresAt,
      author: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(nearbyStatuses)
    .innerJoin(users, eq(users.id, nearbyStatuses.authorUserId))
    .leftJoin(
      blockedUsers,
      and(
        eq(blockedUsers.userId, viewerUserId),
        eq(blockedUsers.blockedUserId, nearbyStatuses.authorUserId),
      ),
    )
    .where(
      and(
        gt(nearbyStatuses.expiresAt, now),
        isNull(blockedUsers.blockedUserId),
        sql`${distance} <= ${radiusMeters}`,
        sql`${distance} <= ${nearbyStatuses.radiusMeters}`,
      ),
    )
    .orderBy(sql`${distance}`, desc(nearbyStatuses.createdAt), desc(nearbyStatuses.id))
    .limit(limit);
}

export async function deleteOwnedNearbyStatus(
  statusId: string,
  authorUserId: string,
): Promise<boolean> {
  const [deleted] = await db
    .delete(nearbyStatuses)
    .where(and(eq(nearbyStatuses.id, statusId), eq(nearbyStatuses.authorUserId, authorUserId)))
    .returning({ id: nearbyStatuses.id });

  return Boolean(deleted);
}

function haversineDistanceMeters(lat: number, lng: number) {
  return sql<number>`(
    6371000 * 2 * asin(least(1, sqrt(
      pow(sin(radians(${nearbyStatuses.lat} - ${lat}) / 2), 2) +
      cos(radians(${lat})) * cos(radians(${nearbyStatuses.lat})) *
      pow(sin(radians(${nearbyStatuses.lng} - ${lng}) / 2), 2)
    )))
  )`;
}

function haversineDistanceKm(lat: number, lng: number) {
  return sql<number>`(
    6371 * 2 * asin(least(1, sqrt(
      pow(sin(radians(${nearbyProfileVisibility.latitude} - ${lat}) / 2), 2) +
      cos(radians(${lat})) * cos(radians(${nearbyProfileVisibility.latitude})) *
      pow(sin(radians(${nearbyProfileVisibility.longitude} - ${lng}) / 2), 2)
    )))
  )`;
}
