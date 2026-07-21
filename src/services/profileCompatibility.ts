import type { AgeGroup, Goal, Mood } from "@/models/User";

export type CompatibilitySource = "nearby" | "together" | "profile";

export type CompatibilityPeer = {
  goal?: Goal | null;
  mood?: Mood | null;
  interests?: string[];
  age?: number | null;
  ageGroup?: AgeGroup | null;
  preferredAgeMin?: number;
  preferredAgeMax?: number | null;
};

export type CompatibilitySelf = {
  goal?: Goal | null;
  mood?: Mood | null;
  interests?: string[];
  preferredAgeMin?: number;
  preferredAgeMax?: number | null;
  age?: number | null;
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

  if (
    isAgeInRange(peer.age, self.preferredAgeMin, self.preferredAgeMax) &&
    isAgeInRange(self.age, peer.preferredAgeMin, peer.preferredAgeMax)
  ) {
      reasons.push({ kind: "age" });
  }

  const limitedReasons = reasons.slice(0, 3);
  return { count: limitedReasons.length, reasons: limitedReasons };
}

function isAgeInRange(
  age: number | null | undefined,
  min: number | undefined,
  max: number | null | undefined
): boolean {
  if (typeof age !== "number" || !Number.isFinite(age)) return false;
  if (typeof min !== "number" || !Number.isFinite(min)) return false;
  if (max !== null && max !== undefined && !Number.isFinite(max)) return false;
  return age >= min && (max == null || age <= max);
}

function normalizeInterest(value: string): string {
  return value.trim().toLocaleLowerCase();
}
