import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  type NearbyRoomTypeRow,
  nearbyRoomMemberships,
  nearbyRoomTypes,
  nearbyRooms,
  roomModerationActions,
  threads,
} from "../db/schema";
import {
  NEARBY_ROOM_THREAD_SOURCE_TYPE,
  NEARBY_ROOM_THREAD_TYPE,
} from "./nearby-room-chat.types";

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

export type CreateNearbyRoomInput = {
  typeKey: string;
  geoBucket: string;
  createdByAdminUserId: string;
  createdAt: Date;
};

const activeMemberCount = sql<number>`(
  select count(*)::int
  from ${nearbyRoomMemberships}
  where ${nearbyRoomMemberships.roomId} = ${nearbyRooms.id}
    and ${nearbyRoomMemberships.status} = 'active'
)`;

const safeRoomThreadId = sql<string | null>`(
  select ${threads.id}
  from ${threads}
  where ${threads.id} = ${nearbyRooms.threadId}
    and ${threads.type} = ${NEARBY_ROOM_THREAD_TYPE}
    and ${threads.sourceType} = ${NEARBY_ROOM_THREAD_SOURCE_TYPE}
    and ${threads.sourceId} = ${nearbyRooms.id}
  limit 1
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
      threadId: safeRoomThreadId,
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

export async function findNearbyRoomForUser(
  roomId: string,
  viewerUserId: string,
): Promise<NearbyRoomListRow | undefined> {
  const [row] = await db
    .select({
      id: nearbyRooms.id,
      typeKey: nearbyRooms.typeKey,
      title: nearbyRoomTypes.title,
      roomTypeStatus: nearbyRoomTypes.status,
      adminApproved: nearbyRoomTypes.adminApproved,
      sortOrder: nearbyRoomTypes.sortOrder,
      status: nearbyRooms.status,
      geoBucket: nearbyRooms.geoBucket,
      threadId: safeRoomThreadId,
      memberCount: activeMemberCount,
      viewerMembershipStatus: viewerMembershipStatus(viewerUserId),
      createdAt: nearbyRooms.createdAt,
      updatedAt: nearbyRooms.updatedAt,
    })
    .from(nearbyRooms)
    .innerJoin(nearbyRoomTypes, eq(nearbyRoomTypes.key, nearbyRooms.typeKey))
    .where(eq(nearbyRooms.id, roomId))
    .limit(1);

  return row;
}

export async function createNearbyRoomMembership(
  roomId: string,
  userId: string,
  joinedAt: Date,
): Promise<void> {
  await db
    .insert(nearbyRoomMemberships)
    .values({
      roomId,
      userId,
      status: "active",
      role: "member",
      joinedAt,
      leftAt: null,
    })
    .onConflictDoNothing({
      target: [nearbyRoomMemberships.roomId, nearbyRoomMemberships.userId],
    });
}

export async function reactivateNearbyRoomMembership(
  roomId: string,
  userId: string,
  joinedAt: Date,
): Promise<void> {
  await db
    .update(nearbyRoomMemberships)
    .set({
      status: "active",
      joinedAt,
      leftAt: null,
    })
    .where(
      and(
        eq(nearbyRoomMemberships.roomId, roomId),
        eq(nearbyRoomMemberships.userId, userId),
        eq(nearbyRoomMemberships.status, "left"),
      ),
    );
}

export async function markNearbyRoomMembershipLeft(
  roomId: string,
  userId: string,
  leftAt: Date,
): Promise<void> {
  await db
    .update(nearbyRoomMemberships)
    .set({
      status: "left",
      leftAt,
    })
    .where(
      and(
        eq(nearbyRoomMemberships.roomId, roomId),
        eq(nearbyRoomMemberships.userId, userId),
        eq(nearbyRoomMemberships.status, "active"),
      ),
    );
}

export async function listNearbyRoomTypesForAdmin(): Promise<NearbyRoomTypeRow[]> {
  return db
    .select()
    .from(nearbyRoomTypes)
    .orderBy(asc(nearbyRoomTypes.sortOrder), asc(nearbyRoomTypes.key));
}

export async function findNearbyRoomTypeByKey(
  typeKey: string,
): Promise<NearbyRoomTypeRow | undefined> {
  const [row] = await db
    .select()
    .from(nearbyRoomTypes)
    .where(eq(nearbyRoomTypes.key, typeKey))
    .limit(1);

  return row;
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

export async function createNearbyRoomForAdmin(
  input: CreateNearbyRoomInput,
): Promise<AdminNearbyRoomRow> {
  const [created] = await db
    .insert(nearbyRooms)
    .values({
      typeKey: input.typeKey,
      geoBucket: input.geoBucket,
      createdByAdminUserId: input.createdByAdminUserId,
      status: "active",
      threadId: null,
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
    })
    .returning({ id: nearbyRooms.id });

  if (!created) {
    throw new Error("Failed to create nearby room");
  }

  const row = await findNearbyRoomForAdmin(created.id);
  if (!row) {
    throw new Error("Created nearby room was not found");
  }

  return row;
}

export async function updateNearbyRoomStatusForAdmin(
  roomId: string,
  status: "active" | "closed" | "disabled",
  updatedAt: Date,
): Promise<AdminNearbyRoomRow | undefined> {
  const [updated] = await db
    .update(nearbyRooms)
    .set({
      status,
      updatedAt,
    })
    .where(eq(nearbyRooms.id, roomId))
    .returning({ id: nearbyRooms.id });

  if (!updated) {
    return undefined;
  }

  return findNearbyRoomForAdmin(updated.id);
}

export async function createRoomModerationActionForAdmin(input: {
  roomId: string;
  adminUserId: string;
  action: string;
  createdAt: Date;
}): Promise<void> {
  await db.insert(roomModerationActions).values({
    roomId: input.roomId,
    adminUserId: input.adminUserId,
    action: input.action,
    createdAt: input.createdAt,
  });
}
