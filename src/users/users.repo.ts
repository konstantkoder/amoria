import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { type UserRow, users } from "../db/schema";

export async function findUserById(userId: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({
    where: eq(users.id, userId),
  });
}

export async function findUserByAmoriaId(amoriaId: string): Promise<UserRow | undefined> {
  return db.query.users.findFirst({
    where: eq(users.amoriaId, amoriaId),
  });
}

export async function updateUserProfile(
  userId: string,
  input: Partial<Pick<
    UserRow,
    | "displayName"
    | "about"
    | "avatarUrl"
    | "photos"
    | "gender"
    | "preferredGenders"
    | "goal"
    | "mood"
    | "interests"
    | "flirtEnabled"
    | "allowAdultMode"
    | "mysteryMode"
    | "birthDate"
    | "preferredAgeMin"
    | "preferredAgeMax"
  >>,
): Promise<UserRow | undefined> {
  const [updated] = await db
    .update(users)
    .set({
      ...input,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated;
}

export async function updateUserAvatar(userId: string, avatarUrl: string): Promise<UserRow | undefined> {
  const [updated] = await db
    .update(users)
    .set({
      avatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId))
    .returning();

  return updated;
}
