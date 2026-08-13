import Fastify from "fastify";
import { env } from "../config/env";
import { loggerOptions } from "../config/logger";
import { localTextModerationClient } from "./local-text-moderation.client";

const service = Fastify({ logger: loggerOptions(), bodyLimit: 16 * 1024 });

service.get("/health/live", async () => ({ ok: true }));
service.get("/health/ready", async (_request, reply) => {
  if (!localTextModerationClient.isConfigured()) return reply.status(503).send({ ok: false });
  return { ok: true };
});
service.post("/classify", async (request, reply) => {
  if (request.headers.authorization !== `Bearer ${env.TEXT_MODERATION_SERVICE_TOKEN}`) {
    return reply.status(404).send({ error: "not_found" });
  }
  const body = request.body as { messageId?: unknown; text?: unknown };
  if (
    typeof body?.messageId !== "string" || body.messageId.length < 1 || body.messageId.length > 128 ||
    typeof body?.text !== "string" || body.text.length < 1 || body.text.length > 8_000
  ) return reply.status(400).send({ error: "invalid_request" });
  try {
    return await localTextModerationClient.classify(body.messageId, body.text);
  } catch (error) {
    request.log.error({ err: error }, "Text moderation inference failed");
    return reply.status(503).header("retry-after", "1").send({ error: "temporarily_unavailable" });
  }
});

async function start(): Promise<void> {
  if (env.TEXT_MODERATION_TRANSPORT !== "local" || !env.TEXT_MODERATION_SERVICE_TOKEN) {
    throw new Error("Text moderation service requires local transport and TEXT_MODERATION_SERVICE_TOKEN");
  }
  await localTextModerationClient.warmUp();
  await service.listen({ host: "0.0.0.0", port: env.PORT });
}

async function shutdown(): Promise<void> {
  localTextModerationClient.stop();
  await service.close();
  process.exit(0);
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });
void start().catch((error) => {
  service.log.error({ err: error }, "Failed to start text moderation service");
  process.exit(1);
});
