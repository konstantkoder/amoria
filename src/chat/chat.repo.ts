import { and, count, desc, eq, gt, ne, notExists, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import {
  type MessageRow,
  type NewMessageRow,
  type ThreadContextRow,
  type ThreadRow,
  blockedUsers,
  directThreadPairs,
  messages,
  threadContexts,
  threadMembers,
  threadReads,
  threads,
  users,
  type JsonValue,
} from "../db/schema";
import type { ChatSourceType, ThreadPeerDto } from "./chat.types";

export type MessageInsertResult = {
  message: MessageRow;
  created: boolean;
};

export type DirectThreadResult = {
  thread: ThreadRow;
  created: boolean;
};

export type ThreadSourceInput = {
  type: ChatSourceType;
  sourceId: string;
  metadata?: JsonValue | null;
};

function directPairFor(userId: string, peerUserId: string) {
  return userId < peerUserId
    ? { userAId: userId, userBId: peerUserId }
    : { userAId: peerUserId, userBId: userId };
}

export async function findDirectThreadBetween(
  userId: string,
  peerUserId: string,
): Promise<ThreadRow | undefined> {
  const pair = directPairFor(userId, peerUserId);
  const [pairRow] = await db
    .select({ thread: threads })
    .from(directThreadPairs)
    .innerJoin(threads, eq(threads.id, directThreadPairs.threadId))
    .where(
      and(
        eq(directThreadPairs.userAId, pair.userAId),
        eq(directThreadPairs.userBId, pair.userBId),
      ),
    )
    .limit(1);

  if (pairRow?.thread) {
    return pairRow.thread;
  }

  const meMember = alias(threadMembers, "me_member");
  const peerMember = alias(threadMembers, "peer_member");

  const [row] = await db
    .select({ thread: threads })
    .from(threads)
    .innerJoin(
      meMember,
      and(eq(meMember.threadId, threads.id), eq(meMember.userId, userId)),
    )
    .innerJoin(
      peerMember,
      and(eq(peerMember.threadId, threads.id), eq(peerMember.userId, peerUserId)),
    )
    .where(eq(threads.type, "direct"))
    .limit(1);

  return row?.thread;
}

export async function findDirectThreadBySource(
  source: { type: ChatSourceType; sourceId: string },
): Promise<ThreadRow | undefined> {
  const [contextRow] = await db
    .select({ thread: threads })
    .from(threadContexts)
    .innerJoin(threads, eq(threads.id, threadContexts.threadId))
    .where(
      and(
        eq(threads.type, "direct"),
        eq(threadContexts.sourceType, source.type),
        eq(threadContexts.sourceId, source.sourceId),
      ),
    )
    .orderBy(desc(threadContexts.createdAt))
    .limit(1);

  if (contextRow?.thread) {
    return contextRow.thread;
  }

  const [thread] = await db
    .select()
    .from(threads)
    .where(
      and(
        eq(threads.type, "direct"),
        eq(threads.sourceType, source.type),
        eq(threads.sourceId, source.sourceId),
      ),
    )
    .limit(1);

  return thread;
}

export async function findOrCreateDirectThreadBetween(
  userId: string,
  peerUserId: string,
): Promise<DirectThreadResult> {
  const pair = directPairFor(userId, peerUserId);
  const pairKey = `${pair.userAId}:${pair.userBId}`;

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pairKey}))`);

    const [existingPair] = await tx
      .select({ thread: threads })
      .from(directThreadPairs)
      .innerJoin(threads, eq(threads.id, directThreadPairs.threadId))
      .where(
        and(
          eq(directThreadPairs.userAId, pair.userAId),
          eq(directThreadPairs.userBId, pair.userBId),
        ),
      )
      .limit(1);

    if (existingPair?.thread) {
      return {
        thread: existingPair.thread,
        created: false,
      };
    }

    const meMember = alias(threadMembers, "tx_me_member");
    const peerMember = alias(threadMembers, "tx_peer_member");
    const [legacy] = await tx
      .select({ thread: threads })
      .from(threads)
      .innerJoin(
        meMember,
        and(eq(meMember.threadId, threads.id), eq(meMember.userId, userId)),
      )
      .innerJoin(
        peerMember,
        and(eq(peerMember.threadId, threads.id), eq(peerMember.userId, peerUserId)),
      )
      .where(eq(threads.type, "direct"))
      .limit(1);

    if (legacy?.thread) {
      await tx
        .insert(directThreadPairs)
        .values({
          userAId: pair.userAId,
          userBId: pair.userBId,
          threadId: legacy.thread.id,
        })
        .onConflictDoNothing();

      return {
        thread: legacy.thread,
        created: false,
      };
    }

    const [thread] = await tx
      .insert(threads)
      .values({
        type: "direct",
      })
      .returning();

    await tx.insert(threadMembers).values([
      {
        threadId: thread.id,
        userId,
      },
      {
        threadId: thread.id,
        userId: peerUserId,
      },
    ]);

    await tx.insert(directThreadPairs).values({
      userAId: pair.userAId,
      userBId: pair.userBId,
      threadId: thread.id,
    });

    return {
      thread,
      created: true,
    };
  });
}

export async function setThreadSourceIfEmpty(
  thread: ThreadRow,
  source: { type: ChatSourceType; sourceId: string },
): Promise<ThreadRow> {
  if (thread.sourceType || thread.sourceId) {
    return thread;
  }

  const [updated] = await db
    .update(threads)
    .set({
      sourceType: source.type,
      sourceId: source.sourceId,
      updatedAt: new Date(),
    })
    .where(and(eq(threads.id, thread.id), sql`${threads.sourceType} is null`))
    .returning();

  return updated ?? thread;
}

export async function addThreadContext(
  threadId: string,
  source: ThreadSourceInput,
  createdByUserId?: string,
): Promise<void> {
  await db
    .insert(threadContexts)
    .values({
      threadId,
      sourceType: source.type,
      sourceId: source.sourceId,
      metadata: source.metadata ?? null,
      createdByUserId,
    })
    .onConflictDoNothing({
      target: [
        threadContexts.threadId,
        threadContexts.sourceType,
        threadContexts.sourceId,
      ],
    });
}

export async function listThreadContexts(threadId: string): Promise<ThreadContextRow[]> {
  return db
    .select()
    .from(threadContexts)
    .where(eq(threadContexts.threadId, threadId))
    .orderBy(desc(threadContexts.createdAt), desc(threadContexts.id));
}

export async function findThreadForMember(
  threadId: string,
  userId: string,
): Promise<ThreadRow | undefined> {
  const [row] = await db
    .select({ thread: threads })
    .from(threads)
    .innerJoin(
      threadMembers,
      and(eq(threadMembers.threadId, threads.id), eq(threadMembers.userId, userId)),
    )
    .where(and(eq(threads.id, threadId), eq(threads.type, "direct")))
    .limit(1);

  return row?.thread;
}

export async function isThreadMember(threadId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ threadId: threadMembers.threadId })
    .from(threads)
    .innerJoin(
      threadMembers,
      and(eq(threadMembers.threadId, threads.id), eq(threadMembers.userId, userId)),
    )
    .where(and(eq(threads.id, threadId), eq(threads.type, "direct")))
    .limit(1);

  return Boolean(row);
}

export async function listThreadsForUser(userId: string, limit: number): Promise<ThreadRow[]> {
  const blockedPeerMember = alias(threadMembers, "blocked_peer_member");
  const inboxBlock = alias(blockedUsers, "inbox_block");
  const blockedPeerSubquery = db
    .select({ blockedUserId: inboxBlock.blockedUserId })
    .from(blockedPeerMember)
    .innerJoin(
      inboxBlock,
      and(
        eq(inboxBlock.userId, userId),
        eq(inboxBlock.blockedUserId, blockedPeerMember.userId),
      ),
    )
    .where(
      and(
        eq(blockedPeerMember.threadId, threads.id),
        ne(blockedPeerMember.userId, userId),
      ),
    );

  const rows = await db
    .select({ thread: threads })
    .from(threads)
    .innerJoin(
      threadMembers,
      and(eq(threadMembers.threadId, threads.id), eq(threadMembers.userId, userId)),
    )
    .where(and(eq(threads.type, "direct"), notExists(blockedPeerSubquery)))
    .orderBy(sql`${threads.lastMessageAt} desc nulls last`, desc(threads.updatedAt))
    .limit(limit);

  return rows.map((row) => row.thread);
}

export async function findThreadPeer(
  threadId: string,
  userId: string,
): Promise<ThreadPeerDto | undefined> {
  const [peer] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(threadMembers)
    .innerJoin(users, eq(users.id, threadMembers.userId))
    .where(and(eq(threadMembers.threadId, threadId), ne(threadMembers.userId, userId)))
    .limit(1);

  return peer;
}

export async function findUserPeerById(userId: string): Promise<ThreadPeerDto | undefined> {
  const [user] = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return user;
}

export async function findLatestMessage(threadId: string): Promise<MessageRow | undefined> {
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  return message;
}

export async function getUnreadCount(threadId: string, userId: string): Promise<number> {
  const [read] = await db
    .select({ lastReadAt: threadReads.lastReadAt })
    .from(threadReads)
    .where(and(eq(threadReads.threadId, threadId), eq(threadReads.userId, userId)))
    .limit(1);

  const where = read?.lastReadAt
    ? and(eq(messages.threadId, threadId), gt(messages.createdAt, read.lastReadAt))
    : eq(messages.threadId, threadId);

  const [result] = await db
    .select({ unreadCount: count(messages.id) })
    .from(messages)
    .where(where);

  return Number(result?.unreadCount ?? 0);
}

export async function listMessagesForThread(
  threadId: string,
  limit: number,
): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
}

export async function findMessageInThread(
  threadId: string,
  messageId: string,
): Promise<MessageRow | undefined> {
  const [message] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.threadId, threadId), eq(messages.id, messageId)))
    .limit(1);

  return message;
}

export async function createMessageIdempotent(
  input: NewMessageRow,
): Promise<MessageInsertResult> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(messages)
      .values(input)
      .onConflictDoNothing({
        target: [messages.threadId, messages.fromUserId, messages.clientMessageId],
      })
      .returning();

    if (created) {
      await tx
        .update(threads)
        .set({
          lastMessageAt: created.createdAt,
          lastMessageText: created.text,
          updatedAt: created.createdAt,
        })
        .where(eq(threads.id, created.threadId));

      return {
        message: created,
        created: true,
      };
    }

    const [existing] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.threadId, input.threadId),
          eq(messages.fromUserId, input.fromUserId),
          eq(messages.clientMessageId, input.clientMessageId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Message conflict target was not found after insert conflict");
    }

    return {
      message: existing,
      created: false,
    };
  });
}

export async function upsertThreadRead(
  threadId: string,
  userId: string,
  lastReadMessageId: string | undefined,
): Promise<void> {
  const lastReadAt = new Date();

  await db
    .insert(threadReads)
    .values({
      threadId,
      userId,
      lastReadAt,
      lastReadMessageId,
    })
    .onConflictDoUpdate({
      target: [threadReads.threadId, threadReads.userId],
      set: {
        lastReadAt,
        lastReadMessageId,
      },
    });
}

export async function listThreadMemberUserIds(threadId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: threadMembers.userId })
    .from(threadMembers)
    .where(eq(threadMembers.threadId, threadId));

  return rows.map((row) => row.userId);
}
