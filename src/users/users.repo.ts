import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "../db/client";
import { pool } from "../db/client";
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

export type UserAccessState = {
  accountStatus: string;
  authVersion: number;
  lastSeenAt: Date | null;
};

export async function findUserAccessState(userId: string): Promise<UserAccessState | undefined> {
  const row = await db.query.users.findFirst({
    columns: { accountStatus: true, authVersion: true, lastSeenAt: true },
    where: eq(users.id, userId),
  });
  return row;
}

export async function findUserAccountStatus(userId: string): Promise<string | undefined> {
  return (await findUserAccessState(userId))?.accountStatus;
}

export async function hasUnrevealedTurnBasedPair(userId:string,targetUserId:string):Promise<boolean>{
  const result=await pool.query(`
    SELECT 1 FROM together_turn_based_moments m
    JOIN together_turn_based_participants a ON a.moment_id=m.id AND a.user_id=$1
    JOIN together_turn_based_participants b ON b.moment_id=m.id AND b.user_id=$2
    WHERE NOT EXISTS(
      SELECT 1 FROM together_reveals r
      WHERE r.session_id=CASE WHEN m.story_session_id IS NOT NULL THEN m.story_session_id ELSE m.draw_session_id END
        AND r.decision='open'
      GROUP BY r.session_id HAVING count(*)=2
    ) LIMIT 1`,[userId,targetUserId]);
  return Boolean(result.rowCount);
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

export async function touchUserLastSeenAt(
  userId: string,
  seenAt = new Date(),
  throttleMs = USER_LAST_SEEN_WRITE_THROTTLE_MS,
): Promise<void> {
  const staleBefore = new Date(seenAt.getTime() - throttleMs);

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
