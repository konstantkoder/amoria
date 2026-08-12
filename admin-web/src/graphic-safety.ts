export type GraphicSafetyDisplayState = "safe" | "needs_review" | "unsafe";

export type GraphicSafetyEvidence = {
  signal: "safe" | "unknown" | "unsafe";
  displayState: GraphicSafetyDisplayState;
  nsflProbability: number | null;
  policyDecision: "approve" | "needs_review" | "restrict" | null;
  modelVersion: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function probability(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : null;
}

function modelVersion(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 256 && !/[\u0000-\u001f\u007f]/u.test(normalized)
    ? normalized
    : null;
}

export function graphicSafetyFromRawResult(value: unknown): GraphicSafetyEvidence | null {
  if (!isRecord(value) || !isRecord(value.graphicSafety)) {
    return null;
  }

  const graphicSafety = value.graphicSafety;
  const signal = graphicSafety.signal;
  if (signal !== "safe" && signal !== "unknown" && signal !== "unsafe") {
    return null;
  }

  const rawDecision = graphicSafety.policyDecision;
  const policyDecision = rawDecision === "approve" || rawDecision === "needs_review" || rawDecision === "restrict"
    ? rawDecision
    : null;

  return {
    signal,
    displayState: signal === "unknown" ? "needs_review" : signal,
    nsflProbability: probability(graphicSafety.nsflProbability),
    policyDecision,
    modelVersion: modelVersion(graphicSafety.modelVersion),
  };
}
