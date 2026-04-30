import { unauthorized, validationError } from "../common/errors";
import { normalizeDisplayName, normalizeOptionalAbout } from "../common/validators";
import type { UserRow } from "../db/schema";
import { findUserById, updateUserProfile } from "./users.repo";

export type SelfUserProfile = {
  id: string;
  email: string;
  displayName: string;
  about: string | null;
  amoriaId: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateProfileBody = {
  displayName?: string;
  about?: string | null;
};

export function toSelfUserProfile(user: UserRow): SelfUserProfile {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    about: user.about,
    amoriaId: user.amoriaId,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export async function getCurrentUser(userId: string): Promise<SelfUserProfile> {
  const user = await findUserById(userId);
  if (!user) {
    throw unauthorized("User no longer exists");
  }

  return toSelfUserProfile(user);
}

export async function updateCurrentUserProfile(
  userId: string,
  input: UpdateProfileBody,
): Promise<SelfUserProfile> {
  const update: { displayName?: string; about?: string | null } = {};

  if ("displayName" in input) {
    update.displayName = normalizeDisplayName(input.displayName);
  }

  if ("about" in input) {
    update.about = normalizeOptionalAbout(input.about);
  }

  if (Object.keys(update).length === 0) {
    throw validationError("At least one profile field is required", {
      body: "empty",
    });
  }

  const updated = await updateUserProfile(userId, update);
  if (!updated) {
    throw unauthorized("User no longer exists");
  }

  return toSelfUserProfile(updated);
}
