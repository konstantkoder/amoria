import type { ProfileGender } from "@/models/User";

const PROFILE_GENDER_ALIASES: Readonly<Record<string, ProfileGender>> = {
  woman: "woman",
  women: "woman",
  female: "woman",
  man: "man",
  men: "man",
  male: "man",
  nonbinary: "nonbinary",
  "non-binary": "nonbinary",
  other: "nonbinary",
};

/**
 * Normalizes API and legacy gender values without guessing. The product's
 * existing public "Other" choice uses the canonical `nonbinary` value.
 */
export function normalizeProfileGender(value: unknown): ProfileGender | null | undefined {
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase();
  return PROFILE_GENDER_ALIASES[normalized];
}

export function normalizePreferredProfileGenders(value: unknown): ProfileGender[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const normalized: ProfileGender[] = [];
  for (const item of value) {
    const gender = normalizeProfileGender(item);
    if (gender && !normalized.includes(gender)) normalized.push(gender);
  }
  return normalized;
}
