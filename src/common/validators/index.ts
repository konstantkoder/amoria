import {
  ABOUT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PROFILE_GOALS,
  PROFILE_GENDERS,
  PROFILE_INTERESTS_MAX_COUNT,
  PROFILE_INTEREST_MAX_LENGTH,
  PROFILE_MOODS,
  PROFILE_PHOTOS_MAX_COUNT,
  PROFILE_URL_MAX_LENGTH,
} from "../../config/constants";
import { validationError } from "../errors";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const profileInterestCoordinatePairPattern =
  /^[-+]?(?:[0-8]?\d(?:\.\d+)?|90(?:\.0+)?)[,\s;]+[-+]?(?:1[0-7]\d(?:\.\d+)?|[0-9]?\d(?:\.\d+)?|180(?:\.0+)?)$/;
const profileInterestPrivatePattern =
  /(?:[^\s@]+@[^\s@]+\.[^\s@]+)|(?:\+?\d[\d\s().-]{6,}\d)|\b(?:password|token|secret|jwt|refresh|access)\b/i;
const profileInterestLocationWordsPattern =
  /\b(?:lat|latitude|lng|longitude|coordinates?|coords?|gps)\b/i;

export type ProfileGoal = (typeof PROFILE_GOALS)[number];
export type ProfileGender = (typeof PROFILE_GENDERS)[number];
export type ProfileMood = (typeof PROFILE_MOODS)[number];
export type ProfilePhotoInput = {
  mediaId: string;
};

export function normalizeEmail(email: unknown): string {
  if (typeof email !== "string") {
    throw validationError("Email is required", { email: "required" });
  }

  const normalized = email.trim().toLowerCase();
  if (!emailPattern.test(normalized)) {
    throw validationError("Email is invalid", { email: "invalid" });
  }

  return normalized;
}

export function normalizePassword(password: unknown): string {
  if (typeof password !== "string") {
    throw validationError("Password is required", { password: "required" });
  }

  if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
    throw validationError(`Password must be ${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} characters`, {
      password: "invalid_length",
    });
  }

  return password;
}

export function normalizeDisplayName(displayName: unknown): string {
  if (typeof displayName !== "string") {
    throw validationError("Display name is required", { displayName: "required" });
  }

  const normalized = displayName.trim();
  if (
    normalized.length < DISPLAY_NAME_MIN_LENGTH ||
    normalized.length > DISPLAY_NAME_MAX_LENGTH
  ) {
    throw validationError(
      `Display name must be ${DISPLAY_NAME_MIN_LENGTH}-${DISPLAY_NAME_MAX_LENGTH} characters`,
      { displayName: "invalid_length" },
    );
  }

  return normalized;
}

export function normalizeOptionalAbout(about: unknown): string | null | undefined {
  if (about === undefined) {
    return undefined;
  }

  if (about === null) {
    return null;
  }

  if (typeof about !== "string") {
    throw validationError("About must be text", { about: "invalid" });
  }

  const normalized = about.trim();
  if (normalized.length > ABOUT_MAX_LENGTH) {
    throw validationError(`About must be ${ABOUT_MAX_LENGTH} characters or fewer`, {
      about: "too_long",
    });
  }

  return normalized.length === 0 ? null : normalized;
}

export function normalizeOptionalUrl(value: unknown, field: string): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw validationError(`${field} must be a URL`, { [field]: "invalid" });
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (normalized.length > PROFILE_URL_MAX_LENGTH) {
    throw validationError(`${field} must be ${PROFILE_URL_MAX_LENGTH} characters or fewer`, {
      [field]: "too_long",
    });
  }

  try {
    new URL(normalized);
  } catch {
    throw validationError(`${field} must be a valid URL`, { [field]: "invalid" });
  }

  return normalized;
}

