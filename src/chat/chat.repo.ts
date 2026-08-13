import { and, count, desc, eq, gt, ne, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, pool } from "../db/client";
import {
  type MessageRow,
  type NewMessageRow,
  type ThreadContextRow,
  type ThreadRow,
  blockedUsers,
  directThreadPairs,
  messages,
  messageModerationReviews,
  messageModerationStates,
  threadContexts,
  threadMembers,
  threadReads,
  threads,
  nearbyRooms,
  nearbyRoomMemberships,
  users,
  type JsonValue,
} from "../db/schema";
import type {
  MessageSafetyDecision,
  ModeratedMessageRow,
} from "../moderation/message-moderation.types";
import type { ChatSourceType, ThreadPeerDto } from "./chat.types";

export type MessageInsertResult = {
  message: ModeratedMessageRow;
  created: boolean;
};

export type ModeratedMessageInsert = NewMessageRow & {
  moderation: MessageSafetyDecision;
  moderationSource: "direct" | "nearby";
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

export type InboxThreadDetail = {
  threadId: string;
  peer: ThreadPeerDto;
  lastMessage: { id: string; text: string; createdAt: Date } | null;
  unreadCount: number;
  contexts: ThreadContextRow[];
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
    .leftJoin(nearbyRooms, eq(nearbyRooms.threadId, threads.id))
    .leftJoin(
      nearbyRoomMemberships,
      and(
        eq(nearbyRoomMemberships.roomId, nearbyRooms.id),
        eq(nearbyRoomMemberships.userId, userId),
      ),
    )
    .where(and(
      eq(threads.id, threadId),
      or(
        eq(threads.type, "direct"),
        and(
          eq(threads.type, "nearby_room"),
          eq(nearbyRooms.status, "active"),
          eq(nearbyRoomMemberships.status, "active"),
        ),
      ),
    ))
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

export async function findLatestMessage(threadId: string): Promise<ModeratedMessageRow | undefined> {
  const [row] = await db
    .select({ message: messages, moderation: messageModerationStates })
    .from(messages)
    .leftJoin(messageModerationStates, eq(messageModerationStates.messageId, messages.id))
    .where(and(
      eq(messages.threadId, threadId),
      or(eq(messageModerationStates.state, "visible"), sql`${messageModerationStates.messageId} is null`),
    ))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  return row ? withModeration(row.message, row.moderation) : undefined;
}

export async function listInboxThreadDetails(
  userId: string,
  threadIds: string[],
): Promise<InboxThreadDetail[]> {
  if (!threadIds.length) return [];
  const result = await pool.query<{
    thread_id: string;
    peer_id: string;
    peer_display_name: string;
    peer_avatar_url: string | null;
    last_message_id: string | null;
    last_message_text: string | null;
    last_message_created_at: Date | null;
    unread_count: number;
    contexts: Array<{
      id: string;
      threadId: string;
      sourceType: string;
      sourceId: string;
      metadata: JsonValue | null;
      createdByUserId: string | null;
      createdAt: string;
    }>;
  }>(`
    SELECT target.thread_id,
      peer.id peer_id,peer.display_name peer_display_name,peer.avatar_url peer_avatar_url,
      latest.id last_message_id,latest.text last_message_text,latest.created_at last_message_created_at,
      COALESCE(unread.value,0)::int unread_count,COALESCE(contexts.value,'[]'::jsonb) contexts
    FROM unnest($2::uuid[]) WITH ORDINALITY target(thread_id,ordinality)
    JOIN LATERAL (
      SELECT u.id,u.display_name,u.avatar_url
      FROM thread_members tm JOIN users u ON u.id=tm.user_id
      WHERE tm.thread_id=target.thread_id AND tm.user_id<>$1 LIMIT 1
    ) peer ON true
    LEFT JOIN LATERAL (
      SELECT m.id,m.text,m.created_at
      FROM messages m LEFT JOIN message_moderation_states ms ON ms.message_id=m.id
      WHERE m.thread_id=target.thread_id AND (ms.message_id IS NULL OR ms.state='visible')
      ORDER BY m.created_at DESC,m.id DESC LIMIT 1
    ) latest ON true
    LEFT JOIN LATERAL (
      SELECT count(*) value FROM (
        SELECT 1 FROM messages m
        LEFT JOIN thread_reads r ON r.thread_id=m.thread_id AND r.user_id=$1
        LEFT JOIN message_moderation_states ms ON ms.message_id=m.id
        WHERE m.thread_id=target.thread_id AND m.from_user_id<>$1
          AND m.created_at>COALESCE(r.last_read_at,'epoch'::timestamptz)
          AND (ms.message_id IS NULL OR ms.state='visible')
        ORDER BY m.created_at DESC,m.id DESC LIMIT 1000
      ) bounded_unread
    ) unread ON true
    LEFT JOIN LATERAL (
      SELECT jsonb_agg(jsonb_build_object(
        'id',c.id,'threadId',c.thread_id,'sourceType',c.source_type,'sourceId',c.source_id,
        'metadata',c.metadata,'createdByUserId',c.created_by_user_id,'createdAt',c.created_at
      ) ORDER BY c.created_at DESC,c.id DESC) value
      FROM (SELECT * FROM thread_contexts WHERE thread_id=target.thread_id ORDER BY created_at DESC,id DESC LIMIT 20) c
    ) contexts ON true
    ORDER BY target.ordinality
  `, [userId, threadIds]);
  return result.rows.map((row) => ({
    threadId: row.thread_id,
    peer: { id: row.peer_id, displayName: row.peer_display_name, avatarUrl: row.peer_avatar_url },
    lastMessage: row.last_message_id && row.last_message_text && row.last_message_created_at
      ? { id: row.last_message_id, text: row.last_message_text, createdAt: row.last_message_created_at }
      : null,
    unreadCount: Number(row.unread_count),
    contexts: row.contexts.map((context) => ({ ...context, createdAt: new Date(context.createdAt) })),
  }));
}

export async function getUnreadCount(threadId: string, userId: string): Promise<number> {
  const [read] = await db
    .select({ lastReadAt: threadReads.lastReadAt })
    .from(threadReads)
    .where(and(eq(threadReads.threadId, threadId), eq(threadReads.userId, userId)))
    .limit(1);

  const where = read?.lastReadAt
    ? and(eq(messages.threadId, threadId), gt(messages.createdAt, read.lastReadAt), ne(messages.fromUserId, userId))
    : and(eq(messages.threadId, threadId), ne(messages.fromUserId, userId));

  const [result] = await db
    .select({ unreadCount: count(messages.id) })
    .from(messages)
    .leftJoin(messageModerationStates, eq(messageModerationStates.messageId, messages.id))
    .where(and(
      where,
      or(eq(messageModerationStates.state, "visible"), sql`${messageModerationStates.messageId} is null`),
    ));

  return Number(result?.unreadCount ?? 0);
}

export async function listMessagesForThread(
  threadId: string,
  limit: number,
  viewerUserId: string,
): Promise<ModeratedMessageRow[]> {
  const rows = await db
    .select({ message: messages, moderation: messageModerationStates })
    .from(messages)
    .leftJoin(messageModerationStates, eq(messageModerationStates.messageId, messages.id))
    .where(and(
      eq(messages.threadId, threadId),
      or(
        eq(messages.fromUserId, viewerUserId),
        eq(messageModerationStates.state, "visible"),
        sql`${messageModerationStates.messageId} is null`,
      ),
    ))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  return rows.map((row) => withModeration(row.message, row.moderation, viewerUserId));
}

export async function findMessageInThread(
  threadId: string,
  messageId: string,
): Promise<MessageRow | undefined> {
  const [message] = await db
    .select({ message: messages })
    .from(messages)
    .leftJoin(messageModerationStates, eq(messageModerationStates.messageId, messages.id))
    .where(and(
      eq(messages.threadId, threadId),
      eq(messages.id, messageId),
      or(eq(messageModerationStates.state, "visible"), sql`${messageModerationStates.messageId} is null`),
    ))
    .limit(1);

  return message?.message;
}

export async function findMessageByClientId(
  threadId: string,
  fromUserId: string,
  clientMessageId: string,
): Promise<ModeratedMessageRow | undefined> {
  const [row] = await db
    .select({ message: messages, moderation: messageModerationStates })
    .from(messages)
    .leftJoin(messageModerationStates, eq(messageModerationStates.messageId, messages.id))
    .where(and(
      eq(messages.threadId, threadId),
      eq(messages.fromUserId, fromUserId),
      eq(messages.clientMessageId, clientMessageId),
    ))
    .limit(1);
  return row ? withModeration(row.message, row.moderation, fromUserId) : undefined;
}

export async function createMessageIdempotent(
  input: ModeratedMessageInsert,
): Promise<MessageInsertResult> {
  return db.transaction(async (tx) => {
    const { moderation, moderationSource, ...messageInput } = input;
    const [created] = await tx
      .insert(messages)
      .values(messageInput)
      .onConflictDoNothing({
        target: [messages.threadId, messages.fromUserId, messages.clientMessageId],
      })
      .returning();

    if (created) {
      await tx.insert(messageModerationStates).values({
        messageId: created.id,
        state: moderation.state,
        source: moderationSource,
        automationStatus: moderation.automationStatus,
        updatedAt: created.createdAt,
      });
      if (moderation.evidence.length > 0) {
        await tx.insert(messageModerationReviews).values(
          moderation.evidence.map((evidence) => ({
            messageId: created.id,
            source: evidence.source,
            action: evidence.action,
            reason: evidence.reason,
            metadata: evidence.metadata,
            createdAt: created.createdAt,
          })),
        );
      }
      if (moderation.state === "visible") {
        await tx
          .update(threads)
          .set({
            lastMessageAt: created.createdAt,
            lastMessageText: created.text,
            updatedAt: created.createdAt,
          })
          .where(eq(threads.id, created.threadId));
      }

      return {
        message: withModeration(created, {
          messageId: created.id,
          state: moderation.state,
          source: moderationSource,
          automationStatus: moderation.automationStatus,
          updatedAt: created.createdAt,
        }, created.fromUserId),
        created: true,
      };
    }

    const [existing] = await tx
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.threadId, messageInput.threadId),
          eq(messages.fromUserId, messageInput.fromUserId),
          eq(messages.clientMessageId, messageInput.clientMessageId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Message conflict target was not found after insert conflict");
    }

    const [state] = await tx
      .select()
      .from(messageModerationStates)
      .where(eq(messageModerationStates.messageId, existing.id))
      .limit(1);
    return {
      message: withModeration(existing, state, existing.fromUserId),
      created: false,
    };
  });
}

function withModeration(
  message: MessageRow,
  moderation: typeof messageModerationStates.$inferSelect | null | undefined,
  viewerUserId?: string,
): ModeratedMessageRow {
  const state = (moderation?.state ?? "visible") as ModeratedMessageRow["moderationState"];
  return {
    ...message,
    text:
      viewerUserId === message.fromUserId && (state === "restricted" || state === "removed")
        ? ""
        : message.text,
    moderationState: state,
    automationStatus: (moderation?.automationStatus ?? "not_required") as ModeratedMessageRow["automationStatus"],
    moderationSource: (moderation?.source ?? "direct") as ModeratedMessageRow["moderationSource"],
  };
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
