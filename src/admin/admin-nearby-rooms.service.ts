import { AppError, forbidden } from "../common/errors";
import * as nearbyRoomsRepo from "../nearby/nearby-rooms.repo";
import {
  toAdminNearbyRoomDto,
  toAdminNearbyRoomTypeDto,
} from "../nearby/nearby-rooms.service";
import type {
  AdminCreateNearbyRoomBody,
  AdminNearbyRoomDetailResponse,
  AdminNearbyRoomActionBody,
  AdminNearbyRoomsResponse,
  AdminNearbyRoomTypesResponse,
} from "../nearby/nearby-rooms.types";
import * as auditService from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";

type AdminNearbyRoomsDeps = {
  now: () => Date;
  repo: Pick<
    typeof nearbyRoomsRepo,
    | "createNearbyRoomForAdmin"
    | "createRoomModerationActionForAdmin"
    | "findNearbyRoomForAdmin"
    | "findNearbyRoomTypeByKey"
    | "listNearbyRoomsForAdmin"
    | "listNearbyRoomTypesForAdmin"
    | "updateNearbyRoomStatusForAdmin"
  >;
  audit: Pick<typeof auditService, "writeAuditLog">;
};

const defaultDeps: AdminNearbyRoomsDeps = {
  now: () => new Date(),
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

export async function createNearbyRoomForAdmin(
  admin: AdminContext,
  input: AdminCreateNearbyRoomBody,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyRoomDetailResponse> {
  const roomType = await deps.repo.findNearbyRoomTypeByKey(input.typeKey);
  if (!roomType) {
    throw new AppError("not_found", "Nearby room type not found", 404);
  }

  if (roomType.status !== "active" || !roomType.adminApproved) {
    throw forbidden("Nearby room type is not available");
  }

  const row = await deps.repo.createNearbyRoomForAdmin({
    typeKey: input.typeKey,
    geoBucket: input.geoBucket,
    createdByAdminUserId: admin.adminUser.id,
    createdAt: deps.now(),
  });

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyRooms.create",
    targetType: "nearby_room",
    targetId: row.id,
    metadata: {
      typeKey: row.typeKey,
      geoBucket: row.geoBucket,
      status: row.status,
    },
    ...requestContext,
  });

  return {
    room: toAdminNearbyRoomDto(row),
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

export async function actionNearbyRoomForAdmin(
  admin: AdminContext,
  roomId: string,
  input: AdminNearbyRoomActionBody,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyRoomDetailResponse> {
  const current = await deps.repo.findNearbyRoomForAdmin(roomId);
  if (!current) {
    throw new AppError("not_found", "Nearby room not found", 404);
  }

  const nextStatus = statusForAction(input.action);
  const now = deps.now();
  const updated = await deps.repo.updateNearbyRoomStatusForAdmin(roomId, nextStatus, now);
  if (!updated) {
    throw new AppError("not_found", "Nearby room not found", 404);
  }

  await deps.repo.createRoomModerationActionForAdmin({
    roomId,
    adminUserId: admin.adminUser.id,
    action: input.action,
    createdAt: now,
  });

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: `admin.nearbyRooms.${input.action}`,
    targetType: "nearby_room",
    targetId: roomId,
    metadata: {
      typeKey: updated.typeKey,
      previousStatus: current.status,
      nextStatus: updated.status,
    },
    ...requestContext,
  });

  return {
    room: toAdminNearbyRoomDto(updated),
  };
}

function statusForAction(action: AdminNearbyRoomActionBody["action"]): "active" | "closed" | "disabled" {
  if (action === "close") {
    return "closed";
  }

  if (action === "disable") {
    return "disabled";
  }

  return "active";
}
