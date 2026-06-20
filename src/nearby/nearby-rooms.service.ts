import { AppError, forbidden } from "../common/errors";
import * as nearbyRoomsRepo from "./nearby-rooms.repo";
import type {
  NearbyRoomActionResponse,
  AdminNearbyRoomDto,
  AdminNearbyRoomTypeDto,
  NearbyRoomCardDto,
  NearbyRoomsResponse,
} from "./nearby-rooms.types";

type NearbyRoomsServiceDeps = {
  now: () => Date;
  repo: Pick<
    typeof nearbyRoomsRepo,
    | "createNearbyRoomMembership"
    | "findNearbyRoomForUser"
    | "listPublicNearbyRoomsForUser"
    | "markNearbyRoomMembershipLeft"
    | "reactivateNearbyRoomMembership"
  >;
};

const defaultDeps: NearbyRoomsServiceDeps = {
  now: () => new Date(),
  repo: nearbyRoomsRepo,
};

const blockedMembershipStatuses = new Set(["removed", "banned"]);

let deps: NearbyRoomsServiceDeps = defaultDeps;

export function __setNearbyRoomsServiceDepsForTests(
  overrides: Partial<NearbyRoomsServiceDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function listNearbyRooms(userId: string): Promise<NearbyRoomsResponse> {
  const rows = await deps.repo.listPublicNearbyRoomsForUser(userId);
  return {
    items: rows.map(toNearbyRoomCardDto),
    nextCursor: null,
  };
}

export async function joinNearbyRoom(
  userId: string,
  roomId: string,
): Promise<NearbyRoomActionResponse> {
  const row = await deps.repo.findNearbyRoomForUser(roomId, userId);
  requireRoom(row);
  requireJoinableRoom(row);

  if (blockedMembershipStatuses.has(row.viewerMembershipStatus ?? "")) {
    throw forbidden("Nearby room membership is restricted");
  }

  if (row.viewerMembershipStatus === "left") {
    await deps.repo.reactivateNearbyRoomMembership(roomId, userId, deps.now());
  } else if (!row.viewerMembershipStatus) {
    await deps.repo.createNearbyRoomMembership(roomId, userId, deps.now());
  }

  return {
    room: toNearbyRoomCardDto((await deps.repo.findNearbyRoomForUser(roomId, userId)) ?? row),
  };
}

export async function leaveNearbyRoom(
  userId: string,
  roomId: string,
): Promise<NearbyRoomActionResponse> {
  const row = await deps.repo.findNearbyRoomForUser(roomId, userId);
  requireRoom(row);

  if (row.viewerMembershipStatus === "active") {
    await deps.repo.markNearbyRoomMembershipLeft(roomId, userId, deps.now());
  }

  return {
    room: toNearbyRoomCardDto((await deps.repo.findNearbyRoomForUser(roomId, userId)) ?? row),
  };
}

function toNearbyRoomCardDto(row: nearbyRoomsRepo.NearbyRoomListRow): NearbyRoomCardDto {
  const canOpen = row.viewerMembershipStatus === "active" && hasSafeRoomThread(row);

  return {
    id: row.id,
    typeKey: row.typeKey,
    title: row.title,
    geoBucket: row.geoBucket,
    memberCount: Math.max(0, Number(row.memberCount ?? 0)),
    status: row.status,
    canJoin: canJoinRoom(row),
    canOpen,
    threadId: canOpen ? row.threadId : null,
  };
}

function requireRoom(
  row: nearbyRoomsRepo.NearbyRoomListRow | undefined,
): asserts row is nearbyRoomsRepo.NearbyRoomListRow {
  if (!row) {
    throw new AppError("not_found", "Nearby room not found", 404);
  }
}

function requireJoinableRoom(row: nearbyRoomsRepo.NearbyRoomListRow): void {
  if (row.status !== "active") {
    throw forbidden("Nearby room is not active");
  }

  if (row.roomTypeStatus !== "active" || !row.adminApproved) {
    throw forbidden("Nearby room type is not available");
  }
}

function canJoinRoom(row: nearbyRoomsRepo.NearbyRoomListRow): boolean {
  if (
    row.status !== "active" ||
    row.roomTypeStatus !== "active" ||
    !row.adminApproved ||
    blockedMembershipStatuses.has(row.viewerMembershipStatus ?? "")
  ) {
    return false;
  }

  return !row.viewerMembershipStatus || row.viewerMembershipStatus === "left";
}

function hasSafeRoomThread(row: nearbyRoomsRepo.NearbyRoomListRow): boolean {
  void row;
  // Room threads are not exposed until chat DTOs and message sends support non-DM peers.
  return false;
}

export function toAdminNearbyRoomTypeDto(
  row: nearbyRoomsRepo.AdminNearbyRoomRow["roomType"],
): AdminNearbyRoomTypeDto {
  return {
    key: row.key,
    title: row.title,
    status: row.status,
    adminApproved: row.adminApproved,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAdminNearbyRoomDto(
  row: nearbyRoomsRepo.AdminNearbyRoomRow,
): AdminNearbyRoomDto {
  return {
    id: row.id,
    typeKey: row.typeKey,
    roomType: toAdminNearbyRoomTypeDto(row.roomType),
    status: row.status,
    geoBucket: row.geoBucket,
    memberCount: Math.max(0, Number(row.memberCount ?? 0)),
    threadId: row.threadId,
    createdByAdminUserId: row.createdByAdminUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
