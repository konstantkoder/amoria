import { env } from "../config/env";
import { incrementMetric, observeMetric } from "../observability/metrics";
import {
  localTextModerationClient,
  type LocalTextModerationResult,
} from "./local-text-moderation.client";

class TextModerationClient {
  private pending = 0;

  isConfigured(): boolean {
    if (!env.TEXT_MODERATION_ENABLED) return false;
    return env.TEXT_MODERATION_TRANSPORT === "local"
      ? localTextModerationClient.isConfigured()
      : Boolean(env.TEXT_MODERATION_SERVICE_URL && env.TEXT_MODERATION_SERVICE_TOKEN);
  }

  async classify(messageId: string, text: string): Promise<LocalTextModerationResult> {
    incrementMetric("amoria_text_moderation_requests_total", { transport: env.TEXT_MODERATION_TRANSPORT });
    const started = process.hrtime.bigint();
    try {
      if (env.TEXT_MODERATION_TRANSPORT === "local") {
        return await localTextModerationClient.classify(messageId, text);
      }
      if (this.pending >= 64) throw new Error("text_model_queue_full");
      this.pending += 1;
      try {
        const response = await fetch(`${env.TEXT_MODERATION_SERVICE_URL}/classify`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${env.TEXT_MODERATION_SERVICE_TOKEN}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({ messageId, text }),
          signal: AbortSignal.timeout(env.TEXT_MODERATION_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(response.status === 503 ? "text_model_queue_full" : "text_model_failed");
        const result = await response.json() as LocalTextModerationResult;
        assertResult(result);
        return result;
      } finally {
        this.pending -= 1;
      }
    } catch (error) {
      incrementMetric("amoria_text_moderation_errors_total", {
        reason: safeReason(error),
        transport: env.TEXT_MODERATION_TRANSPORT,
      });
      throw error;
    } finally {
      observeMetric(
        "amoria_text_moderation_duration_seconds",
        Number(process.hrtime.bigint() - started) / 1e9,
        { transport: env.TEXT_MODERATION_TRANSPORT },
      );
    }
  }
}

function assertResult(result: LocalTextModerationResult): void {
  if (!result || !Number.isFinite(result.durationMs)) throw new Error("text_model_invalid_response");
  const signals = result.signals;
  if (!signals || Object.values(signals).some((value) => !Number.isFinite(value) || value < 0 || value > 1)) {
    throw new Error("text_model_invalid_response");
  }
}

function safeReason(error: unknown): string {
  const reason = error instanceof Error ? error.message : "text_model_failed";
  return /^[a-z0-9_]{1,64}$/.test(reason) ? reason : "text_model_failed";
}

export const textModerationClient = new TextModerationClient();
