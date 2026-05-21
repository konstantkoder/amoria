import { and, asc, count, desc, eq, gt, inArray, lt, lte, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import {
  type NewTogetherEventRow,
  type TogetherEventRow,
  type TogetherQueueRow,
  type TogetherRevealRow,
  type TogetherSessionRow,
  togetherEvents,
  togetherQueue,
  togetherReveals,
  togetherSessionMembers,
  togetherSessions,
  users,
} from "../db/schema";
import type { TogetherParticipantDto } from "./together.types";

export type EnqueueInput = {
  userId: string;
  activity: string;
  expiresAt: Date;
  promptText: string;
  deadlineAt?: Date | null;
};

export type EventInsertResult = {
  event: TogetherEventRow;
  created: boolean;
};

export type HistorySessionRow = {
  session: TogetherSessionRow;
  peer: TogetherParticipantDto;
};

export type CreateStoryContinuationInput = {
  sourceSessionId: string;
  memberUserIds: string[];
  promptText: string;
};

export async function enqueueAndMatch(input: EnqueueInput): Promise<TogetherQueueRow> {
  const now = new Date();

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);

    await tx
      .update(togetherQueue)
      .set({ status: "expired" })
      .where(and(eq(togetherQueue.status, "waiting"), lte(togetherQueue.expiresAt, now)));

    const [existing] = await tx
      .select()
      .from(togetherQueue)
      .where(
        and(
          eq(togetherQueue.userId, input.userId),
          eq(togetherQueue.status, "waiting"),
          gt(togetherQueue.expiresAt, now),
        ),
      )
      .orderBy(desc(togetherQueue.createdAt))
      .limit(1)
      .for("update");

    if (existing) {
      return existing;
    }

    const [peer] = await tx
      .select()
      .from(togetherQueue)
      .where(
        and(
          eq(togetherQueue.activity, input.activity),
          eq(togetherQueue.status, "waiting"),
          ne(togetherQueue.userId, input.userId),
          gt(togetherQueue.expiresAt, now),
        ),
      )
      .orderBy(asc(togetherQueue.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });

    const [entry] = await tx
      .insert(togetherQueue)
      .values({
        userId: input.userId,
        activity: input.activity,
        expiresAt: input.expiresAt,
      })
      .returning();

    if (!peer) {
      return entry;
    }

    const [session] = await tx
      .insert(togetherSessions)
      .values({
        activity: input.activity,
        promptText: input.promptText,
        deadlineAt: input.deadlineAt ?? null,
      })
      .returning();

    await tx.insert(togetherSessionMembers).values([
      {
        sessionId: session.id,
        userId: peer.userId,
        lastSeenAt: now,
      },
      {
        sessionId: session.id,
        userId: input.userId,
        lastSeenAt: now,
      },
    ]);

    await tx
      .update(togetherQueue)
      .set({
        status: "matched",
        matchedSessionId: session.id,
      })
      .where(eq(togetherQueue.id, peer.id));

    const [matchedEntry] = await tx
      .update(togetherQueue)
      .set({
        status: "matched",
        matchedSessionId: session.id,
      })
      .where(eq(togetherQueue.id, entry.id))
      .returning();

    return matchedEntry;
  });
}

export async function findQueueEntryForOwner(
  entryId: string,
  userId: string,
): Promise<TogetherQueueRow | undefined> {
  await expireWaitingEntries(new Date());

  const [entry] = await db
    .select()
    .from(togetherQueue)
    .where(and(eq(togetherQueue.id, entryId), eq(togetherQueue.userId, userId)))
    .limit(1);

  return entry;
}

export async function cancelQueueEntryForOwner(
  entryId: string,
  userId: string,
): Promise<TogetherQueueRow | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(togetherQueue)
      .set({ status: "expired" })
      .where(and(eq(togetherQueue.status, "waiting"), lte(togetherQueue.expiresAt, now)));

    const [entry] = await tx
      .select()
      .from(togetherQueue)
      .where(and(eq(togetherQueue.id, entryId), eq(togetherQueue.userId, userId)))
      .limit(1)
      .for("update");

    if (!entry) {
      return undefined;
    }

    if (entry.status !== "waiting") {
      return entry;
    }

    const [cancelled] = await tx
      .update(togetherQueue)
      .set({ status: "cancelled" })
      .where(eq(togetherQueue.id, entry.id))
      .returning();

    return cancelled;
  });
}

export async function findSessionForMember(
  sessionId: string,
  userId: string,
): Promise<TogetherSessionRow | undefined> {
  const [row] = await db
    .select({ session: togetherSessions })
    .from(togetherSessions)
    .innerJoin(
      togetherSessionMembers,
      and(
        eq(togetherSessionMembers.sessionId, togetherSessions.id),
        eq(togetherSessionMembers.userId, userId),
      ),
    )
    .where(eq(togetherSessions.id, sessionId))
    .limit(1);

  return row?.session;
}