export function normalizeOptionalPhotos(value: unknown): ProfilePhotoInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw validationError("Photos must be an array", { photos: "invalid" });
  }

  if (value.length > PROFILE_PHOTOS_MAX_COUNT) {
    throw validationError(`Photos must contain ${PROFILE_PHOTOS_MAX_COUNT} items or fewer`, {
      photos: "too_many",
    });
  }

  return value.map((item, index) => {
    const prefix = `photos.${index}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw validationError("Photo must be an object", { [prefix]: "invalid" });
    }

    const candidate = item as { mediaId?: unknown };
    if (typeof candidate.mediaId !== "string" || !uuidPattern.test(candidate.mediaId.trim())) {
      throw validationError("Photo mediaId must be a UUID", { [`${prefix}.mediaId`]: "invalid" });
    }

    return {
      mediaId: candidate.mediaId.trim(),
    };
  });
}

export function normalizeOptionalInterests(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw validationError("Interests must be an array", { interests: "invalid" });
  }

  if (value.length > PROFILE_INTERESTS_MAX_COUNT) {
    throw validationError(
      `Interests must contain ${PROFILE_INTERESTS_MAX_COUNT} items or fewer`,
      { interests: "too_many" },
    );
  }

  const normalized: string[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string") {
      throw validationError("Interest must be text", { [`interests.${index}`]: "invalid" });
    }

    const interest = normalizeProfileInterest(item);
    if (!interest) {
      throw validationError("Interest must not be empty", { [`interests.${index}`]: "empty" });
    }

    if (interest.length > PROFILE_INTEREST_MAX_LENGTH) {
      throw validationError(
        `Interest must be ${PROFILE_INTEREST_MAX_LENGTH} characters or fewer`,
        { [`interests.${index}`]: "too_long" },
      );
    }

    if (isUnsafeProfileInterest(interest)) {
      throw validationError("Interest is not allowed", { [`interests.${index}`]: "unsafe" });
    }

    if (!normalized.includes(interest)) {
      normalized.push(interest);
    }
  }

  return normalized;
}

function normalizeProfileInterest(value: string): string {
  return value
    .trim()
    .replace(/^#+/, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function isUnsafeProfileInterest(value: string): boolean {
  if (profileInterestCoordinatePairPattern.test(value)) {
    return true;
  }

  if (profileInterestPrivatePattern.test(value)) {
    return true;
  }

  if (profileInterestLocationWordsPattern.test(value)) {
    return true;
  }

  return value.includes("координат") || value.includes("геолокац");
}

export function normalizeOptionalGoal(value: unknown): ProfileGoal | null | undefined {
  return normalizeOptionalEnum(value, "goal", PROFILE_GOALS);
}

export function normalizeOptionalGender(value: unknown): ProfileGender | null | undefined {
  return normalizeOptionalEnum(value, "gender", PROFILE_GENDERS);
}

export function normalizeOptionalPreferredGenders(value: unknown): ProfileGender[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw validationError("Preferred genders must be an array", {
      preferredGenders: "invalid",
    });
  }

  const normalized: ProfileGender[] = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !PROFILE_GENDERS.includes(item as ProfileGender)) {
      throw validationError("Preferred gender is invalid", {
        [`preferredGenders.${index}`]: "invalid",
      });
    }

    const gender = item as ProfileGender;
    if (!normalized.includes(gender)) {
      normalized.push(gender);
    }
  }

  return normalized;
}

export function normalizeOptionalMood(value: unknown): ProfileMood | null | undefined {
  return normalizeOptionalEnum(value, "mood", PROFILE_MOODS);
}

export function normalizeOptionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "boolean") {
    throw validationError(`${field} must be a boolean`, { [field]: "invalid" });
  }

  return value;
}

function normalizeOptionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw validationError(`${field} is invalid`, { [field]: "invalid" });
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!allowed.includes(normalized as T)) {
    throw validationError(`${field} is invalid`, { [field]: "invalid" });
  }

  return normalized as T;
}
