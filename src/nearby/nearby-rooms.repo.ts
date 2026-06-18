import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  type NearbyRoomTypeRow,
  nearbyRoomMemberships,
  nearbyRoomTypes,
  nearbyRooms,
} from "../db/schema";

export type NearbyRoomListRow = {
  id: string;
  typeKey: string;
  title: string;
  roomTypeStatus: string;
  adminApproved: boolean;
  sortOrder: number;
  status: string;
  geoBucket: string;
  threadId: string | null;
  memberCount: number;
  viewerMembershipStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminNearbyRoomRow = {
  id: string;
  typeKey: string;
  roomType: NearbyRoomTypeRow;
  status: string;
  geoBucket: string;
  threadId: string | null;
  createdByAdminUserId: string | null;
  memberCount: number;
  createdAt: Date;
  updatedAt: Date;
};

const activeMemberCount = sql<number>`(
  select count(*)::int
  from ${nearbyRoomMemberships}
  where ${nearbyRoomMemberships.roomId} = ${nearbyRooms.id}
    and ${nearbyRoomMemberships.status} = 'active'
)`;

function viewerMembershipStatus(viewerUserId: string) {
  return sql<string | null>`(
    select ${nearbyRoomMemberships.status}
    from ${nearbyRoomMemberships}
    where ${nearbyRoomMemberships.roomId} = ${nearbyRooms.id}
      and ${nearbyRoomMemberships.userId} = ${viewerUserId}
    limit 1
  )`;
}

export async function listPublicNearbyRoomsForUser(
  viewerUserId: string,
): Promise<NearbyRoomListRow[]> {
  return db
    .select({
      id: nearbyRooms.id,
      typeKey: nearbyRooms.typeKey,
      title: nearbyRoomTypes.title,
      roomTypeStatus: nearbyRoomTypes.status,
      adminApproved: nearbyRoomTypes.adminApproved,
      sortOrder: nearbyRoomTypes.sortOrder,
      status: nearbyRooms.status,
      geoBucket: nearbyRooms.geoBucket,
      threadId: nearbyRooms.threadId,
      memberCount: activeMemberCount,
      viewerMembershipStatus: viewerMembershipStatus(viewerUserId),
      createdAt: nearbyRooms.createdAt,
      updatedAt: nearbyRooms.updatedAt,
    })
    .from(nearbyRooms)
    .innerJoin(nearbyRoomTypes, eq(nearbyRoomTypes.key, nearbyRooms.typeKey))
    .where(
      and(
        eq(nearbyRooms.status, "active"),
        eq(nearbyRoomTypes.status, "active"),
        eq(nearbyRoomTypes.adminApproved, true),
      ),
    )
    .orderBy(
      asc(nearbyRoomTypes.sortOrder),
      asc(nearbyRoomTypes.key),
      asc(nearbyRooms.createdAt),
    );
}

export async function listNearbyRoomTypesForAdmin(): Promise<NearbyRoomTypeRow[]> {
  return db
    .select()
    .from(nearbyRoomTypes)
    .orderBy(asc(nearbyRoomTypes.sortOrder), asc(nearbyRoomTypes.key));
}

export async function listNearbyRoomsForAdmin(): Promise<AdminNearbyRoomRow[]> {
  return db
    .select({
      id: nearbyRooms.id,
      typeKey: nearbyRooms.typeKey,
      roomType: nearbyRoomTypes,
      status: nearbyRooms.status,
      geoBucket: nearbyRooms.geoBucket,
      threadId: nearbyRooms.threadId,
      createdByAdminUserId: nearbyRooms.createdByAdminUserId,
      memberCount: activeMemberCount,
      createdAt: nearbyRooms.createdAt,
      updatedAt: nearbyRooms.updatedAt,
    })
    .from(nearbyRooms)
    .innerJoin(nearbyRoomTypes, eq(nearbyRoomTypes.key, nearbyRooms.typeKey))
    .orderBy(
      asc(nearbyRoomTypes.sortOrder),
      asc(nearbyRoomTypes.key),
      desc(nearbyRooms.updatedAt),
    );
}

export async function findNearbyRoomForAdmin(
  roomId: string,
): Promise<AdminNearbyRoomRow | undefined> {
  const [row] = await db
    .select({
      id: nearbyRooms.id,
      typeKey: nearbyRooms.typeKey,
      roomType: nearbyRoomTypes,
      status: nearbyRooms.status,
      geoBucket: nearbyRooms.geoBucket,
      threadId: nearbyRooms.threadId,
      createdByAdminUserId: nearbyRooms.createdByAdminUserId,
      memberCount: activeMemberCount,
      createdAt: nearbyRooms.createdAt,
      updatedAt: nearbyRooms.updatedAt,
    })
    .from(nearbyRooms)
    .innerJoin(nearbyRoomTypes, eq(nearbyRoomTypes.key, nearbyRooms.typeKey))
    .where(eq(nearbyRooms.id, roomId))
    .limit(1);

  return row;
}
