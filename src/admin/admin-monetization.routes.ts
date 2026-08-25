import type { FastifyInstance, FastifyRequest } from "fastify";
import { unauthorized } from "../common/errors";
import { adminAuthMiddleware } from "./admin-auth.middleware";
import { requireAdmin } from "./admin.guard";
import { requireAdminNetworkAccess } from "./admin-network.guard";
import { requireRecentStepUp } from "./admin-step-up.guard";
import type { AdminContext, AdminRequestContext } from "./admin.types";
import { firstHeaderValue } from "./admin.types";
import {
  changeMode,
  getAdminMonetizationOverview,
  listFounders,
  manualPremiumGrant,
  revokeManualPremium,
  setBillingTester,
  setFounderCampaign,
} from "../monetization/monetization.service";
import { getGrowthAdminOverview } from "../growth/growth.service";

function currentAdmin(request: { admin?: AdminContext }): AdminContext {
  if (!request.admin) throw unauthorized();
  return request.admin;
}

function requestContext(request: FastifyRequest): AdminRequestContext {
  return {
    requestId: request.id,
    ipAddress: request.ip,
    userAgent: firstHeaderValue(request.headers["user-agent"]),
  };
}

export async function adminMonetizationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("onRequest", requireAdminNetworkAccess);
  fastify.addHook("onSend", async (_request, reply, payload) => {
    void reply.header("cache-control", "no-store");
    return payload;
  });
  fastify.get(
    "/monetization/overview",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner", "support", "ops"])] },
    async () => getAdminMonetizationOverview(),
  );
  fastify.post<{ Body: { mode?: unknown; reason?: unknown; confirmFirstOn?: unknown } }>(
    "/monetization/mode",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner"]), requireRecentStepUp] },
    async (request) => changeMode(currentAdmin(request), request.body, requestContext(request)),
  );
  fastify.post<{ Body: { status?: unknown; reason?: unknown } }>(
    "/founders/campaign",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner"]), requireRecentStepUp] },
    async (request) => setFounderCampaign(currentAdmin(request), request.body, requestContext(request)),
  );
  fastify.get(
    "/founders",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner", "support", "ops"])] },
    async (request) => {
      const query = request.query as { q?: string; filter?: string; limit?: string | number };
      return listFounders({
        q: query.q,
        filter: query.filter,
        limit: query.limit === undefined ? undefined : Number(query.limit),
      });
    },
  );
  fastify.post<{ Body: { amoriaId?: unknown; enabled?: unknown; reason?: unknown } }>(
    "/monetization/billing-testers",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner"]), requireRecentStepUp] },
    async (request) => setBillingTester(currentAdmin(request), request.body, requestContext(request)),
  );
  fastify.post<{ Body: { amoriaId?: unknown; endsAt?: unknown; reason?: unknown } }>(
    "/monetization/grants",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner"]), requireRecentStepUp] },
    async (request) => manualPremiumGrant(currentAdmin(request), request.body, requestContext(request)),
  );
  fastify.post<{ Body: { entitlementId?: unknown; reason?: unknown } }>(
    "/monetization/grants/revoke",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner"]), requireRecentStepUp] },
    async (request) => revokeManualPremium(currentAdmin(request), request.body, requestContext(request)),
  );
  fastify.get(
    "/growth/overview",
    { preHandler: [adminAuthMiddleware, requireAdmin(["owner", "ops"])] },
    async () => getGrowthAdminOverview(),
  );
}
