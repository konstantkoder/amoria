import {
  ABOUT_MAX_LENGTH,
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../config/constants";
import { validationError } from "../errors";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
