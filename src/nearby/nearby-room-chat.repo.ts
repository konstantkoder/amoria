import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import {
  type MessageRow,
  type NewMessageRow,
  type ThreadRow,
  messages,
  nearbyRooms,
  threadMembers,
  threads,
} from "../db/schema";
import {
  NEARBY_ROOM_THREAD_SOURCE_TYPE,
  NEARBY_ROOM_THREAD_TYPE,
} from "./nearby-room-chat.types";

export type MessageInsertResult = {
  message: MessageRow;
  created: boolean;
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
): Promise<MessageRow[]> {
  return db
    .select()
    .from(messages)
    .where(eq(messages.threadId, threadId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(limit);
}

export async function createNearbyRoomMessageIdempotent(
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
      throw new Error("Room message conflict target was not found after insert conflict");
    }

    return {
      message: existing,
      created: false,
    };
  });
}
