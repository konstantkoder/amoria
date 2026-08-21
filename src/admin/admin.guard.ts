import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { unauthorized } from "../common/errors";
import * as adminService from "./admin.service";
import type { AdminRoleKey } from "./admin.types";

export function requireAdmin(allowedRoles: AdminRoleKey[] = []): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.adminAuth?.userId) {
      throw unauthorized();
    }

    const admin = await adminService.getAdminContextByUserId(request.adminAuth.userId);
    const security = admin.security;
    if (
      !security ||
      request.adminAuth.adminUserId !== admin.adminUser.id ||
      request.adminAuth.adminSessionVersion !== security.adminSessionVersion ||
      request.adminAuth.userAuthVersion !== security.userAuthVersion ||
      !security.mfaEnabled
    ) throw unauthorized("Admin access has been revoked");
    adminService.assertAdminHasAnyRole(admin, allowedRoles);
    request.admin = admin;
  };
}
