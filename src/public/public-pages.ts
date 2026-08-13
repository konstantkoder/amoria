import type { FastifyInstance } from "fastify";
import { env } from "../config/env";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title><style>body{max-width:760px;margin:40px auto;padding:0 20px;font:16px/1.55 system-ui,sans-serif;color:#171923}h1,h2{line-height:1.2}a{color:#714b00}</style></head>
<body>${body}</body></html>`;
}

export function accountDeletionPage(supportEmail: string): string {
  const email = escapeHtml(supportEmail);
  const mailto = encodeURIComponent(supportEmail);
  return page("Amoria account deletion", `<h1>Delete your Amoria account</h1>
<p>In the Amoria app, open <strong>Settings → Account → Delete account</strong>. Confirm the warning and enter your current password. The account becomes unusable immediately while private media deletion finishes through a durable retry process.</p>
<p>If you cannot access the installed app, email <a href="mailto:${mailto}?subject=Amoria%20account%20deletion%20request">${email}</a> from the address used for your Amoria account. Support will verify account ownership before deletion. Entering an email address alone never deletes an account.</p>
<p>Deletion removes profile and location data, media, authored messages, Together content, device/push tokens, and active sessions. Minimum anonymized safety and operational records may remain where needed to preserve security and audit integrity.</p>
<p><a href="/privacy">Privacy information</a></p>`);
}

export function privacyPage(supportEmail: string): string {
  const email = escapeHtml(supportEmail);
  const mailto = encodeURIComponent(supportEmail);
  return page("Amoria privacy information", `<h1>Amoria privacy information</h1>
<p>Amoria processes account and profile fields, age and matching preferences, approximate and exact location used by Nearby/Together matching, photos and private gallery media, messages and Together artifacts, safety reports, moderation results, device identifiers, and push tokens to operate the product.</p>
<p>Photos and private media are stored in private object storage and are subject to moderation and access controls. Push notifications use generic lock-screen text and opaque navigation identifiers; message bodies, exact location, private photos, and moderation details are not included.</p>
<p>You can request account deletion in the app or through the <a href="/account-deletion">external deletion instructions</a>. Account access and exposure stop immediately. Physical media cleanup is durable and retryable. Personal and user-generated data is removed; minimum anonymized safety, fraud-prevention, and audit structure may be retained without email, display name, location, media, or reusable credentials.</p>
<p>Questions: <a href="mailto:${mailto}">${email}</a></p>`);
}

export async function publicPagesRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get("/account-deletion", async (_request, reply) => {
    reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(accountDeletionPage(env.SUPPORT_EMAIL));
  });
  fastify.get("/privacy", async (_request, reply) => {
    reply.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Content-Type", "text/html; charset=utf-8");
    reply.header("Cache-Control", "public, max-age=300");
    return reply.send(privacyPage(env.SUPPORT_EMAIL));
  });
}
