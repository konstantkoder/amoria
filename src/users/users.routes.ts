import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { authMiddleware } from "../common/security/auth-middleware";
import { unauthorized } from "../common/errors";
import { withErrorResponses } from "../common/http";
import { firstHeaderValue, type AdminRequestContext } from "../admin/admin.types";
import type { UpdateProfileBody } from "./users.service";
import type {
  ResetLockedGalleryPasswordBody,
  SetLockedGalleryPasswordBody,
  UnlockLockedGalleryBody,
  UpdateGalleryItemsBody,
} from "./profile-gallery.service";
import {
  getMeRouteSchema,
  getOwnerProfileGalleryRouteSchema,
  getPublicUserByAmoriaIdRouteSchema,
  getPublicUserByIdRouteSchema,
  resetLockedGalleryPasswordRouteSchema,
  setLockedGalleryPasswordRouteSchema,
  unlockLockedGalleryRouteSchema,
  updateOwnerProfileGalleryItemsRouteSchema,
  updateProfileRouteSchema,
  updatePreferredLocaleRouteSchema,
} from "./users.schemas";
import * as profileGalleryService from "./profile-gallery.service";
import * as usersService from "./users.service";
import { requestAccountDeletion } from "./account-deletion.service";
import { verifyAccessToken } from "../auth/jwt";
import { findUserAccessState } from "./users.repo";

function currentUserId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) {
    throw unauthorized();
  }

  return request.auth.userId;
}

function requestContext(request: {
  id: string;
  ip: string;
  headers: { "user-agent"?: string | string[] };
}): AdminRequestContext {
  return {
    requestId: request.id,
    ipAddress: request.ip,
    userAgent: firstHeaderValue(request.headers["user-agent"]),
  };
}

export async function usersRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { id: string } }>(
    "/users/:id/public",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getPublicUserByIdRouteSchema),
    },
    async (request) => usersService.getPublicUserById(currentUserId(request), request.params.id),
  );

  fastify.get<{ Params: { amoriaId: string } }>(
    "/users/by-amoria-id/:amoriaId",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getPublicUserByAmoriaIdRouteSchema),
    },
    async (request) =>
      usersService.getPublicUserByAmoriaId(currentUserId(request), request.params.amoriaId),
  );

  fastify.get(
    "/me",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getMeRouteSchema),
    },
    async (request) => usersService.getCurrentUser(currentUserId(request)),
  );

  fastify.put<{ Body: { locale: string } }>(
    "/me/locale",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(updatePreferredLocaleRouteSchema),
    },
    async (request) => usersService.updatePreferredLocale(currentUserId(request), request.body.locale),
  );

  fastify.get(
    "/me/profile/gallery",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(getOwnerProfileGalleryRouteSchema),
    },
    async (request) => profileGalleryService.getOwnerProfileGallery(currentUserId(request)),
  );

  fastify.patch<{ Body: UpdateProfileBody }>(
    "/me/profile",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(updateProfileRouteSchema),
    },
    async (request) =>
      usersService.updateCurrentUserProfile(currentUserId(request), request.body),
  );

  fastify.patch<{ Body: UpdateGalleryItemsBody }>(
    "/me/profile/gallery/items",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(updateOwnerProfileGalleryItemsRouteSchema),
    },
    async (request) =>
      profileGalleryService.updateOwnerProfileGalleryItems(
        currentUserId(request),
        request.body,
      ),
  );

  fastify.put<{ Body: SetLockedGalleryPasswordBody }>(
    "/me/profile/locked-gallery/password",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(setLockedGalleryPasswordRouteSchema),
    },
    async (request) =>
      profileGalleryService.setLockedGalleryPassword(currentUserId(request), request.body),
  );

  fastify.delete<{ Body: ResetLockedGalleryPasswordBody }>(
    "/me/profile/locked-gallery/password",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(resetLockedGalleryPasswordRouteSchema),
    },
    async (request) =>
      profileGalleryService.resetLockedGalleryPassword(currentUserId(request), request.body),
  );

  fastify.post<{ Params: { id: string }; Body: UnlockLockedGalleryBody }>(
    "/users/:id/locked-gallery/unlock",
    {
      preHandler: authMiddleware,
      schema: withErrorResponses(unlockLockedGalleryRouteSchema),
    },
    async (request) =>
      profileGalleryService.unlockLockedGallery(
        currentUserId(request),
        request.params.id,
        request.body,
        requestContext(request),
      ),
  );

  fastify.delete<{ Body: { password: string } }>(
    "/me/account",
    {
      preHandler: accountDeletionAuthMiddleware,
      schema: withErrorResponses({
        body: { type: "object", required: ["password"], additionalProperties: false, properties: { password: { type: "string", minLength: 1, maxLength: 200 } } },
        response: { 202: { type: "object", required: ["status"], additionalProperties: false, properties: { status: { type: "string", enum: ["pending", "completed"] } } } },
      }),
    },
    async (request, reply) => reply.status(202).send(await requestAccountDeletion(currentUserId(request), request.body.password)),
  );
}

async function accountDeletionAuthMiddleware(request: FastifyRequest, _reply: FastifyReply) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) throw unauthorized();
  const token = header.slice("Bearer ".length).trim();
  if (!token) throw unauthorized();
  const payload = verifyAccessToken(token);
  const accessState = await findUserAccessState(payload.sub);
  if (!accessState || accessState.authVersion !== payload.ver) throw unauthorized("Access has been revoked");
  request.auth = { userId: payload.sub };
}
