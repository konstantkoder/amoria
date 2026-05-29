import {
  AGE_GROUPS,
  MAX_PROFILE_AGE,
  MIN_ADULT_AGE,
} from "../config/constants";
import { validationError } from "../common/errors";

export type AgeGroup = (typeof AGE_GROUPS)[number];

export type PreferredAgeRange = {
  min: number;
  max: number | null;
};

export const DEFAULT_PREFERRED_AGE_RANGE: PreferredAgeRange = {
  min: MIN_ADULT_AGE,
  max: null,
};

export function normalizeOptionalBirthDate(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return normalizeBirthDate(value);
}

export function normalizeBirthDate(value: unknown): string {
  if (typeof value !== "string") {
    throw validationError("Birth date is invalid", { birthDate: "invalid" });
  }

  const normalized = value.trim();
  if (!isValidIsoDateOnly(normalized)) {
    throw validationError("Birth date is invalid", { birthDate: "invalid" });
  }

  const age = calculateAge(normalized);
  if (age === null) {
    throw validationError("Birth date is invalid", { birthDate: "invalid" });
  }
  if (age < 0) {
    throw validationError("Birth date cannot be in the future", { birthDate: "future" });
  }
  if (age > MAX_PROFILE_AGE) {
    throw validationError("Birth date is outside the supported age range", {
      birthDate: "unreasonable_age",
    });
  }

  return normalized;
}

export function requireAdultAgeFromBirthDate(value: string | null | undefined): number {
  if (!value) {
    throw validationError("Birth date is required before Together matching", {
      birthDate: "required",
    });
  }

  const normalized = normalizeBirthDate(value);
  const age = calculateAge(normalized);
  if (age === null) {
    throw validationError("Birth date is invalid", { birthDate: "invalid" });
  }
  if (age < MIN_ADULT_AGE) {
    throw validationError("Together is available only for adults", {
      age: "underage",
    });
  }

  return age;
}

export function calculateAge(birthDate: string | null | undefined, now = new Date()): number | null {
  if (!birthDate || !isValidIsoDateOnly(birthDate)) {
    return null;
  }

  const [year, month, day] = birthDate.split("-").map((part) => Number(part));
  const nowYear = now.getUTCFullYear();
  const nowMonth = now.getUTCMonth() + 1;
  const nowDay = now.getUTCDate();
  let age = nowYear - year;
  if (nowMonth < month || (nowMonth === month && nowDay < day)) {
    age -= 1;
  }
  return age;
}

export function getAgeGroup(age: number | null | undefined): AgeGroup | null {
  if (typeof age !== "number" || !Number.isFinite(age) || age < MIN_ADULT_AGE) {
    return null;
  }

  if (age <= 24) return "18-24";
  if (age <= 34) return "25-34";
  if (age <= 44) return "35-44";
  if (age <= 54) return "45-54";
  return "55+";
}

export function normalizePreferredAgeRange(
  value: unknown,
  fallback: PreferredAgeRange = DEFAULT_PREFERRED_AGE_RANGE,
): PreferredAgeRange {
  if (value === undefined || value === null) {
    return normalizePreferredAgeBounds(fallback.min, fallback.max);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("Preferred age range is invalid", {
      preferredAgeRange: "invalid",
    });
  }

  const input = value as { min?: unknown; max?: unknown };
  return normalizePreferredAgeBounds(input.min, input.max);
}

export function normalizePreferredAgeBounds(
  minValue: unknown,
  maxValue: unknown,
): PreferredAgeRange {
  const min = normalizeAgeBound(minValue, "preferredAgeMin");
  const max = maxValue === null || maxValue === undefined
    ? null
    : normalizeAgeBound(maxValue, "preferredAgeMax");

  if (max !== null && max < min) {
    throw validationError("Preferred age range is invalid", {
      preferredAgeMax: "less_than_min",
    });
  }

  return { min, max };
}

export function isAgeInsidePreferredRange(
  age: number | null | undefined,
  range: PreferredAgeRange,
): boolean {
  if (typeof age !== "number" || !Number.isFinite(age) || age < MIN_ADULT_AGE) {
    return false;
  }
  if (age < range.min) {
    return false;
  }
  if (range.max !== null && age > range.max) {
    return false;
  }
  return true;
}

function normalizeAgeBound(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw validationError("Preferred age range is invalid", { [field]: "invalid" });
  }
  if (value < MIN_ADULT_AGE || value > MAX_PROFILE_AGE) {
    throw validationError("Preferred age range is outside the supported age range", {
      [field]: "out_of_range",
    });
  }
  return value;
}

function isValidIsoDateOnly(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
