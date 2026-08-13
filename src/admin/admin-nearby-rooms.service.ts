import { AppError, forbidden, validationError } from "../common/errors";
import * as nearbyRoomsRepo from "../nearby/nearby-rooms.repo";
import {
  toAdminNearbyRoomDto,
  toAdminNearbyRoomTypeDto,
} from "../nearby/nearby-rooms.service";
import type {
  AdminCreateNearbyRoomBody,
  AdminCreateNearbyRoomTypeBody,
  AdminNearbyRoomDemandSnapshotDto,
  AdminNearbyRoomDetailResponse,
  AdminNearbyRoomActionBody,
  AdminNearbyRoomsQuery,
  AdminNearbyRoomsResponse,
  AdminNearbyRoomTypesResponse,
  AdminNearbyRoomTypeDetailResponse,
} from "../nearby/nearby-rooms.types";
import * as auditService from "./admin-audit.service";
import type { AdminContext, AdminRequestContext } from "./admin.types";

type AdminNearbyRoomsDeps = {
  now: () => Date;
  repo: Pick<
    typeof nearbyRoomsRepo,
    | "createNearbyRoomForAdmin"
    | "createNearbyRoomTypeForAdmin"
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

export async function createNearbyRoomTypeForAdmin(
  admin: AdminContext,
  input: AdminCreateNearbyRoomTypeBody,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyRoomTypeDetailResponse> {
  const existing = await deps.repo.findNearbyRoomTypeByKey(input.key);
  if (existing) {
    throw validationError("Nearby room type key already exists", {
      key: "already exists",
    });
  }

  const roomTypes = await deps.repo.listNearbyRoomTypesForAdmin();
  const createdAt = deps.now();
  const row = await deps.repo.createNearbyRoomTypeForAdmin({
    key: input.key,
    title: input.title,
    sortOrder: Math.max(0, ...roomTypes.map((roomType) => roomType.sortOrder)) + 10,
    createdAt,
  });

  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyRoomTypes.create",
    targetType: "nearby_room_type",
    targetId: row.key,
    metadata: {
      title: row.title,
      status: row.status,
      adminApproved: row.adminApproved,
      sortOrder: row.sortOrder,
    },
    ...requestContext,
  });

  return { roomType: toAdminNearbyRoomTypeDto(row) };
}

export async function listNearbyRoomsForAdmin(
  admin: AdminContext,
  query: AdminNearbyRoomsQuery,
  requestContext: AdminRequestContext,
): Promise<AdminNearbyRoomsResponse> {
  const rows = await deps.repo.listNearbyRoomsForAdmin({
    includeArchived: query.includeArchived,
  });
  await deps.audit.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.nearbyRooms.list",
    targetType: "nearby_rooms",
    metadata: {
      includeArchived: query.includeArchived,
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

  const row = await deps.repo.createNearbyRoomForAdmin(
    buildCreateNearbyRoomInputForAdmin({
      ...input,
      typeKey: input.typeKey,
      geoBucket: input.geoBucket,
      createdByAdminUserId: admin.adminUser.id,
      createdAt: deps.now(),
      createdFromDemandSnapshot: null,
    }),
  );

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

export function buildCreateNearbyRoomInputForAdmin(
  input: AdminCreateNearbyRoomBody & {
    createdByAdminUserId: string;
    createdAt: Date;
    createdFromDemandSnapshot?: AdminNearbyRoomDemandSnapshotDto | null;
  },
): nearbyRoomsRepo.CreateNearbyRoomInput {
  const startsAt = parseOptionalAdminDateTime("startsAt", input.startsAt);
  const endsAt = parseOptionalAdminDateTime("endsAt", input.endsAt);
  const expiresAt = parseOptionalAdminDateTime("expiresAt", input.expiresAt);

  if (endsAt && (!startsAt || endsAt <= startsAt)) {
    throw validationError("Request validation failed", {
      endsAt: "must be after startsAt",
    });
  }

  const minExpiresAt = startsAt ?? input.createdAt;
  if (expiresAt && expiresAt <= minExpiresAt) {
    throw validationError("Request validation failed", {
      expiresAt: startsAt ? "must be after startsAt" : "must be in the future",
    });
  }

  return {
    typeKey: input.typeKey,
    geoBucket: input.geoBucket,
    createdByAdminUserId: input.createdByAdminUserId,
    createdAt: input.createdAt,
    title: normalizeOptionalText(input.title),
    description: normalizeOptionalText(input.description),
    locationLabel: normalizeOptionalText(input.locationLabel),
    startsAt,
    endsAt,
    expiresAt,
    createdFromDemandSnapshot: input.createdFromDemandSnapshot ?? null,
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

  if (current.status === "deleted") {
    throw validationError("Deleted nearby room cannot be modified");
  }
  if (input.action === "delete" && current.status !== "archived") {
    throw validationError("Nearby room can only be deleted from archived status");
  }

  const nextStatus = statusForAction(input.action);
  const now = deps.now();
  const updated = await deps.repo.updateNearbyRoomStatusForAdmin(
    roomId,
    nextStatus,
    now,
    current.status,
  );
  if (!updated) {
    throw new AppError(
      "nearby_room_state_changed",
      "Nearby room state changed; reload before applying another action",
      409,
    );
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
    reason: input.reason,
    metadata: {
      typeKey: updated.typeKey,
      previousStatus: current.status,
      nextStatus: updated.status,
      ...(input.action === "delete"
        ? { softDelete: true, deletedFromArchive: true }
        : {}),
    },
    ...requestContext,
  });

  return {
    room: toAdminNearbyRoomDto(updated),
  };
}

function statusForAction(
  action: AdminNearbyRoomActionBody["action"],
): "active" | "closed" | "disabled" | "archived" | "deleted" {
  if (action === "close") {
    return "closed";
  }

  if (action === "disable") {
    return "disabled";
  }

  if (action === "archive") {
    return "archived";
  }

  if (action === "delete") {
    return "deleted";
  }

  return "active";
}

function parseOptionalAdminDateTime(field: string, value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw validationError("Request validation failed", {
      [field]: "invalid date-time",
    });
  }

  return parsed;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
