import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  geographicBounds,
  MAX_FINITE_MATCH_RADIUS_KM,
  type GeographicBounds,
} from "../common/geography";
import { PROFILE_GENDERS, TOGETHER_ARTIFACT_PURGE_DELAY_MS, TURN_BASED_REVEAL_TTL_MS } from "../config/constants";
import { db } from "../db/client";
import {
  type NewTogetherEventRow,
  type ProfileGender,
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
import {
  DEFAULT_PREFERRED_AGE_RANGE,
  getAgeGroup,
  isAgeInsidePreferredRange,
  type AgeGroup,
  type PreferredAgeRange,
} from "../users/age";
import type { TogetherParticipantDto, TogetherQueueCancelSource } from "./together.types";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type EnqueueInput = {
  userId: string;
  activity: string;
  expiresAt: Date;
  promptText: string;
  deadlineAt?: Date | null;
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
  locationUpdatedAt?: Date | null;
  userAge: number;
  preferredAgeMin: number;
  preferredAgeMax: number | null;
  gender: ProfileGender;
  preferredGenders: ProfileGender[];
};

export type EventInsertResult = {
  event: TogetherEventRow;
  created: boolean;
  conflictReason?: "client_request" | "story_round";
};

export type HistorySessionRow = {
  session: TogetherSessionRow;
  peer: TogetherParticipantDto;
};

export type AdminTogetherQueueEntryRow = {
  entryId: string;
  userId: string;
  amoriaId: string | null;
  displayName: string | null;
  activity: string;
  status: string;
  radiusKm: number | null;
  hasCoordinates: boolean;
  geoMode: AdminTogetherQueueGeoMode;
  userAgeGroup: AgeGroup | null;
  preferredAgeRange: PreferredAgeRange | null;
  waitingReason: AdminTogetherQueueWaitingReason;
  cancelledAt: Date | null;
  cancelSource: TogetherQueueCancelSource | null;
  cancelReason: string | null;
  lastAction: string | null;
  lastActionAt: Date | null;
  lastClientPollAt: Date | null;
  ageSeconds: number;
  createdAt: Date;
  expiresAt: Date;
  matchedSessionId: string | null;
};

export type QueueCancelInput = {
  cancelSource: TogetherQueueCancelSource;
  cancelReason?: string | null;
};

export type AdminTogetherQueueGeoMode =
  | "no_limit_with_location"
  | "finite_with_location"
  | "missing_location_invalid_old_entry";

export type AdminTogetherQueueWaitingReason =
  | "no_candidate"
  | "activity_mismatch"
  | "radius_distance_too_far"
  | "missing_coordinates_old_entry"
  | "same_user_excluded"
  | "candidate_expired"
  | "candidate_cancelled"
  | "location_required"
  | "age_mismatch"
  | "gender_mismatch"
  | "missing_user_age"
  | "missing_age_preference"
  | "missing_gender"
  | "missing_preferred_genders"
  | "unknown";

export type AdminTogetherQueueQuery = {
  status?: string;
  activity?: string;
  radiusKm?: number | null;
  geoMode?: AdminTogetherQueueGeoMode;
  hasCoordinates?: boolean;
  ageGroup?: AgeGroup;
  waitingReason?: AdminTogetherQueueWaitingReason;
  limit?: number;
};

export type AdminTogetherSessionParticipantRow = {
  userId: string;
  lastHeartbeatAt: Date | null;
  leftAt: Date | null;
};

export type AdminTogetherSessionRevealSummary = {
  open: number;
  skip: number;
  continueStory: number;
  pending: number;
  total: number;
};

export type AdminTogetherSessionRow = {
  sessionId: string;
  activity: string;
  status: string;
  createdAt: Date;
  deadlineAt: Date | null;
  endedAt: Date | null;
  endedReason: string | null;
  sourceSessionId: string | null;
  participantUserIds: string[];
  participantCount: number;
  participants: AdminTogetherSessionParticipantRow[];
  lastHeartbeatAt: Date | null;
  leftAt: Date | null;
  eventCount: number;
  strokeEventCount: number;
  storyChoiceCount: number;
  revealDecisions: AdminTogetherSessionRevealSummary;
};

export type AdminTogetherSessionsQuery = {
  status?: string;
  activity?: string;
  sessionId?: string;
  limit?: number;
};

export type CreateStoryContinuationInput = {
  sourceSessionId: string;
  memberUserIds: string[];
  promptText: string;
};

export async function findUserAgeProfile(userId: string): Promise<{
  birthDate: string | null;
  preferredAgeMin: number;
  preferredAgeMax: number | null;
  gender: string | null;
  preferredGenders: ProfileGender[];
} | undefined> {
  const [row] = await db
    .select({
      birthDate: users.birthDate,
      preferredAgeMin: users.preferredAgeMin,
      preferredAgeMax: users.preferredAgeMax,
      gender: users.gender,
      preferredGenders: users.preferredGenders,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  return row;
}

export async function updateUserAgePreference(
  userId: string,
  preferredAgeRange: PreferredAgeRange,
): Promise<void> {
  await db
    .update(users)
    .set({
      preferredAgeMin: preferredAgeRange.min,
      preferredAgeMax: preferredAgeRange.max,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

export async function enqueueAndMatch(input: EnqueueInput): Promise<TogetherQueueRow> {
  const now = new Date();

  const initial = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);

    await expireWaitingEntriesForMatching(tx, now);

    const [existing] = await tx
      .select()
      .from(togetherQueue)
      .where(and(eq(togetherQueue.userId, input.userId), eq(togetherQueue.status, "waiting")))
      .limit(1)
      .for("update");

    if (existing && isSameQueueSearch(input, existing)) {
      const [rejoined] = await tx
        .update(togetherQueue)
        .set({
          lastAction: "same_search_rejoin",
          lastActionAt: now,
        })
        .where(eq(togetherQueue.id, existing.id))
        .returning();
      const activeExisting = rejoined ?? existing;
      const activeExistingWithProfile = withQueueGenderProfile(activeExisting, input);
      const peers = await listQueueCandidatesForMatching(tx, input, now);
      const peer = peers.find((candidate) =>
        areQueueEntriesCompatible(activeExistingWithProfile, candidate),
      );

      if (!peer) {
        return activeExisting;
      }

      return createMatchedSessionForEntries(tx, input, activeExisting, peer, now);
    }

    if (existing) {
      await tx
        .update(togetherQueue)
        .set(queueCancelledUpdate(now, {
          cancelSource: replacementCancelSource(input, existing),
          cancelReason: "same_user_replaced_with_new_search",
        }))
        .where(eq(togetherQueue.id, existing.id));
    }

    const peers = await listQueueCandidatesForMatching(tx, input, now);
    const peer = peers.find((candidate) => areQueueEntriesCompatible(input, candidate));

    const [entry] = await tx
      .insert(togetherQueue)
      .values({
        userId: input.userId,
        activity: input.activity,
        expiresAt: input.expiresAt,
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        radiusKm: input.radiusKm ?? null,
        locationUpdatedAt: input.locationUpdatedAt ?? null,
        userAge: input.userAge,
        preferredAgeMin: input.preferredAgeMin,
        preferredAgeMax: input.preferredAgeMax,
        lastAction: "queued",
        lastActionAt: now,
      })
      .returning();

    if (!peer) {
      return entry;
    }

    return createMatchedSessionForEntries(tx, input, entry, peer, now);
  });

  if (initial.status !== "waiting") return initial;

  // A second short transaction closes the simultaneous-empty-queue race: two
  // compatible inserts that could not see one another before commit are matched
  // once both durable waiting rows become visible. Row locks keep this scalable.
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.userId}))`);
    const [current] = await tx
      .select()
      .from(togetherQueue)
      .where(eq(togetherQueue.id, initial.id))
      .limit(1);
    if (!current || current.status !== "waiting") return current ?? initial;
    const currentWithProfile = withQueueGenderProfile(current, input);
    const peers = await listQueueCandidatesWithoutLock(tx, input, new Date());
    for (const peer of peers) {
      if (!areQueueEntriesCompatible(currentWithProfile, peer)) continue;
      const locked = await tx
        .select()
        .from(togetherQueue)
        .where(inArray(togetherQueue.id, [current.id, peer.id]))
        .orderBy(asc(togetherQueue.id))
        .for("update", { skipLocked: true });
      if (locked.length !== 2 || locked.some((row) => row.status !== "waiting")) continue;
      const lockedCurrent = locked.find((row) => row.id === current.id)!;
      const lockedPeer = locked.find((row) => row.id === peer.id)!;
      return createMatchedSessionForEntries(tx, input, lockedCurrent, lockedPeer, new Date());
    }
    return current;
  });
}

async function listQueueCandidatesWithoutLock(
  tx: DbTransaction,
  input: EnqueueInput,
  now: Date,
): Promise<QueueCandidateForMatching[]> {
  const rows = await tx
    .select({ entry: togetherQueue, gender: users.gender, preferredGenders: users.preferredGenders })
    .from(togetherQueue)
    .innerJoin(users, eq(users.id, togetherQueue.userId))
    .where(and(
      eq(togetherQueue.activity, input.activity),
      eq(users.accountStatus, "active"),
      eq(togetherQueue.status, "waiting"),
      ne(togetherQueue.userId, input.userId),
      gt(togetherQueue.expiresAt, now),
      queueCandidateCompatibilityCondition(input),
    ))
    .orderBy(asc(togetherQueue.createdAt), asc(togetherQueue.id))
    .limit(50);
  return rows.map((row) => ({ ...row.entry, gender: row.gender, preferredGenders: row.preferredGenders }));
}

async function listQueueCandidatesForMatching(
  tx: DbTransaction,
  input: EnqueueInput,
  now: Date,
): Promise<QueueCandidateForMatching[]> {
  const rows = await tx
    .select({
      entry: togetherQueue,
      gender: users.gender,
      preferredGenders: users.preferredGenders,
    })
    .from(togetherQueue)
    .innerJoin(users, eq(users.id, togetherQueue.userId))
    .where(
      and(
        eq(togetherQueue.activity, input.activity),
        eq(users.accountStatus, "active"),
        eq(togetherQueue.status, "waiting"),
        ne(togetherQueue.userId, input.userId),
        gt(togetherQueue.expiresAt, now),
        queueCandidateCompatibilityCondition(input),
      ),
    )
    .orderBy(asc(togetherQueue.createdAt), asc(togetherQueue.id))
    .limit(50)
    .for("update", { of: togetherQueue, skipLocked: true });

  return rows.map((row) => ({
    ...row.entry,
    gender: row.gender,
    preferredGenders: row.preferredGenders,
  }));
}

function queueCandidateCompatibilityCondition(input: EnqueueInput): SQL {
  if (!hasCoordinates(input)) return sql`false`;

  const radiusKm = input.radiusKm ?? null;
  const bounds = geographicBounds(
    input.latitude,
    input.longitude,
    radiusKm ?? MAX_FINITE_MATCH_RADIUS_KM,
  );
  const boundedCandidate = and(
    gte(togetherQueue.latitude, bounds.minLatitude),
    lte(togetherQueue.latitude, bounds.maxLatitude),
    queueLongitudeCondition(bounds),
  )!;
  const geographicPrefilter = radiusKm === null
    ? or(isNull(togetherQueue.radiusKm), and(isNotNull(togetherQueue.radiusKm), boundedCandidate))!
    : boundedCandidate;
  const distanceKm = sql<number>`(
    6371 * 2 * asin(least(1, sqrt(
      pow(sin(radians(${togetherQueue.latitude} - ${input.latitude}) / 2), 2) +
      cos(radians(${input.latitude})) * cos(radians(${togetherQueue.latitude})) *
      pow(sin(radians(${togetherQueue.longitude} - ${input.longitude}) / 2), 2)
    )))
  )`;
  const exactMutualDistance = radiusKm === null
    ? sql`CASE
        WHEN ${togetherQueue.radiusKm} IS NULL THEN true
        ELSE ${distanceKm} <= ${togetherQueue.radiusKm}
      END`
    : and(
        sql`${distanceKm} <= ${radiusKm}`,
        or(isNull(togetherQueue.radiusKm), sql`${distanceKm} <= ${togetherQueue.radiusKm}`),
      )!;
  const viewerAcceptsCandidate = input.preferredGenders.length === 0
    ? inArray(users.gender, PROFILE_GENDERS)
    : inArray(users.gender, input.preferredGenders);
  const safeCandidatePreferences = sql`CASE
    WHEN jsonb_typeof(${users.preferredGenders}) = 'array' THEN ${users.preferredGenders}
    ELSE '[]'::jsonb
  END`;
  const candidatePreferencesValid = sql`jsonb_typeof(${users.preferredGenders}) = 'array'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(${safeCandidatePreferences}) AS preferred_gender(value)
      WHERE preferred_gender.value NOT IN ('woman', 'man', 'nonbinary')
    )`;
  const candidateAcceptsViewer = sql`CASE
    WHEN jsonb_typeof(${users.preferredGenders}) <> 'array' THEN false
    ELSE jsonb_array_length(${users.preferredGenders}) = 0
      OR ${users.preferredGenders} @> ${JSON.stringify([input.gender])}::jsonb
  END`;
  const notBlocked = sql`NOT EXISTS (
    SELECT 1 FROM blocked_users AS candidate_block
    WHERE
      (candidate_block.user_id = ${input.userId}
        AND candidate_block.blocked_user_id = ${togetherQueue.userId})
      OR
      (candidate_block.user_id = ${togetherQueue.userId}
        AND candidate_block.blocked_user_id = ${input.userId})
  )`;

  return and(
    isNotNull(togetherQueue.latitude),
    isNotNull(togetherQueue.longitude),
    gte(togetherQueue.userAge, input.preferredAgeMin),
    input.preferredAgeMax === null
      ? sql`true`
      : lte(togetherQueue.userAge, input.preferredAgeMax),
    lte(togetherQueue.preferredAgeMin, input.userAge),
    or(isNull(togetherQueue.preferredAgeMax), gte(togetherQueue.preferredAgeMax, input.userAge)),
    viewerAcceptsCandidate,
    candidatePreferencesValid,
    candidateAcceptsViewer,
    notBlocked,
    geographicPrefilter,
    exactMutualDistance,
  )!;
}

function queueLongitudeCondition(bounds: GeographicBounds): SQL {
  if (bounds.allLongitudes) return sql`true`;
  if (bounds.crossesAntimeridian) {
    return or(
      gte(togetherQueue.longitude, bounds.minLongitude),
      lte(togetherQueue.longitude, bounds.maxLongitude),
    )!;
  }
  return and(
    gte(togetherQueue.longitude, bounds.minLongitude),
    lte(togetherQueue.longitude, bounds.maxLongitude),
  )!;
}

async function createMatchedSessionForEntries(
  tx: DbTransaction,
  input: EnqueueInput,
  currentEntry: TogetherQueueRow,
  peer: TogetherQueueRow,
  now: Date,
): Promise<TogetherQueueRow> {
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
      userId: currentEntry.userId,
      lastSeenAt: now,
    },
  ]);

  await tx
    .update(togetherQueue)
    .set({
      status: "matched",
      matchedSessionId: session.id,
      lastAction: "matched",
      lastActionAt: now,
    })
    .where(eq(togetherQueue.id, peer.id));

  const [matchedEntry] = await tx
    .update(togetherQueue)
    .set({
      status: "matched",
      matchedSessionId: session.id,
      lastAction: "matched",
      lastActionAt: now,
    })
    .where(eq(togetherQueue.id, currentEntry.id))
    .returning();

  return matchedEntry;
}

export async function findQueueEntryForOwner(
  entryId: string,
  userId: string,
): Promise<TogetherQueueRow | undefined> {
  const now = new Date();
  await expireWaitingEntries(now);

  const [entry] = await db
    .select()
    .from(togetherQueue)
    .where(and(eq(togetherQueue.id, entryId), eq(togetherQueue.userId, userId)))
    .limit(1);

  if (entry?.status === "waiting") {
    const [polled] = await db
      .update(togetherQueue)
      .set({
        lastClientPollAt: now,
        lastAction: "client_poll",
        lastActionAt: now,
      })
      .where(and(eq(togetherQueue.id, entryId), eq(togetherQueue.userId, userId), eq(togetherQueue.status, "waiting")))
      .returning();
    return polled ?? entry;
  }

  return entry;
}

export async function cancelQueueEntryForOwner(
  entryId: string,
  userId: string,
  input: QueueCancelInput = { cancelSource: "unknown" },
): Promise<TogetherQueueRow | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date();

    await expireWaitingEntriesTx(tx, now);

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
      .set(queueCancelledUpdate(now, input))
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
      .onConflictDoNothing()
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

    if (existing) {
      return {
        event: existing,
        created: false,
        conflictReason: "client_request",
      };
    }

    if (input.type === "story_choice") {
      const roundId = storyRoundIdFromPayload(input.payload);
      if (roundId) {
        const [existingRoundChoice] = await tx
          .select()
          .from(togetherEvents)
          .where(
            and(
              eq(togetherEvents.sessionId, input.sessionId),
              eq(togetherEvents.fromUserId, input.fromUserId),
              eq(togetherEvents.type, "story_choice"),
              sql`${togetherEvents.payload}->>'roundId' = ${roundId}`,
            ),
          )
          .orderBy(asc(togetherEvents.createdAt), asc(togetherEvents.id))
          .limit(1);

        if (existingRoundChoice) {
          return {
            event: existingRoundChoice,
            created: false,
            conflictReason: "story_round",
          };
        }
      }
    }

    throw new Error("Together event conflict target was not found after insert conflict");
  });
}

function storyRoundIdFromPayload(payload: NewTogetherEventRow["payload"]): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const roundId = (payload as Record<string, unknown>).roundId;
  return typeof roundId === "string" && roundId.trim() ? roundId.trim() : null;
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
      artifactPurgeAfter: null,
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
        mode: sourceSession.mode,
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
      artifactPurgeAfter: new Date(endedAt.getTime() + TOGETHER_ARTIFACT_PURGE_DELAY_MS),
      updatedAt: endedAt,
    })
    .where(and(eq(togetherSessions.id, sessionId), eq(togetherSessions.status, "active")))
    .returning();

  return session;
}

export async function scheduleArtifactPurge(sessionId: string, purgeAfter: Date): Promise<void> {
  await db.update(togetherSessions).set({
    artifactPurgeAfter: purgeAfter,
    updatedAt: new Date(),
  }).where(eq(togetherSessions.id, sessionId));
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

export async function listQueueEntriesForAdmin(
  query: AdminTogetherQueueQuery = {},
): Promise<AdminTogetherQueueEntryRow[]> {
  const now = new Date();
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const conditions: SQL[] = [];

  if (query.status) {
    conditions.push(eq(togetherQueue.status, query.status));
  }
  if (query.activity) {
    conditions.push(eq(togetherQueue.activity, query.activity));
  }
  if (query.radiusKm !== undefined) {
    conditions.push(
      query.radiusKm === null
        ? isNull(togetherQueue.radiusKm)
        : eq(togetherQueue.radiusKm, query.radiusKm),
    );
  }
  if (query.hasCoordinates !== undefined) {
    conditions.push(
      query.hasCoordinates
        ? and(isNotNull(togetherQueue.latitude), isNotNull(togetherQueue.longitude))!
        : or(isNull(togetherQueue.latitude), isNull(togetherQueue.longitude))!,
    );
  }
  if (query.geoMode) {
    conditions.push(geoModeCondition(query.geoMode));
  }
  if (query.ageGroup) {
    conditions.push(ageGroupCondition(query.ageGroup));
  }

  let selectQuery = db
    .select({
      entryId: togetherQueue.id,
      userId: togetherQueue.userId,
      amoriaId: users.amoriaId,
      displayName: users.displayName,
      gender: users.gender,
      preferredGenders: users.preferredGenders,
      activity: togetherQueue.activity,
      status: togetherQueue.status,
      radiusKm: togetherQueue.radiusKm,
      latitude: togetherQueue.latitude,
      longitude: togetherQueue.longitude,
      userAge: togetherQueue.userAge,
      preferredAgeMin: togetherQueue.preferredAgeMin,
      preferredAgeMax: togetherQueue.preferredAgeMax,
      cancelledAt: togetherQueue.cancelledAt,
      cancelSource: togetherQueue.cancelSource,
      cancelReason: togetherQueue.cancelReason,
      lastAction: togetherQueue.lastAction,
      lastActionAt: togetherQueue.lastActionAt,
      lastClientPollAt: togetherQueue.lastClientPollAt,
      createdAt: togetherQueue.createdAt,
      expiresAt: togetherQueue.expiresAt,
      matchedSessionId: togetherQueue.matchedSessionId,
    })
    .from(togetherQueue)
    .innerJoin(users, eq(users.id, togetherQueue.userId))
    .$dynamic();
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const rows = await selectQuery.orderBy(desc(togetherQueue.createdAt)).limit(limit);

  const diagnostics = await listQueueDiagnosticsForAdmin(now);

  const entries = rows.map((row) => toAdminTogetherQueueEntry(row, now, diagnostics));
  if (query.waitingReason) {
    return entries.filter((entry) => entry.waitingReason === query.waitingReason);
  }
  return entries;
}

export async function cancelQueueEntryForAdmin(
  entryId: string,
  reason: string,
): Promise<AdminTogetherQueueEntryRow | undefined> {
  return db.transaction(async (tx) => {
    const now = new Date();

    await expireWaitingEntriesTx(tx, now);

    const [entry] = await tx
      .select({
        entryId: togetherQueue.id,
        userId: togetherQueue.userId,
        amoriaId: users.amoriaId,
        displayName: users.displayName,
        gender: users.gender,
        preferredGenders: users.preferredGenders,
        activity: togetherQueue.activity,
        status: togetherQueue.status,
        radiusKm: togetherQueue.radiusKm,
        latitude: togetherQueue.latitude,
        longitude: togetherQueue.longitude,
        userAge: togetherQueue.userAge,
        preferredAgeMin: togetherQueue.preferredAgeMin,
        preferredAgeMax: togetherQueue.preferredAgeMax,
        cancelledAt: togetherQueue.cancelledAt,
        cancelSource: togetherQueue.cancelSource,
        cancelReason: togetherQueue.cancelReason,
        lastAction: togetherQueue.lastAction,
        lastActionAt: togetherQueue.lastActionAt,
        lastClientPollAt: togetherQueue.lastClientPollAt,
        createdAt: togetherQueue.createdAt,
        expiresAt: togetherQueue.expiresAt,
        matchedSessionId: togetherQueue.matchedSessionId,
      })
      .from(togetherQueue)
      .innerJoin(users, eq(users.id, togetherQueue.userId))
      .where(eq(togetherQueue.id, entryId))
      .limit(1)
      .for("update");

    if (!entry) {
      return undefined;
    }

    if (entry.status !== "waiting") {
      return toAdminTogetherQueueEntry(entry, now, [entry]);
    }

    const [cancelled] = await tx
      .update(togetherQueue)
      .set(queueCancelledUpdate(now, {
        cancelSource: "admin_cancel",
        cancelReason: reason,
      }))
      .where(eq(togetherQueue.id, entryId))
      .returning({
        entryId: togetherQueue.id,
        userId: togetherQueue.userId,
        activity: togetherQueue.activity,
        status: togetherQueue.status,
        radiusKm: togetherQueue.radiusKm,
        latitude: togetherQueue.latitude,
        longitude: togetherQueue.longitude,
        userAge: togetherQueue.userAge,
        preferredAgeMin: togetherQueue.preferredAgeMin,
        preferredAgeMax: togetherQueue.preferredAgeMax,
        cancelledAt: togetherQueue.cancelledAt,
        cancelSource: togetherQueue.cancelSource,
        cancelReason: togetherQueue.cancelReason,
        lastAction: togetherQueue.lastAction,
        lastActionAt: togetherQueue.lastActionAt,
        lastClientPollAt: togetherQueue.lastClientPollAt,
        createdAt: togetherQueue.createdAt,
        expiresAt: togetherQueue.expiresAt,
        matchedSessionId: togetherQueue.matchedSessionId,
      });

    return cancelled
      ? toAdminTogetherQueueEntry(
          {
            ...cancelled,
            amoriaId: entry.amoriaId,
            displayName: entry.displayName,
            gender: entry.gender,
            preferredGenders: entry.preferredGenders,
          },
          now,
          [entry],
        )
      : toAdminTogetherQueueEntry(entry, now, [entry]);
  });
}

export async function listSessionsForAdmin(
  query: AdminTogetherSessionsQuery = {},
): Promise<AdminTogetherSessionRow[]> {
  const limit = Math.min(Math.max(query.limit ?? 100, 1), 200);
  const conditions: SQL[] = [];

  if (query.status) {
    conditions.push(eq(togetherSessions.status, query.status));
  }
  if (query.activity) {
    conditions.push(eq(togetherSessions.activity, query.activity));
  }
  if (query.sessionId) {
    conditions.push(eq(togetherSessions.id, query.sessionId));
  }

  let selectQuery = db.select().from(togetherSessions).$dynamic();
  if (conditions.length > 0) {
    selectQuery = selectQuery.where(and(...conditions));
  }

  const sessions = await selectQuery
    .orderBy(desc(togetherSessions.createdAt))
    .limit(limit);
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) {
    return [];
  }

  const [members, eventCounts, reveals] = await Promise.all([
    listAdminSessionMembers(sessionIds),
    listAdminSessionEventCounts(sessionIds),
    listRevealsForSessions(sessionIds),
  ]);
  const membersBySessionId = groupBySessionId(members, (row) => row.sessionId);
  const eventCountsBySessionId = new Map(eventCounts.map((row) => [row.sessionId, row]));
  const revealsBySessionId = groupBySessionId(reveals, (row) => row.sessionId);

  return sessions.map((session) => {
    const sessionMembers = (membersBySessionId.get(session.id) ?? [])
      .sort((left, right) => left.userId.localeCompare(right.userId))
      .map((member) => ({
        userId: member.userId,
        lastHeartbeatAt: member.lastHeartbeatAt,
        leftAt: member.leftAt,
      }));
    const counts = eventCountsBySessionId.get(session.id);
    const lastHeartbeatAt = sessionMembers.reduce<Date | null>((latest, member) => {
      if (!member.lastHeartbeatAt) {
        return latest;
      }
      if (!latest || member.lastHeartbeatAt.getTime() > latest.getTime()) {
        return member.lastHeartbeatAt;
      }
      return latest;
    }, null);
    const leftAt = sessionMembers.reduce<Date | null>((latest, member) => {
      if (!member.leftAt) {
        return latest;
      }
      if (!latest || member.leftAt.getTime() > latest.getTime()) {
        return member.leftAt;
      }
      return latest;
    }, null);

    return {
      sessionId: session.id,
      activity: session.activity,
      status: session.status,
      createdAt: session.createdAt,
      deadlineAt: session.deadlineAt,
      endedAt: session.finishedAt,
      endedReason: session.endedReason,
      sourceSessionId: session.sourceSessionId,
      participantUserIds: sessionMembers.map((member) => member.userId),
      participantCount: sessionMembers.length,
      participants: sessionMembers,
      lastHeartbeatAt,
      leftAt,
      eventCount: Number(counts?.eventCount ?? 0),
      strokeEventCount: Number(counts?.strokeEventCount ?? 0),
      storyChoiceCount: Number(counts?.storyChoiceCount ?? 0),
      revealDecisions: summarizeRevealDecisions(
        sessionMembers.length,
        revealsBySessionId.get(session.id) ?? [],
      ),
    };
  });
}

async function listAdminSessionMembers(sessionIds: string[]): Promise<Array<{
  sessionId: string;
  userId: string;
  lastHeartbeatAt: Date | null;
  leftAt: Date | null;
}>> {
  return db
    .select({
      sessionId: togetherSessionMembers.sessionId,
      userId: togetherSessionMembers.userId,
      lastHeartbeatAt: togetherSessionMembers.lastSeenAt,
      leftAt: togetherSessionMembers.leftAt,
    })
    .from(togetherSessionMembers)
    .where(inArray(togetherSessionMembers.sessionId, sessionIds));
}

async function listAdminSessionEventCounts(sessionIds: string[]): Promise<Array<{
  sessionId: string;
  eventCount: number;
  strokeEventCount: number;
  storyChoiceCount: number;
}>> {
  return db
    .select({
      sessionId: togetherEvents.sessionId,
      eventCount: count(togetherEvents.id),
      strokeEventCount: sql<number>`count(*) filter (where ${togetherEvents.type} = 'stroke_batch')`,
      storyChoiceCount: sql<number>`count(*) filter (where ${togetherEvents.type} = 'story_choice')`,
    })
    .from(togetherEvents)
    .where(inArray(togetherEvents.sessionId, sessionIds))
    .groupBy(togetherEvents.sessionId);
}

function summarizeRevealDecisions(
  participantCount: number,
  reveals: TogetherRevealRow[],
): AdminTogetherSessionRevealSummary {
  const summary: AdminTogetherSessionRevealSummary = {
    open: 0,
    skip: 0,
    continueStory: 0,
    pending: 0,
    total: reveals.length,
  };

  for (const reveal of reveals) {
    if (reveal.decision === "open") {
      summary.open += 1;
    } else if (reveal.decision === "skip") {
      summary.skip += 1;
    } else if (reveal.decision === "continue_story") {
      summary.continueStory += 1;
    }
  }

  summary.pending = Math.max(participantCount - reveals.length, 0);
  return summary;
}

function groupBySessionId<T>(
  rows: T[],
  getSessionId: (row: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const sessionId = getSessionId(row);
    const group = grouped.get(sessionId) ?? [];
    group.push(row);
    grouped.set(sessionId, group);
  }
  return grouped;
}

function toAdminTogetherQueueEntry(row: {
  entryId: string;
  userId: string;
  amoriaId?: string | null;
  displayName?: string | null;
  gender?: string | null;
  preferredGenders?: unknown;
  activity: string;
  status: string;
  radiusKm: number | null;
  latitude?: number | null;
  longitude?: number | null;
  userAge?: number | null;
  preferredAgeMin?: number | null;
  preferredAgeMax?: number | null;
  cancelledAt?: Date | null;
  cancelSource?: string | null;
  cancelReason?: string | null;
  lastAction?: string | null;
  lastActionAt?: Date | null;
  lastClientPollAt?: Date | null;
  createdAt: Date;
  expiresAt: Date;
  matchedSessionId: string | null;
}, now: Date, diagnostics: QueueDiagnosticRow[]): AdminTogetherQueueEntryRow {
  return {
    entryId: row.entryId,
    userId: row.userId,
    amoriaId: row.amoriaId ?? null,
    displayName: row.displayName ?? null,
    activity: row.activity,
    status: row.status,
    radiusKm: row.radiusKm,
    hasCoordinates: hasCoordinates(row),
    geoMode: getAdminQueueGeoMode(row),
    userAgeGroup: getAgeGroup(row.userAge),
    preferredAgeRange: getAdminPreferredAgeRange(row),
    waitingReason: getAdminQueueWaitingReason(row, diagnostics, now),
    cancelledAt: row.cancelledAt ?? null,
    cancelSource: normalizeCancelSource(row.cancelSource),
    cancelReason: row.cancelReason ?? null,
    lastAction: row.lastAction ?? null,
    lastActionAt: row.lastActionAt ?? null,
    lastClientPollAt: row.lastClientPollAt ?? null,
    ageSeconds: Math.max(0, Math.floor((now.getTime() - row.createdAt.getTime()) / 1000)),
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    matchedSessionId: row.matchedSessionId,
  };
}

type QueueDiagnosticRow = {
  entryId: string;
  userId: string;
  gender?: string | null;
  preferredGenders?: unknown;
  activity: string;
  status: string;
  radiusKm: number | null;
  latitude?: number | null;
  longitude?: number | null;
  userAge?: number | null;
  preferredAgeMin?: number | null;
  preferredAgeMax?: number | null;
  cancelledAt?: Date | null;
  cancelSource?: string | null;
  cancelReason?: string | null;
  lastAction?: string | null;
  lastActionAt?: Date | null;
  lastClientPollAt?: Date | null;
  createdAt: Date;
  expiresAt: Date;
  matchedSessionId: string | null;
};

async function listQueueDiagnosticsForAdmin(now: Date): Promise<QueueDiagnosticRow[]> {
  const lowerBound = new Date(now.getTime() - 30 * 60 * 1000);
  return db
    .select({
      entryId: togetherQueue.id,
      userId: togetherQueue.userId,
      gender: users.gender,
      preferredGenders: users.preferredGenders,
      activity: togetherQueue.activity,
      status: togetherQueue.status,
      radiusKm: togetherQueue.radiusKm,
      latitude: togetherQueue.latitude,
      longitude: togetherQueue.longitude,
      userAge: togetherQueue.userAge,
      preferredAgeMin: togetherQueue.preferredAgeMin,
      preferredAgeMax: togetherQueue.preferredAgeMax,
      cancelledAt: togetherQueue.cancelledAt,
      cancelSource: togetherQueue.cancelSource,
      cancelReason: togetherQueue.cancelReason,
      lastAction: togetherQueue.lastAction,
      lastActionAt: togetherQueue.lastActionAt,
      lastClientPollAt: togetherQueue.lastClientPollAt,
      createdAt: togetherQueue.createdAt,
      expiresAt: togetherQueue.expiresAt,
      matchedSessionId: togetherQueue.matchedSessionId,
    })
    .from(togetherQueue)
    .innerJoin(users, eq(users.id, togetherQueue.userId))
    .where(gt(togetherQueue.createdAt, lowerBound))
    .orderBy(desc(togetherQueue.createdAt))
    .limit(500);
}

async function expireWaitingEntries(now: Date): Promise<void> {
  await expireWaitingEntriesBounded(db, now);
}

async function expireWaitingEntriesTx(tx: DbTransaction, now: Date): Promise<void> {
  await expireWaitingEntriesBounded(tx, now);
}

async function expireWaitingEntriesBounded(
  queryable: Pick<DbTransaction, "execute"> | Pick<typeof db, "execute">,
  now: Date,
): Promise<void> {
  await queryable.execute(sql`
    with stale as (
      select id from ${togetherQueue}
      where ${togetherQueue.status} = 'waiting' and ${togetherQueue.expiresAt} <= ${now}
      order by ${togetherQueue.expiresAt}
      limit 100 for update skip locked
    )
    update ${togetherQueue}
    set status = 'expired', updated_at = ${now}, last_action = 'expired', last_action_at = ${now}
    from stale where ${togetherQueue.id} = stale.id
  `);
}

async function expireWaitingEntriesForMatching(tx: DbTransaction, now: Date): Promise<void> {
  await tx.execute(sql`
    with stale as (
      select id from ${togetherQueue}
      where ${togetherQueue.status} = 'waiting'
        and (
          ${togetherQueue.expiresAt} <= ${now}
          or ${togetherQueue.latitude} is null
          or ${togetherQueue.longitude} is null
        )
      order by ${togetherQueue.expiresAt}
      limit 100
      for update skip locked
    )
    update ${togetherQueue}
    set status = 'expired', updated_at = ${now}, last_action = 'expired', last_action_at = ${now}
    from stale where ${togetherQueue.id} = stale.id
  `);
}

type QueueGeoInput = {
  latitude?: number | null;
  longitude?: number | null;
  radiusKm?: number | null;
};

type QueueAgeInput = {
  userAge?: number | null;
  preferredAgeMin?: number | null;
  preferredAgeMax?: number | null;
};

type QueueGenderInput = {
  gender?: string | null;
  preferredGenders?: unknown;
};

type QueueCandidateForMatching = TogetherQueueRow & QueueGenderInput;

function queueCancelledUpdate(now: Date, input: QueueCancelInput) {
  return {
    status: "cancelled",
    cancelledAt: now,
    cancelSource: input.cancelSource,
    cancelReason: input.cancelReason ?? null,
    lastAction: "cancelled",
    lastActionAt: now,
  };
}

function queueExpiredUpdate(now: Date) {
  return {
    status: "expired",
    lastAction: "expired",
    lastActionAt: now,
  };
}

function replacementCancelSource(
  current: EnqueueInput,
  existing: TogetherQueueRow,
): TogetherQueueCancelSource {
  if (!sameNullableNumber(existing.radiusKm, current.radiusKm ?? null)) {
    return "radius_expansion";
  }

  return "retry_restart";
}

function areQueueEntriesGeoCompatible(
  current: QueueGeoInput,
  candidate: QueueGeoInput,
): boolean {
  const currentRadius = current.radiusKm ?? null;
  const candidateRadius = candidate.radiusKm ?? null;

  if (!hasCoordinates(current) || !hasCoordinates(candidate)) {
    return false;
  }

  if (currentRadius === null && candidateRadius === null) {
    return true;
  }

  const distanceKm = distanceKmBetween(
    current.latitude,
    current.longitude,
    candidate.latitude,
    candidate.longitude,
  );

  if (currentRadius !== null && distanceKm > currentRadius) {
    return false;
  }

  if (candidateRadius !== null && distanceKm > candidateRadius) {
    return false;
  }

  return true;
}

function areQueueEntriesCompatible(
  current: QueueGeoInput & QueueAgeInput & QueueGenderInput,
  candidate: QueueGeoInput & QueueAgeInput & QueueGenderInput,
): boolean {
  return areQueueEntriesGeoCompatible(current, candidate) &&
    areQueueEntriesAgeCompatible(current, candidate) &&
    areQueueEntriesGenderCompatible(current, candidate);
}

function areQueueEntriesAgeCompatible(
  current: QueueAgeInput,
  candidate: QueueAgeInput,
): boolean {
  const currentRange = getQueuePreferredAgeRange(current);
  const candidateRange = getQueuePreferredAgeRange(candidate);
  if (!currentRange || !candidateRange) {
    return false;
  }

  return (
    isAgeInsidePreferredRange(candidate.userAge, currentRange) &&
    isAgeInsidePreferredRange(current.userAge, candidateRange)
  );
}

function areQueueEntriesGenderCompatible(
  current: QueueGenderInput,
  candidate: QueueGenderInput,
): boolean {
  const currentPreferredGenders = getQueuePreferredGenders(current);
  const candidatePreferredGenders = getQueuePreferredGenders(candidate);
  if (!currentPreferredGenders || !candidatePreferredGenders) {
    return false;
  }

  const currentGender = toProfileGender(current.gender);
  const candidateGender = toProfileGender(candidate.gender);
  if (!currentGender || !candidateGender) {
    return false;
  }

  return (
    genderAllowed(candidateGender, currentPreferredGenders) &&
    genderAllowed(currentGender, candidatePreferredGenders)
  );
}

function genderAllowed(
  gender: ProfileGender | null,
  preferredGenders: ProfileGender[],
): boolean {
  return preferredGenders.length === 0 || (gender !== null && preferredGenders.includes(gender));
}

function isSameQueueSearch(current: EnqueueInput, existing: TogetherQueueRow): boolean {
  return (
    existing.activity === current.activity &&
    sameNullableNumber(existing.radiusKm, current.radiusKm ?? null) &&
    sameNullableNumber(existing.latitude, current.latitude ?? null) &&
    sameNullableNumber(existing.longitude, current.longitude ?? null) &&
    sameNullableNumber(existing.preferredAgeMin, current.preferredAgeMin) &&
    sameNullableNumber(existing.preferredAgeMax, current.preferredAgeMax)
  );
}

function withQueueGenderProfile(
  entry: TogetherQueueRow,
  input: Pick<EnqueueInput, "gender" | "preferredGenders">,
): QueueCandidateForMatching {
  return {
    ...entry,
    gender: input.gender,
    preferredGenders: input.preferredGenders,
  };
}

function sameNullableNumber(left: number | null, right: number | null): boolean {
  if (left === null || right === null) {
    return left === right;
  }

  return Math.abs(left - right) < 0.000001;
}

function hasCoordinates(
  value: QueueGeoInput,
): value is QueueGeoInput & { latitude: number; longitude: number } {
  return (
    typeof value.latitude === "number" &&
    Number.isFinite(value.latitude) &&
    typeof value.longitude === "number" &&
    Number.isFinite(value.longitude)
  );
}

function hasAdultUserAge(value: QueueAgeInput): value is QueueAgeInput & { userAge: number } {
  return (
    typeof value.userAge === "number" &&
    Number.isInteger(value.userAge) &&
    value.userAge >= DEFAULT_PREFERRED_AGE_RANGE.min
  );
}

function hasProfileGender(value: QueueGenderInput): boolean {
  return toProfileGender(value.gender) !== null;
}

function getQueuePreferredGenders(value: QueueGenderInput): ProfileGender[] | null {
  return isValidPreferredGenders(value.preferredGenders) ? value.preferredGenders : null;
}

function isValidPreferredGenders(value: unknown): value is ProfileGender[] {
  return Array.isArray(value) && value.every((item) => toProfileGender(item) !== null);
}

function toProfileGender(value: unknown): ProfileGender | null {
  return PROFILE_GENDERS.includes(value as ProfileGender) ? value as ProfileGender : null;
}

function getQueuePreferredAgeRange(value: QueueAgeInput): PreferredAgeRange | null {
  if (
    typeof value.preferredAgeMin !== "number" ||
    !Number.isInteger(value.preferredAgeMin) ||
    value.preferredAgeMin < DEFAULT_PREFERRED_AGE_RANGE.min
  ) {
    return null;
  }

  const max = value.preferredAgeMax ?? null;
  if (max !== null && (!Number.isInteger(max) || max < value.preferredAgeMin)) {
    return null;
  }

  return {
    min: value.preferredAgeMin,
    max,
  };
}

function getAdminPreferredAgeRange(value: QueueAgeInput): PreferredAgeRange | null {
  return getQueuePreferredAgeRange(value);
}

function normalizeCancelSource(value?: string | null): TogetherQueueCancelSource | null {
  switch (value) {
    case "user_stop":
    case "user_back":
    case "retry_restart":
    case "radius_expansion":
    case "screen_cleanup":
    case "navigation_blur":
    case "admin_cancel":
    case "server_expired":
    case "matched":
    case "unknown":
      return value;
    default:
      return null;
  }
}

function getAdminQueueGeoMode(row: QueueGeoInput): AdminTogetherQueueGeoMode {
  if (!hasCoordinates(row)) {
    return "missing_location_invalid_old_entry";
  }

  return row.radiusKm === null ? "no_limit_with_location" : "finite_with_location";
}

function getAdminQueueWaitingReason(
  row: QueueDiagnosticRow,
  diagnostics: QueueDiagnosticRow[],
  now: Date,
): AdminTogetherQueueWaitingReason {
  if (row.status === "matched") {
    return "unknown";
  }
  if (row.status === "cancelled") {
    return "candidate_cancelled";
  }
  if (row.status === "expired" || row.expiresAt.getTime() <= now.getTime()) {
    return "candidate_expired";
  }
  if (row.status !== "waiting") {
    return "unknown";
  }
  if (!hasCoordinates(row)) {
    return "missing_coordinates_old_entry";
  }
  if (!hasAdultUserAge(row)) {
    return "missing_user_age";
  }
  if (!getQueuePreferredAgeRange(row)) {
    return "missing_age_preference";
  }
  if (!hasProfileGender(row)) {
    return "missing_gender";
  }
  if (!getQueuePreferredGenders(row)) {
    return "missing_preferred_genders";
  }

  const candidates = diagnostics.filter((candidate) => candidate.entryId !== row.entryId);
  if (candidates.length === 0) {
    return "no_candidate";
  }

  const waitingCandidates = candidates.filter((candidate) => candidate.status === "waiting");
  const activeWaitingCandidates = waitingCandidates.filter(
    (candidate) => candidate.expiresAt.getTime() > now.getTime(),
  );
  if (activeWaitingCandidates.some((candidate) => candidate.userId === row.userId)) {
    return "same_user_excluded";
  }

  const sameActivityCandidates = activeWaitingCandidates.filter(
    (candidate) => candidate.activity === row.activity,
  );

  if (sameActivityCandidates.some((candidate) => !hasCoordinates(candidate))) {
    return "missing_coordinates_old_entry";
  }

  if (sameActivityCandidates.some((candidate) => !hasAdultUserAge(candidate))) {
    return "missing_user_age";
  }

  if (sameActivityCandidates.some((candidate) => !getQueuePreferredAgeRange(candidate))) {
    return "missing_age_preference";
  }

  const geoCompatibleCandidates = sameActivityCandidates.filter((candidate) =>
    areQueueEntriesGeoCompatible(row, candidate),
  );

  const ageCompatibleCandidates = geoCompatibleCandidates.filter((candidate) =>
    areQueueEntriesAgeCompatible(row, candidate),
  );

  if (ageCompatibleCandidates.some((candidate) => areQueueEntriesGenderCompatible(row, candidate))) {
    return "unknown";
  }

  if (ageCompatibleCandidates.length > 0) {
    if (ageCompatibleCandidates.some((candidate) => !hasProfileGender(candidate))) {
      return "missing_gender";
    }
    if (ageCompatibleCandidates.some((candidate) => !getQueuePreferredGenders(candidate))) {
      return "missing_preferred_genders";
    }
    return "gender_mismatch";
  }

  if (geoCompatibleCandidates.length > 0) {
    return "age_mismatch";
  }

  if (sameActivityCandidates.length > 0) {
    return "radius_distance_too_far";
  }

  if (activeWaitingCandidates.length > 0) {
    return "activity_mismatch";
  }

  if (candidates.some((candidate) => candidate.status === "cancelled")) {
    return "candidate_cancelled";
  }

  if (
    candidates.some(
      (candidate) =>
        candidate.status === "expired" || candidate.expiresAt.getTime() <= now.getTime(),
    )
  ) {
    return "candidate_expired";
  }

  return "no_candidate";
}

function geoModeCondition(geoMode: AdminTogetherQueueGeoMode): SQL {
  if (geoMode === "missing_location_invalid_old_entry") {
    return or(isNull(togetherQueue.latitude), isNull(togetherQueue.longitude))!;
  }

  if (geoMode === "no_limit_with_location") {
    return and(
      isNotNull(togetherQueue.latitude),
      isNotNull(togetherQueue.longitude),
      isNull(togetherQueue.radiusKm),
    )!;
  }

  return and(
    isNotNull(togetherQueue.latitude),
    isNotNull(togetherQueue.longitude),
    isNotNull(togetherQueue.radiusKm),
  )!;
}

function ageGroupCondition(ageGroup: AgeGroup): SQL {
  switch (ageGroup) {
    case "18-24":
      return and(gte(togetherQueue.userAge, 18), lte(togetherQueue.userAge, 24))!;
    case "25-34":
      return and(gte(togetherQueue.userAge, 25), lte(togetherQueue.userAge, 34))!;
    case "35-44":
      return and(gte(togetherQueue.userAge, 35), lte(togetherQueue.userAge, 44))!;
    case "45-54":
      return and(gte(togetherQueue.userAge, 45), lte(togetherQueue.userAge, 54))!;
    case "55+":
      return gte(togetherQueue.userAge, 55);
  }
}

function distanceKmBetween(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusKm = 6371;
  const latDelta = toRadians(latitudeB - latitudeA);
  const lngDelta = toRadians(longitudeB - longitudeA);
  const latARadians = toRadians(latitudeA);
  const latBRadians = toRadians(latitudeB);

  const haversine =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(latARadians) * Math.cos(latBRadians) * Math.sin(lngDelta / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export const __geoForTests = {
  areQueueEntriesGeoCompatible,
  distanceKmBetween,
};

export const __queueForTests = {
  areQueueEntriesAgeCompatible,
  areQueueEntriesCompatible,
  areQueueEntriesGenderCompatible,
  getAdminQueueWaitingReason,
  isSameQueueSearch,
  replacementCancelSource,
};
