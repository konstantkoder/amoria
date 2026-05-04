import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  type NearbyStatusRow,
  type NewNearbyStatusRow,
  blockedUsers,
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

export async function createNearbyStatus(input: NewNearbyStatusRow): Promise<NearbyStatusRow> {
  const [created] = await db.insert(nearbyStatuses).values(input).returning();
  return created;
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
