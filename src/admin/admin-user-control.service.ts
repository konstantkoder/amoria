import { AppError } from "../common/errors";
import { wsHub } from "../realtime/ws.hub";
import * as auditService from "./admin-audit.service";
import * as adminRepo from "./admin.repo";
import * as repo from "./admin-user-control.repo";
import type {
  AdminContext,
  AdminCreateAdminUserBody,
  AdminRequestContext,
  AdminUpdateAdminUserBody,
  AdminUserStatusActionBody,
  AdminUserStatusActionResponse,
  AdminUsersListResponse,
} from "./admin.types";

export async function getUserDetailForAdmin(
  admin: AdminContext,
  userId: string,
  context: AdminRequestContext,
) {
  const user = await repo.findUserDetail(userId);
  if (!user) throw new AppError("not_found", "User not found", 404);
  await auditService.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.users.detail.read",
    targetType: "user",
    targetId: userId,
    metadata: { accountStatus: user.accountStatus },
    ...context,
  });
  return { user };
}

export async function actionUserStatusForAdmin(
  admin: AdminContext,
  userId: string,
  input: AdminUserStatusActionBody,
  context: AdminRequestContext,
): Promise<AdminUserStatusActionResponse> {
  try {
    const user = await repo.setUserAccountStatus({
      userId,
      status: input.action === "suspend" ? "suspended" : "active",
      adminUserId: admin.adminUser.id,
      reason: input.reason,
    });
    if (!user) throw new AppError("not_found", "User not found", 404);
    if (input.action === "suspend") wsHub.disconnectUser(userId, "Account suspended");
    await auditService.writeAuditLog({
      adminUserId: admin.adminUser.id,
      action: `admin.users.${input.action}`,
      targetType: "user",
      targetId: userId,
      reason: input.reason,
      metadata: { nextStatus: user.accountStatus, sessionsRevoked: input.action === "suspend" },
      ...context,
    });
    return { ok: true, user, sessionsRevoked: input.action === "suspend" };
  } catch (error) {
    if ((error as { code?: string }).code === "active_admin_user") {
      throw new AppError("active_admin_user", "Disable this user's admin account before suspension", 409);
    }
    throw error;
  }
}

export async function createAdminUserForOwner(
  admin: AdminContext,
  input: AdminCreateAdminUserBody,
  context: AdminRequestContext,
): Promise<AdminUsersListResponse> {
  const adminUserId = await repo.createAdminUser(input);
  if (!adminUserId) throw new AppError("not_found", "User not found", 404);
  await auditService.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.adminUsers.create",
    targetType: "admin_user",
    targetId: adminUserId,
    reason: input.reason,
    metadata: { userId: input.userId, roles: input.roles },
    ...context,
  });
  return { items: await adminRepo.listAdminUsers(), nextCursor: null };
}

export async function updateAdminUserForOwner(
  admin: AdminContext,
  adminUserId: string,
  input: AdminUpdateAdminUserBody,
  context: AdminRequestContext,
): Promise<AdminUsersListResponse> {
  try {
    const updated = await repo.updateAdminUser(adminUserId, input);
    if (!updated) throw new AppError("not_found", "Admin user not found", 404);
  } catch (error) {
    if ((error as { code?: string }).code === "last_owner") {
      throw new AppError("last_owner", "The final active owner cannot be disabled or lose the owner role", 409);
    }
    throw error;
  }
  await auditService.writeAuditLog({
    adminUserId: admin.adminUser.id,
    action: "admin.adminUsers.update",
    targetType: "admin_user",
    targetId: adminUserId,
    reason: input.reason,
    metadata: { status: input.status ?? null, roles: input.roles ?? null },
    ...context,
  });
  return { items: await adminRepo.listAdminUsers(), nextCursor: null };
}
