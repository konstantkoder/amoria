import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { authMiddleware } from "../common/security/auth-middleware";
import {
  closeAnnouncementRouteSchema,
  createAnnouncementRouteSchema,
  getAnnouncementRouteSchema,
  listAnnouncementsRouteSchema,
  parseAnnouncementsQuery,
  parseCreateAnnouncementBody,
  parseRespondAnnouncementBody,
  respondAnnouncementRouteSchema,
} from "./announcements.schemas";
import * as announcementsService from "./announcements.service";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

export async function announcementsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(listAnnouncementsRouteSchema),
    },
    async (request) =>
      announcementsService.listAnnouncements(
        currentUserId(request),
        parseAnnouncementsQuery(request.query),
      ),
  );

  fastify.post(
    "/",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(createAnnouncementRouteSchema),
    },
    async (request, reply) => {
      const response = await announcementsService.createAnnouncement(
        currentUserId(request),
        parseCreateAnnouncementBody(request.body),
      );
      return reply.status(201).send(response);
    },
  );

  fastify.get<{ Params: { id: string } }>(
    "/:id",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getAnnouncementRouteSchema),
    },
    async (request) =>
      announcementsService.getAnnouncement(currentUserId(request), request.params.id),
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/close",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(closeAnnouncementRouteSchema),
    },
    async (request) =>
      announcementsService.closeAnnouncement(currentUserId(request), request.params.id),
  );

  fastify.post<{ Params: { id: string } }>(
    "/:id/respond",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(respondAnnouncementRouteSchema),
    },
    async (request) =>
      announcementsService.respondToAnnouncement(
        currentUserId(request),
        request.params.id,
        parseRespondAnnouncementBody(request.body ?? {}),
      ),
  );
}
