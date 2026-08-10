export const TEXT_POLICY_VERSION = "amoria_text_policy_v1";
export const TEXT_MODEL_ENGINE = "detoxify_xlmr_onnx_cpu";
export const TEXT_MODEL_VERSION =
  "unitary/multilingual-toxic-xlm-roberta@4ad6f5c+hoan-onnx@87059f2";

export type LocalTextSignals = {
  toxicity: number;
  severeToxicity: number;
  identityAttack: number;
  insult: number;
  threat: number;
};

export type TextPolicyOutcome = "allow" | "flag" | "hold" | "restrict";

export type TextPolicyDecision = {
  outcome: TextPolicyOutcome;
  reason: string | null;
  confidence: number;
};

export function applyTextModerationPolicy(signals: LocalTextSignals): TextPolicyDecision {
  assertSignals(signals);
  if (signals.threat >= 0.97 || signals.severeToxicity >= 0.985) {
    return {
      outcome: "restrict",
      reason: signals.threat >= signals.severeToxicity ? "high_confidence_threat" : "high_confidence_severe_toxicity",
      confidence: Math.max(signals.threat, signals.severeToxicity),
    };
  }
  if (
    signals.toxicity >= 0.94 ||
    signals.threat >= 0.86 ||
    signals.identityAttack >= 0.94 ||
    signals.insult >= 0.97
  ) {
    return {
      outcome: "hold",
      reason: "high_confidence_toxicity",
      confidence: Math.max(
        signals.toxicity,
        signals.threat,
        signals.identityAttack,
        signals.insult,
      ),
    };
  }
  if (signals.toxicity >= 0.78 || signals.threat >= 0.68 || signals.identityAttack >= 0.8) {
    return {
      outcome: "flag",
      reason: "ambiguous_toxicity_signal",
      confidence: Math.max(signals.toxicity, signals.threat, signals.identityAttack),
    };
  }
  return {
    outcome: "allow",
    reason: null,
    confidence: Math.max(signals.toxicity, signals.threat, signals.identityAttack, signals.insult),
  };
}
function assertSignals(signals: LocalTextSignals): void {
  for (const value of Object.values(signals)) {
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("Local text model returned an invalid confidence");
    }
  }
}
