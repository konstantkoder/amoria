import type { FastifyInstance } from "fastify";
import { unauthorized } from "../common/errors";
import { authMiddleware } from "../common/security/auth-middleware";
import { getMonetizationSnapshot, setProfileFrame } from "./monetization.service";
import type { PremiumFrameStyle } from "./monetization.types";
import {
  handleRtdn,
  verifyGooglePurchase,
  verifyRtdnAuthorization,
} from "../billing/google-play.service";

function userId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) throw unauthorized();
  return request.auth.userId;
}

export async function monetizationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/me/monetization",
    { preHandler: authMiddleware },
    async (request) => getMonetizationSnapshot(userId(request)),
  );
  fastify.put<{ Body: { frameStyle?: PremiumFrameStyle } }>(
    "/me/premium/profile-frame",
    { preHandler: authMiddleware },
    async (request) => setProfileFrame(userId(request), request.body?.frameStyle as PremiumFrameStyle),
  );
  fastify.post<{ Body: { purchaseToken?: unknown; productId?: unknown; origin?: unknown } }>(
    "/billing/google/verify",
    { preHandler: authMiddleware },
    async (request) => verifyGooglePurchase(userId(request), request.body ?? {}),
  );
  fastify.post(
    "/billing/google/rtdn",
    async (request) => {
      await verifyRtdnAuthorization(request.headers.authorization);
      return handleRtdn(request.body);
    },
  );
}
