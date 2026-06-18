import { AppError } from "../common/errors";
import * as nearbyRoomsRepo from "../nearby/nearby-rooms.repo";
import {
  toAdminNearbyRoomDto,
  toAdminNearbyRoomTypeDto,
} from "../nearby/nearby-rooms.service";
import type {
  AdminNearbyRoomDetailResponse,
  AdminNearbyRoomsResponse,
  AdminNearbyRoomTypesResponse,
} from "../nearby/nearby-rooms.types";
import * as auditService from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";

type AdminNearbyRoomsDeps = {
  repo: Pick<
    typeof nearbyRoomsRepo,
    "findNearbyRoomForAdmin" | "listNearbyRoomsForAdmin" | "listNearbyRoomTypesForAdmin"
  >;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminNearbyRoomsDeps = {
  repo: nearbyRoomsRepo,
  audit: auditService,
};

let deps: AdminNearbyRoomsDeps = defaultDeps;

export function __setAdminNearbyRoomsServiceDepsForTests(
  overrides: Partial<AdminNearbyRoomsDeps>,
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

export async function listNearbyRoomTypesForAdmin(
  admin: AdminContext,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyRoomTypesResponse> {
  const rows = await deps.repo.listNearbyRoomTypesForAdmin();
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyRoomTypes.list",
    targetType: "nearby_room_types",
    metadata: {
      resultCount: rows.length,
    },
    ...requestContext,
  });

  return {
    items: rows.map(toAdminNearbyRoomTypeDto),
    nextCursor: null,
  };
}

export async function listNearbyRoomsForAdmin(
  admin: AdminContext,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyRoomsResponse> {
  const rows = await deps.repo.listNearbyRoomsForAdmin();
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyRooms.list",
    targetType: "nearby_rooms",
    metadata: {
      resultCount: rows.length,
    },
    ...requestContext,
  });

  return {
    items: rows.map(toAdminNearbyRoomDto),
    nextCursor: null,
  };
}

export async function getNearbyRoomForAdmin(
  admin: AdminContext,
  roomId: string,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyRoomDetailResponse> {
  const row = await deps.repo.findNearbyRoomForAdmin(roomId);
  if (!row) {
    throw new AppError("not_found", "Nearby room not found", 404);
  }

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyRooms.detail.read",
    targetType: "nearby_room",
    targetId: roomId,
    metadata: {
      status: row.status,
      typeKey: row.typeKey,
    },
    ...requestContext,
  });

  return {
    room: toAdminNearbyRoomDto(row),
  };
}
