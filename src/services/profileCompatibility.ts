import type { AgeGroup, Goal, Mood } from "@/models/User";

export type CompatibilitySource = "nearby" | "together" | "profile";

export type CompatibilityPeer = {
  goal?: Goal | null;
  mood?: Mood | null;
  interests?: string[];
  age?: number | null;
  ageGroup?: AgeGroup | null;
};

export type CompatibilitySelf = {
  goal?: Goal | null;
  mood?: Mood | null;
  interests?: string[];
  preferredAgeMin?: number;
  preferredAgeMax?: number | null;
};

export type CompatibilityReason = {
  kind: "goal" | "mood" | "interest" | "age";
  value?: string;
};

export function buildProfileCompatibilityHints(
  self: CompatibilitySelf | null,
  peer: CompatibilityPeer | null
): { count: number; reasons: CompatibilityReason[] } {
  if (!self || !peer) return { count: 0, reasons: [] };

  const reasons: CompatibilityReason[] = [];
  if (self.goal && peer.goal && self.goal === peer.goal) {
    reasons.push({ kind: "goal", value: peer.goal });
  }
  if (self.mood && peer.mood && self.mood === peer.mood) {
    reasons.push({ kind: "mood", value: peer.mood });
  }

  const selfInterests = new Set(
    (self.interests ?? []).map(normalizeInterest).filter(Boolean)
  );
  const addedInterests = new Set<string>();
  for (const peerInterest of peer.interests ?? []) {
    const normalized = normalizeInterest(peerInterest);
    if (
      normalized &&
      selfInterests.has(normalized) &&
      !addedInterests.has(normalized) &&
      addedInterests.size < 2
    ) {
      reasons.push({ kind: "interest", value: peerInterest.trim() || normalized });
      addedInterests.add(normalized);
    }
  }

  if (typeof peer.age === "number" && Number.isFinite(peer.age)) {
    const min = self.preferredAgeMin ?? 18;
    const max = self.preferredAgeMax ?? null;
    if (peer.age >= min && (max === null || peer.age <= max)) {
      reasons.push({ kind: "age" });
    }
  }

  const limitedReasons = reasons.slice(0, 3);
  return { count: limitedReasons.length, reasons: limitedReasons };
}

function normalizeInterest(value: string): string {
  return value.trim().toLocaleLowerCase();
}
