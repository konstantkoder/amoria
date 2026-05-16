import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { requireAdmin } from "./admin.guard";
import {
  adminAuditLogRouteSchema,
  adminHealthRouteSchema,
  adminMeRouteSchema,
  adminUsersSearchRouteSchema,
  parseAdminAuditLogLimit,
  parseAdminUserSearchQuery,
} from "./admin.schemas";
import * as adminService from "./admin.service";
import { firstHeaderValue, type AdminContext, type AdminRequestContext } from "./admin.types";

function currentAdmin(request: { admin?: AdminContext }): AdminContext {
  if (!request.admin) {
    throw unauthorized();
  }

  return request.admin;
}

function adminRequestContext(request: FastifyRequest): AdminRequestContext {
  return {
    requestId: request.id,
    ipAddress: request.ip,
    userAgent: firstHeaderValue(request.headers["user-agent"]),
  };
}

export async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/health",
    {
      preHandler: [authMiddleware, requireAdmin()],
      schema: withErrorResponses(adminHealthRouteSchema),
    },
    async (request) => adminService.getAdminHealth(currentAdmin(request)),
  );

  fastify.get(
    "/me",
    {
      preHandler: [authMiddleware, requireAdmin()],
      schema: withErrorResponses(adminMeRouteSchema),
    },
    async (request) => adminService.getAdminMe(currentAdmin(request)),
  );

  fastify.get(
    "/users",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "support", "moderator"])],
      schema: withErrorResponses(adminUsersSearchRouteSchema),
    },
    async (request) =>
      adminService.searchAdminUsers(
        currentAdmin(request),
        parseAdminUserSearchQuery(request.query),
        adminRequestContext(request),
      ),
  );

  fastify.get(
    "/audit-log",
    {
      preHandler: [authMiddleware, requireAdmin(["owner"])],
      schema: withErrorResponses(adminAuditLogRouteSchema),
    },
    async (request) =>
      adminService.listAdminAuditLog(
        currentAdmin(request),
        parseAdminAuditLogLimit(request.query),
        adminRequestContext(request),
      ),
  );
}
