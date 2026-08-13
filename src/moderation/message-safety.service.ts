import { env } from "../config/env";
import { assertNotRateLimited, MessageAbuseGuard, type AbuseDecision } from "./message-abuse.guard";
import {
  detectDeterministicTextSafety,
  DETERMINISTIC_TEXT_POLICY_VERSION,
  type DeterministicTextFinding,
} from "./deterministic-text-safety";
import { textModerationClient } from "./text-moderation.client";
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
  classify: typeof textModerationClient.classify;
};

const abuseGuard = new MessageAbuseGuard();
const defaultDeps: MessageSafetyDeps = {
  evaluateAbuse: env.isTest
    ? async () => testAllowDecision()
    : async (input) => abuseGuard.evaluate(input),
  modelConfigured: () => textModerationClient.isConfigured(),
  classify: textModerationClient.classify.bind(textModerationClient),
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

  const deterministicFindings = detectDeterministicTextSafety(input.text);
  evidence.push(...deterministicFindings.map(deterministicEvidence));

  if (!deps.modelConfigured()) {
    evidence.push(modelEvidence("allow", "model_not_configured", {
      automationStatus: "not_configured",
    }));
    return {
      state: stateForOutcomes(deterministicFindings.map((finding) => finding.outcome)),
      automationStatus: "not_configured",
      evidence,
    };
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
    const deterministicState = stateForOutcomes(deterministicFindings.map((finding) => finding.outcome));
    return {
      state: strongestState(deterministicState, stateForModelOutcome(policy.outcome)),
      automationStatus: "completed",
      evidence,
    };
  } catch (error) {
    const abuseHighRisk = isHighRiskWithoutModel(abuse);
    const deterministicState = stateForOutcomes(deterministicFindings.map((finding) => finding.outcome));
    const fallbackState = abuseHighRisk
      ? strongestState(deterministicState, "needs_review")
      : deterministicState;
    evidence.push(modelEvidence(fallbackState === "visible" ? "allow" : "hold", "model_failed", {
      automationStatus: "failed",
      errorCode: safeModelError(error),
    }));
    return {
      state: fallbackState,
      automationStatus: "failed",
      evidence,
    };
  }
}

function deterministicEvidence(finding: DeterministicTextFinding): ModerationEvidence {
  return {
    source: "automated_spam",
    action: finding.outcome,
    reason: finding.category,
    metadata: {
      engine: "amoria_deterministic_text_safety",
      policyVersion: DETERMINISTIC_TEXT_POLICY_VERSION,
      category: finding.category,
      signals: finding.signals,
      decision: finding.outcome,
      timestamp: new Date().toISOString(),
    },
  };
}

function stateForOutcomes(outcomes: Array<"flag" | "hold" | "restrict">): MessageSafetyDecision["state"] {
  if (outcomes.includes("restrict")) return "restricted";
  if (outcomes.includes("hold")) return "held";
  if (outcomes.includes("flag")) return "needs_review";
  return "visible";
}

function stateForModelOutcome(outcome: "allow" | "flag" | "hold" | "restrict"): MessageSafetyDecision["state"] {
  if (outcome === "restrict") return "restricted";
  if (outcome === "hold") return "held";
  return "visible";
}

function strongestState(
  first: MessageSafetyDecision["state"],
  second: MessageSafetyDecision["state"],
): MessageSafetyDecision["state"] {
  const rank: Record<MessageSafetyDecision["state"], number> = {
    visible: 0,
    needs_review: 1,
    held: 2,
    restricted: 3,
    removed: 4,
  };
  return rank[first] >= rank[second] ? first : second;
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
