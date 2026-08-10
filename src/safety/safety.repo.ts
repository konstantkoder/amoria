import { and, desc, eq, or, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  type BlockedUserRow,
  type NewSafetyReportRow,
  blockedUsers,
  messageModerationReviews,
  messageModerationStates,
  messages,
  safetyReports,
  threadMembers,
  threads,
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

export async function isBlockedEitherWay(
  aUserId: string,
  bUserId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ userId: blockedUsers.userId })
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.userId, aUserId), eq(blockedUsers.blockedUserId, bUserId)),
        and(eq(blockedUsers.userId, bUserId), eq(blockedUsers.blockedUserId, aUserId)),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function createSafetyReport(input: NewSafetyReportRow) {
  const [created] = await db.insert(safetyReports).values(input).returning();
  return created;
}

export async function findReportableMessage(messageId: string, reporterUserId: string) {
  const [row] = await db
    .select({
      message: messages,
      threadType: threads.type,
      moderationState: messageModerationStates.state,
    })
    .from(messages)
    .innerJoin(threads, eq(threads.id, messages.threadId))
    .innerJoin(
      threadMembers,
      and(eq(threadMembers.threadId, messages.threadId), eq(threadMembers.userId, reporterUserId)),
    )
    .leftJoin(messageModerationStates, eq(messageModerationStates.messageId, messages.id))
    .where(and(
      eq(messages.id, messageId),
      or(
        eq(messages.fromUserId, reporterUserId),
        eq(messageModerationStates.state, "visible"),
        sql`${messageModerationStates.messageId} is null`,
      ),
    ))
    .limit(1);
  return row;
}

export async function createMessageSafetyReport(input: {
  reporterUserId: string;
  messageId: string;
  targetOwnerUserId: string;
  reason: string;
  comment: string | null;
  source: "direct" | "nearby";
}) {
  return db.transaction(async (tx) => {
    const [report] = await tx.insert(safetyReports).values({
      reporterUserId: input.reporterUserId,
      targetType: "message",
      targetId: input.messageId,
      targetOwnerUserId: input.targetOwnerUserId,
      reason: input.reason,
      comment: input.comment,
    }).returning();
    await tx.insert(messageModerationReviews).values({
      messageId: input.messageId,
      source: "user_report",
      action: "flag",
      reason: input.reason,
      metadata: {
        reportId: report.id,
        source: input.source,
      },
    });
    return report;
  });
}
