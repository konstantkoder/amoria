import { env } from "../config/env";
import { assertNotRateLimited, MessageAbuseGuard, type AbuseDecision } from "./message-abuse.guard";
import { localTextModerationClient } from "./local-text-moderation.client";
import type {
  MessageSafetyDecision,
  MessageSource,
  ModerationEvidence,
} from "./message-moderation.types";
import {
  applyTextModerationPolicy,
  TEXT_MODEL_ENGINE,
  TEXT_MODEL_VERSION,
  TEXT_POLICY_VERSION,
} from "./text-moderation.policy";
import { assertSafeText } from "./text-validation";

export type ModerateMessageInput = {
  messageIdHint: string;
  senderUserId: string;
  threadId: string;
  recipientId?: string;
  clientMessageId: string;
  text: string;
  source: MessageSource;
};

type MessageSafetyDeps = {
  evaluateAbuse: (input: ModerateMessageInput) => Promise<AbuseDecision>;
  modelConfigured: () => boolean;
  classify: typeof localTextModerationClient.classify;
};

const abuseGuard = new MessageAbuseGuard();
const defaultDeps: MessageSafetyDeps = {
  evaluateAbuse: env.isTest
    ? async () => testAllowDecision()
    : async (input) => abuseGuard.evaluate(input),
  modelConfigured: () => localTextModerationClient.isConfigured(),
  classify: localTextModerationClient.classify.bind(localTextModerationClient),
};

let deps = defaultDeps;

export function __setMessageSafetyDepsForTests(overrides: Partial<MessageSafetyDeps>): () => void {
  const previous = deps;
  deps = { ...deps, ...overrides };
  return () => {
    deps = previous;
  };
}

export async function moderateMessage(input: ModerateMessageInput): Promise<MessageSafetyDecision> {
  assertSafeText(input.text, { field: "text", maxUrls: 8 });
  const abuse = await deps.evaluateAbuse(input);
  assertNotRateLimited(abuse);

  const evidence: ModerationEvidence[] = [{
    source: "automated_spam",
    action: abuse.decision === "hold" ? "hold" : "allow",
    reason: abuse.reason,
    metadata: {
      engine: "amoria_postgresql_message_abuse_guard",
      policyVersion: "amoria_message_abuse_v1",
      signals: abuse.signals,
      decision: abuse.decision,
      timestamp: new Date().toISOString(),
    },
  }];

  if (abuse.decision === "hold") {
    return { state: "held", automationStatus: "not_required", evidence };
  }

  if (!deps.modelConfigured()) {
    evidence.push(modelEvidence("allow", "model_not_configured", {
      automationStatus: "not_configured",
    }));
    return { state: "visible", automationStatus: "not_configured", evidence };
  }

  try {
    const model = await deps.classify(input.messageIdHint, input.text);
    const policy = applyTextModerationPolicy(model.signals);
    evidence.push(modelEvidence(policy.outcome, policy.reason, {
      signals: model.signals,
      confidence: policy.confidence,
      durationMs: model.durationMs,
      automationStatus: "completed",
    }));
    return {
      state: policy.outcome === "restrict"
        ? "restricted"
        : policy.outcome === "hold"
          ? "held"
          : "visible",
      automationStatus: "completed",
      evidence,
    };
  } catch (error) {
    const highRisk = isHighRiskWithoutModel(abuse);
    evidence.push(modelEvidence(highRisk ? "hold" : "allow", "model_failed", {
      automationStatus: "failed",
      errorCode: safeModelError(error),
    }));
    return {
      state: highRisk ? "needs_review" : "visible",
      automationStatus: "failed",
      evidence,
    };
  }
}

function modelEvidence(
  action: ModerationEvidence["action"],
  reason: string | null,
  details: Record<string, string | number | boolean | object>,
): ModerationEvidence {
  return {
    source: "automated_local_model",
    action,
    reason,
    metadata: {
      engine: TEXT_MODEL_ENGINE,
      modelVersion: TEXT_MODEL_VERSION,
      policyVersion: TEXT_POLICY_VERSION,
      decision: action,
      timestamp: new Date().toISOString(),
      ...details,
    },
  };
}

function isHighRiskWithoutModel(abuse: AbuseDecision): boolean {
  return (
    Number(abuse.signals.urlCount ?? 0) >= 2 &&
    (Boolean(abuse.signals.newAccount) || Number(abuse.signals.distinctRecipients5m ?? 0) >= 3)
  ) || Number(abuse.signals.recentRestrictions ?? 0) > 0;
}

function safeModelError(error: unknown): string {
  const value = error instanceof Error ? error.message : "text_model_failed";
  return /^[a-z0-9_]{1,80}$/u.test(value) ? value : "text_model_failed";
}

function testAllowDecision(): AbuseDecision {
  return {
    decision: "allow",
    reason: null,
    signals: { testFixture: true },
    fingerprints: {
      exactFingerprint: "test",
      similarityHash: "0000000000000000",
      linkFingerprint: null,
      urlCount: 0,
    },
  };
}