export async function isSessionMember(sessionId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ sessionId: togetherSessionMembers.sessionId })
    .from(togetherSessionMembers)
    .where(
      and(
        eq(togetherSessionMembers.sessionId, sessionId),
        eq(togetherSessionMembers.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function listSessionParticipants(
  sessionId: string,
): Promise<TogetherParticipantDto[]> {
  return db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
    })
    .from(togetherSessionMembers)
    .innerJoin(users, eq(users.id, togetherSessionMembers.userId))
    .where(eq(togetherSessionMembers.sessionId, sessionId))
    .orderBy(asc(users.displayName));
}

export async function listSessionMemberUserIds(sessionId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: togetherSessionMembers.userId })
    .from(togetherSessionMembers)
    .where(eq(togetherSessionMembers.sessionId, sessionId));

  return rows.map((row) => row.userId);
}

export async function countSessionEvents(sessionId: string): Promise<number> {
  const [result] = await db
    .select({ eventCount: count(togetherEvents.id) })
    .from(togetherEvents)
    .where(eq(togetherEvents.sessionId, sessionId));

  return Number(result?.eventCount ?? 0);
}

export async function createEventIdempotent(
  input: NewTogetherEventRow,
): Promise<EventInsertResult> {
  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(togetherEvents)
      .values(input)
      .onConflictDoNothing({
        target: [
          togetherEvents.sessionId,
          togetherEvents.fromUserId,
          togetherEvents.clientEventId,
        ],
      })
      .returning();

    if (created) {
      return {
        event: created,
        created: true,
      };
    }

    const [existing] = await tx
      .select()
      .from(togetherEvents)
      .where(
        and(
          eq(togetherEvents.sessionId, input.sessionId),
          eq(togetherEvents.fromUserId, input.fromUserId),
          eq(togetherEvents.clientEventId, input.clientEventId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error("Together event conflict target was not found after insert conflict");
    }

    return {
      event: existing,
      created: false,
    };
  });
}

export async function findStoryChoiceEventForRound(
  sessionId: string,
  fromUserId: string,
  roundId: string,
): Promise<TogetherEventRow | undefined> {
  const [event] = await db
    .select()
    .from(togetherEvents)
    .where(
      and(
        eq(togetherEvents.sessionId, sessionId),
        eq(togetherEvents.fromUserId, fromUserId),
        eq(togetherEvents.type, "story_choice"),
        sql`${togetherEvents.payload}->>'roundId' = ${roundId}`,
      ),
    )
    .orderBy(asc(togetherEvents.createdAt), asc(togetherEvents.id))
    .limit(1);

  return event;
}

export async function listSessionEventsForMember(
  userId: string,
  sessionId: string,
): Promise<TogetherEventRow[] | undefined> {
  return db.transaction(async (tx) => {
    const [member] = await tx
      .select({ sessionId: togetherSessionMembers.sessionId })
      .from(togetherSessionMembers)
      .where(
        and(
          eq(togetherSessionMembers.sessionId, sessionId),
          eq(togetherSessionMembers.userId, userId),
        ),
      )
      .limit(1);

    if (!member) {
      return undefined;
    }

    return tx
      .select()
      .from(togetherEvents)
      .where(eq(togetherEvents.sessionId, sessionId))
      .orderBy(asc(togetherEvents.createdAt), asc(togetherEvents.id));
  });
}

export async function updateSessionMemberLastSeen(
  sessionId: string,
  userId: string,
  lastSeenAt: Date,
): Promise<void> {
  await db
    .update(togetherSessionMembers)
    .set({ lastSeenAt })
    .where(
      and(
        eq(togetherSessionMembers.sessionId, sessionId),
        eq(togetherSessionMembers.userId, userId),
      ),
    );
}

export async function markSessionMemberLeft(
  sessionId: string,
  userId: string,
  leftAt: Date,
): Promise<void> {
  await db
    .update(togetherSessionMembers)
    .set({ leftAt, lastSeenAt: leftAt })
    .where(
      and(
        eq(togetherSessionMembers.sessionId, sessionId),
        eq(togetherSessionMembers.userId, userId),
      ),
    );
}

export async function findStalePeerUserId(
  sessionId: string,
  userId: string,
  cutoff: Date,
): Promise<string | undefined> {
  const [row] = await db
    .select({ userId: togetherSessionMembers.userId })
    .from(togetherSessionMembers)
    .where(
      and(
        eq(togetherSessionMembers.sessionId, sessionId),
        ne(togetherSessionMembers.userId, userId),
        lt(togetherSessionMembers.lastSeenAt, cutoff),
      ),
    )
    .limit(1);

  return row?.userId;
}

