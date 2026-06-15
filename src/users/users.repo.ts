import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/client";
import { type UserRow, users } from "../db/schema";

const USER_LAST_SEEN_WRITE_THROTTLE_MS = 60 * 1000;

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

export async function touchUserLastSeenAt(userId: string, seenAt = new Date()): Promise<void> {
  const staleBefore = new Date(seenAt.getTime() - USER_LAST_SEEN_WRITE_THROTTLE_MS);

  await db
    .update(users)
    .set({ lastSeenAt: seenAt })
    .where(
      and(
        eq(users.id, userId),
        or(isNull(users.lastSeenAt), lt(users.lastSeenAt, staleBefore)),
      ),
    );
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
