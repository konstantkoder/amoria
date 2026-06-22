import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import { requireAdmin } from "./admin.guard";
import {
  adminClientErrorActionRouteSchema,
  adminClientErrorBulkActionRouteSchema,
  adminClientErrorsRouteSchema,
  parseAdminClientErrorActionBody,
  parseAdminClientErrorBulkActionBody,
  parseAdminClientErrorsQuery,
} from "../client-errors/client-errors.schemas";
import * as clientErrorsService from "../client-errors/client-errors.service";
import { adminNearbyActivityDemandRouteSchema } from "./admin-activity-demand.schemas";
import * as adminActivityDemandService from "./admin-activity-demand.service";
import {
  adminMediaDecisionRouteSchema,
  adminMediaDetailRouteSchema,
  adminMediaListRouteSchema,
  parseAdminMediaDecisionBody,
  parseAdminMediaDetailReason,
  parseAdminMediaQuery,
} from "./admin-media.schemas";
import * as adminMediaService from "./admin-media.service";
import {
  adminCreateNearbyRoomRouteSchema,
  adminNearbyRoomActionRouteSchema,
  adminNearbyRoomDetailRouteSchema,
  adminNearbyRoomsRouteSchema,
  adminNearbyRoomTypesRouteSchema,
  parseAdminCreateNearbyRoomBody,
  parseAdminNearbyRoomActionBody,
} from "./admin-nearby-rooms.schemas";
import * as adminNearbyRoomsService from "./admin-nearby-rooms.service";
import {
  adminNearbyDiagnosticsRouteSchema,
  adminOpsHealthRouteSchema,
  adminReleaseDashboardRouteSchema,
  adminTogetherSessionsRouteSchema,
  adminTogetherQueueActionRouteSchema,
  adminTogetherQueueRouteSchema,
  parseAdminTogetherQueueQuery,
  parseAdminTogetherSessionsQuery,
  parseAdminTogetherQueueActionBody,
} from "./admin-ops.schemas";
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
  adminAdminUsersRouteSchema,
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
    "/dashboard/release-control",
    {
      preHandler: [authMiddleware, requireAdmin()],
      schema: withErrorResponses(adminReleaseDashboardRouteSchema),
    },
    async (request) =>
      adminOpsService.getReleaseDashboardForAdmin(
        currentAdmin(request),
        adminRequestContext(request),
      ),
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
    "/admin-users",
    {
      preHandler: [authMiddleware, requireAdmin(["owner"])],
      schema: withErrorResponses(adminAdminUsersRouteSchema),
    },
    async (request) =>
      adminService.listAdminUsersForAdmin(
        currentAdmin(request),
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

  fastify.post(
    "/client-errors/actions/bulk",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "support", "ops"])],
      schema: withErrorResponses(adminClientErrorBulkActionRouteSchema),
    },
    async (request) =>
      clientErrorsService.bulkActionClientErrorReportsForAdmin(
        currentAdmin(request),
        parseAdminClientErrorBulkActionBody(request.body),
        adminRequestContext(request),
      ),
  );

  fastify.post<{ Params: { id: string } }>(
    "/client-errors/:id/actions",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "support", "ops"])],
      schema: withErrorResponses(adminClientErrorActionRouteSchema),
    },
    async (request) =>
      clientErrorsService.actionClientErrorReportForAdmin(
        currentAdmin(request),
        request.params.id,
        parseAdminClientErrorActionBody(request.body),
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
    "/nearby/diagnostics",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "ops"])],
      schema: withErrorResponses(adminNearbyDiagnosticsRouteSchema),
    },
    async (request) =>
      adminOpsService.getNearbyDiagnosticsForAdmin(
        currentAdmin(request),
        adminRequestContext(request),
      ),
  );

  fastify.get(
    "/nearby-activity-demand",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support", "ops"])],
      schema: withErrorResponses(adminNearbyActivityDemandRouteSchema),
    },
    async (request) =>
      adminActivityDemandService.getNearbyActivityDemandForAdmin(
        currentAdmin(request),
        adminRequestContext(request),
      ),
  );

  fastify.get(
    "/nearby-room-types",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support", "ops"])],
      schema: withErrorResponses(adminNearbyRoomTypesRouteSchema),
    },
    async (request) =>
      adminNearbyRoomsService.listNearbyRoomTypesForAdmin(
        currentAdmin(request),
        adminRequestContext(request),
      ),
  );

  fastify.get(
    "/nearby-rooms",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support", "ops"])],
      schema: withErrorResponses(adminNearbyRoomsRouteSchema),
    },
    async (request) =>
      adminNearbyRoomsService.listNearbyRoomsForAdmin(
        currentAdmin(request),
        adminRequestContext(request),
      ),
  );

  fastify.post(
    "/nearby-rooms",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator"])],
      schema: withErrorResponses(adminCreateNearbyRoomRouteSchema),
    },
    async (request, reply) => {
      const response = await adminNearbyRoomsService.createNearbyRoomForAdmin(
        currentAdmin(request),
        parseAdminCreateNearbyRoomBody(request.body),
        adminRequestContext(request),
      );
      return reply.status(201).send(response);
    },
  );

  fastify.get<{ Params: { roomId: string } }>(
    "/nearby-rooms/:roomId",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support", "ops"])],
      schema: withErrorResponses(adminNearbyRoomDetailRouteSchema),
    },
    async (request) =>
      adminNearbyRoomsService.getNearbyRoomForAdmin(
        currentAdmin(request),
        request.params.roomId,
        adminRequestContext(request),
      ),
  );

  fastify.post<{ Params: { roomId: string } }>(
    "/nearby-rooms/:roomId/actions",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator"])],
      schema: withErrorResponses(adminNearbyRoomActionRouteSchema),
    },
    async (request) =>
      adminNearbyRoomsService.actionNearbyRoomForAdmin(
        currentAdmin(request),
        request.params.roomId,
        parseAdminNearbyRoomActionBody(request.body),
        adminRequestContext(request),
      ),
  );

  fastify.get(
    "/together/queue",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "ops"])],
      schema: withErrorResponses(adminTogetherQueueRouteSchema),
    },
    async (request) =>
      adminOpsService.listTogetherQueueForAdmin(
        currentAdmin(request),
        parseAdminTogetherQueueQuery(request.query),
        adminRequestContext(request),
      ),
  );

  fastify.get(
    "/together/sessions",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "ops"])],
      schema: withErrorResponses(adminTogetherSessionsRouteSchema),
    },
    async (request) =>
      adminOpsService.listTogetherSessionsForAdmin(
        currentAdmin(request),
        parseAdminTogetherSessionsQuery(request.query),
        adminRequestContext(request),
      ),
  );

  fastify.post<{ Params: { entryId: string } }>(
    "/together/queue/:entryId/actions",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "ops"])],
      schema: withErrorResponses(adminTogetherQueueActionRouteSchema),
    },
    async (request) =>
      adminOpsService.actionTogetherQueueEntryForAdmin(
        currentAdmin(request),
        request.params.entryId,
        parseAdminTogetherQueueActionBody(request.body),
        adminRequestContext(request),
      ),
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

  fastify.get<{ Params: { mediaId: string } }>(
    "/media/:mediaId/content",
    {
      preHandler: [authMiddleware, requireAdmin(["owner", "moderator", "support"])],
    },
    async (request, reply) => {
      const media = await adminMediaService.getMediaContentForAdmin(
        currentAdmin(request),
        request.params.mediaId,
        parseAdminMediaDetailReason(request.query),
        adminRequestContext(request),
      );

      return reply.header("content-type", media.contentType).send(media.body);
    },
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
