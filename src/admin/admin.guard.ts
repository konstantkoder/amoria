import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import { unauthorized } from "../common/errors";
import * as adminService from "./admin.service";
import type { AdminRoleKey } from "./admin.types";

export function requireAdmin(allowedRoles: AdminRoleKey[] = []): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    if (!request.auth?.userId) {
      throw unauthorized();
    }

    const admin = await adminService.getAdminContextByUserId(request.auth.userId);
    adminService.assertAdminHasAnyRole(admin, allowedRoles);
    request.admin = admin;
  };
}
