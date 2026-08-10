import { and, desc, eq, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import {
  type MessageRow,
  type NewMessageRow,
  type ThreadRow,
  messages,
  blockedUsers,
  messageModerationReviews,
  messageModerationStates,
  nearbyRoomMemberships,
  nearbyRooms,
  threadMembers,
  threads,
} from "../db/schema";
import type { MessageSafetyDecision, ModeratedMessageRow } from "../moderation/message-moderation.types";
import {
  NEARBY_ROOM_THREAD_SOURCE_TYPE,
  NEARBY_ROOM_THREAD_TYPE,
} from "./nearby-room-chat.types";

export type MessageInsertResult = {
  message: MessageRow;
  created: boolean;
};

export type ModeratedRoomMessageInsert = NewMessageRow & {
  moderation: MessageSafetyDecision;
  moderationSource: "nearby";
};

function isSafeNearbyRoomThread(roomId: string) {
  return and(
    eq(threads.type, NEARBY_ROOM_THREAD_TYPE),
    eq(threads.sourceType, NEARBY_ROOM_THREAD_SOURCE_TYPE),
    eq(threads.sourceId, roomId),
  );
}

export async function findSafeNearbyRoomThread(
  roomId: string,
  threadId: string,
): Promise<ThreadRow | undefined> {
  const [thread] = await db
    .select()
    .from(threads)
    .where(and(eq(threads.id, threadId), isSafeNearbyRoomThread(roomId)))
    .limit(1);

  return thread;
}

export async function findOrCreateNearbyRoomThread(
  roomId: string,
  userId: string,
  now: Date,
): Promise<ThreadRow | undefined> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${roomId}))`);

    const [room] = await tx
      .select({ threadId: nearbyRooms.threadId })
      .from(nearbyRooms)
      .where(eq(nearbyRooms.id, roomId))
      .limit(1);

    if (!room) {
      return undefined;
    }

    if (room.threadId) {
      const [existing] = await tx
        .select()
        .from(threads)
        .where(and(eq(threads.id, room.threadId), isSafeNearbyRoomThread(roomId)))
        .limit(1);

      if (!existing) {
        return undefined;
      }

      await tx
        .insert(threadMembers)
        .values({
          threadId: existing.id,
          userId,
        })
        .onConflictDoNothing();

      return existing;
    }

    const [thread] = await tx
      .insert(threads)
      .values({
        type: NEARBY_ROOM_THREAD_TYPE,
        sourceType: NEARBY_ROOM_THREAD_SOURCE_TYPE,
        sourceId: roomId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx
      .update(nearbyRooms)
      .set({
        threadId: thread.id,
        updatedAt: now,
      })
      .where(eq(nearbyRooms.id, roomId));

    await tx.insert(threadMembers).values({
      threadId: thread.id,
      userId,
      joinedAt: now,
    });

    return thread;
  });
}

export async function addNearbyRoomThreadMember(
  threadId: string,
  userId: string,
  joinedAt: Date,
): Promise<void> {
  await db
    .insert(threadMembers)
    .values({
      threadId,
      userId,
      joinedAt,
    })
    .onConflictDoNothing();
}

export async function listNearbyRoomMessages(
  threadId: string,
  limit: number,
  viewerUserId: string,
): Promise<MessageRow[]> {
  const block = alias(blockedUsers, "nearby_message_block");
  const blockedPair = db
    .select({ userId: block.userId })
    .from(block)
    .where(or(
      and(eq(block.userId, viewerUserId), eq(block.blockedUserId, messages.fromUserId)),
      and(eq(block.userId, messages.fromUserId), eq(block.blockedUserId, viewerUserId)),
    ));
  const rows = await db
    .select({ message: messages, moderation: messageModerationStates })
    .from(messages)
    .leftJoin(messageModerationStates, eq(messageModerationStates.messageId, messages.id))
    .where(and(
      eq(messages.threadId, threadId),
      or(
        eq(messages.fromUserId, viewerUserId),
        and(
          or(eq(messageModerationStates.state, "visible"), sql`${messageModerationStates.messageId} is null`),
          notExists(blockedPair),
        ),
      ),
    ))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
  return rows.map((row) => withModeration(row.message, row.moderation, viewerUserId));
}

export async function findNearbyRoomMessageByClientId(
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

export async function listAllowedNearbyRoomRecipientUserIds(
  roomId: string,
  threadId: string,
  senderUserId: string,
): Promise<string[]> {
  const block = alias(blockedUsers, "nearby_realtime_block");
  const blockedPair = db
    .select({ userId: block.userId })
    .from(block)
    .where(or(
      and(eq(block.userId, nearbyRoomMemberships.userId), eq(block.blockedUserId, senderUserId)),
      and(eq(block.userId, senderUserId), eq(block.blockedUserId, nearbyRoomMemberships.userId)),
    ));
  const rows = await db
    .select({ userId: nearbyRoomMemberships.userId })
    .from(nearbyRoomMemberships)
    .innerJoin(threadMembers, and(
      eq(threadMembers.userId, nearbyRoomMemberships.userId),
      eq(threadMembers.threadId, threadId),
    ))
    .where(and(
      eq(nearbyRoomMemberships.roomId, roomId),
      eq(nearbyRoomMemberships.status, "active"),
      notExists(blockedPair),
    ));
  return rows.map((row) => row.userId);
}

export async function createNearbyRoomMessageIdempotent(
  input: ModeratedRoomMessageInsert,
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
      throw new Error("Room message conflict target was not found after insert conflict");
    }

    const [state] = await tx.select().from(messageModerationStates)
      .where(eq(messageModerationStates.messageId, existing.id)).limit(1);
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
    text: viewerUserId === message.fromUserId && (state === "restricted" || state === "removed")
      ? ""
      : message.text,
    moderationState: state,
    automationStatus: (moderation?.automationStatus ?? "not_required") as ModeratedMessageRow["automationStatus"],
    moderationSource: "nearby",
  };
}
