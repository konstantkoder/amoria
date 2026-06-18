import * as nearbyRoomsRepo from "./nearby-rooms.repo";
import type {
  AdminNearbyRoomDto,
  AdminNearbyRoomTypeDto,
  NearbyRoomCardDto,
  NearbyRoomsResponse,
} from "./nearby-rooms.types";

type NearbyRoomsServiceDeps = {
  repo: Pick<typeof nearbyRoomsRepo, "listPublicNearbyRoomsForUser">;
};

const defaultDeps: NearbyRoomsServiceDeps = {
  repo: nearbyRoomsRepo,
};

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

function toNearbyRoomCardDto(row: nearbyRoomsRepo.NearbyRoomListRow): NearbyRoomCardDto {
  return {
    id: row.id,
    typeKey: row.typeKey,
    title: row.title,
    geoBucket: row.geoBucket,
    memberCount: Math.max(0, Number(row.memberCount ?? 0)),
    status: row.status,
    canJoin: false,
    canOpen: false,
    threadId: null,
  };
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
