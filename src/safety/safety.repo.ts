import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/client";
import {
  type BlockedUserRow,
  type NewSafetyReportRow,
  blockedUsers,
  safetyReports,
} from "../db/schema";

export async function upsertBlockedUser(
  userId: string,
  blockedUserId: string,
): Promise<void> {
  await db
    .insert(blockedUsers)
    .values({
      userId,
      blockedUserId,
    })
    .onConflictDoNothing({
      target: [blockedUsers.userId, blockedUsers.blockedUserId],
    });
}

export async function deleteBlockedUser(
  userId: string,
  blockedUserId: string,
): Promise<void> {
  await db
    .delete(blockedUsers)
    .where(and(eq(blockedUsers.userId, userId), eq(blockedUsers.blockedUserId, blockedUserId)));
}

export async function listBlockedUsers(userId: string): Promise<BlockedUserRow[]> {
  return db
    .select()
    .from(blockedUsers)
    .where(eq(blockedUsers.userId, userId))
    .orderBy(desc(blockedUsers.createdAt));
}

export async function createSafetyReport(input: NewSafetyReportRow): Promise<void> {
  await db.insert(safetyReports).values(input);
}
