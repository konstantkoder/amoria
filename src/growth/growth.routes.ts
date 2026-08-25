import type { FastifyInstance } from "fastify";
import { unauthorized, validationError } from "../common/errors";
import { authMiddleware } from "../common/security/auth-middleware";
import { env } from "../config/env";
import {
  claimAttribution,
  getAvailability,
  getInvite,
  getPushPreferences,
  markInviteShared,
  recordInviteOpened,
  recordProductEvent,
  setTogetherShareConsent,
  updateAvailability,
  updatePushPreferences,
} from "./growth.service";
import { escapeHtml } from "../public/public-pages";

function userId(request: { auth?: { userId: string } }): string {
  if (!request.auth?.userId) throw unauthorized();
  return request.auth.userId;
}

export async function growthRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get<{ Params: { code: string } }>("/i/:code", async (request, reply) => {
    const code = request.params.code.trim().toUpperCase();
    const valid = await recordInviteOpened(code);
    if (!valid) {
      return reply.status(404).type("text/html; charset=utf-8").send(
        "<!doctype html><meta charset=\"utf-8\"><title>Amoria</title><p>Invitation not found.</p>",
      );
    }
    const playLink = env.GOOGLE_PLAY_LISTING_URL
      ? `<a class="button" href="${escapeHtml(env.GOOGLE_PLAY_LISTING_URL)}">Google Play</a>`
      : `<span class="button disabled">Google Play — link pending</span>`;
    reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cache-Control", "no-store");
    return reply.type("text/html; charset=utf-8").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Amoria invitation</title><style>body{max-width:680px;margin:48px auto;padding:0 24px;background:#080d1a;color:#f4eee6;font:16px/1.55 system-ui,sans-serif}h1{color:#e6b976}.button{display:inline-block;margin:16px 0;padding:12px 18px;border:1px solid #e6b976;border-radius:12px;color:#f8dda6;text-decoration:none}.disabled{opacity:.65}a{color:#e6b976}</style></head>
<body><h1>Amoria</h1><p>Meet real people through Nearby and Together.</p><p>Upoznajte stvarne ljude kroz Nearby i Together.</p>${playLink}<p><a href="/privacy">Privacy / Privatnost</a></p></body></html>`);
  });
  fastify.get("/me/invite", { preHandler: authMiddleware }, async (request) => getInvite(userId(request)));
  fastify.post("/me/invite/shared", { preHandler: authMiddleware }, async (request) => markInviteShared(userId(request)));
  fastify.post<{ Body: { code?: unknown; sourceCode?: unknown; installId?: unknown } }>(
    "/me/acquisition/claim",
    { preHandler: authMiddleware },
    async (request) => claimAttribution(userId(request), request.body ?? {}),
  );
  fastify.post<{ Body: { eventName?: unknown; sourceCode?: unknown; metadata?: unknown } }>(
    "/analytics/events",
    { preHandler: authMiddleware },
    async (request) => recordProductEvent({
      userId: userId(request),
      eventName: request.body?.eventName,
      sourceCode: request.body?.sourceCode,
      metadata: request.body?.metadata,
    }),
  );
  fastify.get("/me/push-preferences", { preHandler: authMiddleware }, async (request) => {
    const preferences = await getPushPreferences(userId(request));
    return {
      messages: preferences.messages,
      together: preferences.together,
      communityActivity: preferences.community_activity,
      premiumAccount: preferences.premium_account,
      transactionalAlwaysOn: true,
    };
  });
  fastify.put("/me/push-preferences", { preHandler: authMiddleware }, async (request) => (
    updatePushPreferences(userId(request), request.body)
  ));
  fastify.get("/me/availability", { preHandler: authMiddleware }, async (request) => getAvailability(userId(request)));
  fastify.put("/me/availability", { preHandler: authMiddleware }, async (request) => updateAvailability(userId(request), request.body));
  fastify.put<{ Params: { sessionId: string }; Body: { consent?: unknown } }>(
    "/together/sessions/:sessionId/share-consent",
    { preHandler: authMiddleware },
    async (request) => {
      if (typeof request.body?.consent !== "boolean") {
        throw validationError("Together share consent is invalid", { consent: "invalid" });
      }
      return setTogetherShareConsent(userId(request), request.params.sessionId, request.body.consent);
    },
  );
  fastify.get("/.well-known/assetlinks.json", async (_request, reply) => {
    if (!env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS.length) {
      return reply.status(503).send({
        error: { code: "app_links_not_configured", message: "Production signing fingerprints are not configured" },
      });
    }
    return reply.send([{
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.GOOGLE_PLAY_PACKAGE_NAME,
        sha256_cert_fingerprints: env.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINTS,
      },
    }]);
  });
}