export async function finishActiveSession(sessionId: string, finishedAt: Date): Promise<TogetherSessionRow | undefined> {
  const [session] = await db
    .update(togetherSessions)
    .set({
      status: "finished",
      finishedAt,
      endedReason: "completed",
      updatedAt: finishedAt,
    })
    .where(and(eq(togetherSessions.id, sessionId), eq(togetherSessions.status, "active")))
    .returning();

  return session;
}

export async function findContinuationSessionBySource(
  sourceSessionId: string,
): Promise<TogetherSessionRow | undefined> {
  const [session] = await db
    .select()
    .from(togetherSessions)
    .where(
      and(
        eq(togetherSessions.sourceSessionId, sourceSessionId),
        eq(togetherSessions.activity, "story_sparks"),
      ),
    )
    .orderBy(asc(togetherSessions.createdAt), asc(togetherSessions.id))
    .limit(1);

  return session;
}

export async function createStoryContinuationSession(
  input: CreateStoryContinuationInput,
): Promise<TogetherSessionRow | undefined> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [sourceSession] = await tx
      .select()
      .from(togetherSessions)
      .where(eq(togetherSessions.id, input.sourceSessionId))
      .limit(1)
      .for("update");

    if (!sourceSession) {
      return undefined;
    }

    const [existing] = await tx
      .select()
      .from(togetherSessions)
      .where(
        and(
          eq(togetherSessions.sourceSessionId, input.sourceSessionId),
          eq(togetherSessions.activity, "story_sparks"),
        ),
      )
      .limit(1)
      .for("update");

    if (existing) {
      return existing;
    }

    const [session] = await tx
      .insert(togetherSessions)
      .values({
        activity: "story_sparks",
        promptText: input.promptText,
        sourceSessionId: input.sourceSessionId,
      })
      .returning();

    await tx.insert(togetherSessionMembers).values(
      input.memberUserIds.map((userId) => ({
        sessionId: session.id,
        userId,
        lastSeenAt: now,
      })),
    );

    return session;
  });
}

export async function closeActiveSession(
  sessionId: string,
  status: "abandoned" | "cancelled",
  endedReason: string,
  endedAt: Date,
): Promise<TogetherSessionRow | undefined> {
  const [session] = await db
    .update(togetherSessions)
    .set({
      status,
      finishedAt: endedAt,
      endedReason,
      updatedAt: endedAt,
    })
    .where(and(eq(togetherSessions.id, sessionId), eq(togetherSessions.status, "active")))
    .returning();

  return session;
}

export async function upsertReveal(
  sessionId: string,
  userId: string,
  decision: string,
): Promise<void> {
  await db
    .insert(togetherReveals)
    .values({
      sessionId,
      userId,
      decision,
    })
    .onConflictDoUpdate({
      target: [togetherReveals.sessionId, togetherReveals.userId],
      set: {
        decision,
      },
    });
}

export async function listSessionReveals(sessionId: string): Promise<TogetherRevealRow[]> {
  return db
    .select()
    .from(togetherReveals)
    .where(eq(togetherReveals.sessionId, sessionId));
}

export async function listRevealsForSessions(
  sessionIds: string[],
): Promise<TogetherRevealRow[]> {
  if (sessionIds.length === 0) {
    return [];
  }

  return db
    .select()
    .from(togetherReveals)
    .where(inArray(togetherReveals.sessionId, sessionIds));
}

export async function listHistorySessions(
  userId: string,
  limit: number,
): Promise<HistorySessionRow[]> {
  const myMember = alias(togetherSessionMembers, "my_together_member");
  const peerMember = alias(togetherSessionMembers, "peer_together_member");

  return db
    .select({
      session: togetherSessions,
      peer: {
        id: users.id,
        displayName: users.displayName,
        avatarUrl: users.avatarUrl,
      },
    })
    .from(togetherSessions)
    .innerJoin(
      myMember,
      and(eq(myMember.sessionId, togetherSessions.id), eq(myMember.userId, userId)),
    )
    .innerJoin(
      peerMember,
      and(eq(peerMember.sessionId, togetherSessions.id), ne(peerMember.userId, userId)),
    )
    .innerJoin(users, eq(users.id, peerMember.userId))
    .where(eq(togetherSessions.status, "finished"))
    .orderBy(desc(togetherSessions.createdAt))
    .limit(limit);
}

async function expireWaitingEntries(now: Date): Promise<void> {
  await db
    .update(togetherQueue)
    .set({ status: "expired" })
    .where(and(eq(togetherQueue.status, "waiting"), lte(togetherQueue.expiresAt, now)));
}
