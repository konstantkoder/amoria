import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { requireAdmin } from "./admin.guard";
import {
  adminClientErrorsRouteSchema,
  parseAdminClientErrorsQuery,
} from "../client-errors/client-errors.schemas";
import * as clientErrorsService from "../client-errors/client-errors.service";
import {
  adminMediaDecisionRouteSchema,
  adminMediaDetailRouteSchema,
  adminMediaListRouteSchema,
  parseAdminMediaDecisionBody,
  parseAdminMediaDetailReason,
  parseAdminMediaQuery,
} from "./admin-media.schemas";
import * as adminMediaService from "./admin-media.service";
import { adminOpsHealthRouteSchema } from "./admin-ops.schemas";
import * as adminOpsService from "./admin-ops.service";
import {
  adminReportActionRouteSchema,
  adminReportDetailRouteSchema,
  adminReportsListRouteSchema,
  parseAdminReportActionBody,
  parseAdminReportsQuery,
} from "./admin-reports.schemas";
import * as adminReportsService from "./admin-reports.service";
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
    "/client-errors",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "support", "ops"])],
      schema: withErrorResponses(adminClientErrorsRouteSchema),
    },
    async (request) =>
      clientErrorsService.listClientErrorReportsForAdmin(
        currentAdmin(request),
        parseAdminClientErrorsQuery(request.query),
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

  fastify.get(
    "/ops/health",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "support", "ops"])],
      schema: withErrorResponses(adminOpsHealthRouteSchema),
    },
    async (request) =>
      adminOpsService.getOpsHealth(currentAdmin(request), adminRequestContext(request)),
  );

  fastify.get(
    "/reports",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support"])],
      schema: withErrorResponses(adminReportsListRouteSchema),
    },
    async (request) =>
      adminReportsService.listReportsForAdmin(
        currentAdmin(request),
        parseAdminReportsQuery(request.query),
        adminRequestContext(request),
      ),
  );

  fastify.get<{ Params: { id: string } }>(
    "/reports/:id",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support"])],
      schema: withErrorResponses(adminReportDetailRouteSchema),
    },
    async (request) =>
      adminReportsService.getReportForAdmin(
        currentAdmin(request),
        request.params.id,
        adminRequestContext(request),
      ),
  );

  fastify.post<{ Params: { id: string } }>(
    "/reports/:id/actions",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support"])],
      schema: withErrorResponses(adminReportActionRouteSchema),
    },
    async (request) =>
      adminReportsService.createReportActionForAdmin(
        currentAdmin(request),
        request.params.id,
        parseAdminReportActionBody(request.body),
        adminRequestContext(request),
      ),
  );

  fastify.get(
    "/media",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support"])],
      schema: withErrorResponses(adminMediaListRouteSchema),
    },
    async (request) =>
      adminMediaService.listMediaForAdmin(
        currentAdmin(request),
        parseAdminMediaQuery(request.query),
        adminRequestContext(request),
      ),
  );

  fastify.get<{ Params: { mediaId: string } }>(
    "/media/:mediaId",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support"])],
      schema: withErrorResponses(adminMediaDetailRouteSchema),
    },
    async (request) =>
      adminMediaService.getMediaForAdmin(
        currentAdmin(request),
        request.params.mediaId,
        parseAdminMediaDetailReason(request.query),
        adminRequestContext(request),
      ),
  );

  fastify.post<{ Params: { mediaId: string } }>(
    "/media/:mediaId/decision",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator"])],
      schema: withErrorResponses(adminMediaDecisionRouteSchema),
    },
    async (request) =>
      adminMediaService.createMediaDecisionForAdmin(
        currentAdmin(request),
        request.params.mediaId,
        parseAdminMediaDecisionBody(request.body),
        adminRequestContext(request),
      ),
  );
}
