import { AppError } from "../common/errors";
import { TOGETHER_QUEUE_TTL_MS } from "../config/constants";
import type {
  JsonValue,
  TogetherEventRow,
  TogetherQueueRow,
  TogetherRevealRow,
  TogetherSessionRow,
} from "../db/schema";
import * as chatService from "../chat/chat.service";
import { isBlockedEitherWay } from "../safety/safety.repo";
import * as togetherRepo from "./together.repo";
import type {
  OkResponse,
  TogetherActivity,
  TogetherEventBody,
  TogetherEventDto,
  TogetherEventResponse,
  TogetherHistoryResponse,
  TogetherQueueBody,
  TogetherQueueEntryDto,
  TogetherQueueResponse,
  TogetherQueueStatus,
  TogetherRevealBody,
  TogetherRevealOutcome,
  TogetherRevealResponse,
  TogetherSessionDto,
  TogetherSessionResponse,
  TogetherSessionStatus,
} from "./together.types";

const PROMPTS = [
  "Draw a tiny place you would both want to visit.",
  "Draw two characters meeting for the first time.",
  "Draw a shared dream room.",
] as const;

export type CreateEventResult = {
  response: TogetherEventResponse;
  event: TogetherEventDto;
  created: boolean;
};

export async function enqueue(
  userId: string,
  input: TogetherQueueBody,
): Promise<TogetherQueueResponse> {
  const expiresAt = new Date(Date.now() + TOGETHER_QUEUE_TTL_MS);
  const entry = await togetherRepo.enqueueAndMatch({
    userId,
    activity: input.activity,
    expiresAt,
    promptText: choosePrompt(),
  });

  return {
    entry: toQueueEntryDto(entry),
  };
}

export async function getQueueEntry(
  userId: string,
  entryId: string,
): Promise<TogetherQueueResponse> {
  const entry = await togetherRepo.findQueueEntryForOwner(entryId, userId);
  if (!entry) {
    throw new AppError("not_found", "Queue entry not found", 404);
  }

  return {
    entry: toQueueEntryDto(entry),
  };
}

export async function cancelQueueEntry(
  userId: string,
  entryId: string,
): Promise<TogetherQueueResponse> {
  const entry = await togetherRepo.cancelQueueEntryForOwner(entryId, userId);
  if (!entry) {
    throw new AppError("not_found", "Queue entry not found", 404);
  }

  return {
    entry: toQueueEntryDto(entry),
  };
}

export async function getSession(
  userId: string,
  sessionId: string,
): Promise<TogetherSessionResponse> {
  const session = await requireSessionMembership(userId, sessionId);
  const [participants, stateVersion] = await Promise.all([
    togetherRepo.listSessionParticipants(sessionId),
    togetherRepo.countSessionEvents(sessionId),
  ]);

  return {
    session: toSessionDto(session),
    participants,
    stateVersion,
  };
}

export async function createEvent(
  userId: string,
  sessionId: string,
  input: TogetherEventBody,
): Promise<CreateEventResult> {
  await requireSessionMembership(userId, sessionId);

  const result = await togetherRepo.createEventIdempotent({
    sessionId,
    fromUserId: userId,
    clientEventId: input.clientEventId,
    type: input.type,
    payload: input.payload,
  });

  return {
    response: {
      ok: true,
      created: result.created,
    },
    event: toEventDto(result.event),
    created: result.created,
  };
}

export async function finishSession(
  userId: string,
  sessionId: string,
): Promise<OkResponse> {
  await requireSessionMembership(userId, sessionId);
  await togetherRepo.finishSession(sessionId);
  return { ok: true };
}

export async function reveal(
  userId: string,
  sessionId: string,
  input: TogetherRevealBody,
): Promise<TogetherRevealResponse> {
  await requireSessionMembership(userId, sessionId);
  await togetherRepo.upsertReveal(sessionId, userId, input.decision);

  const [reveals, memberUserIds] = await Promise.all([
    togetherRepo.listSessionReveals(sessionId),
    togetherRepo.listSessionMemberUserIds(sessionId),
  ]);
  const outcome = getOutcome(reveals, memberUserIds);
  if (outcome !== "open_open") {
    return { outcome };
  }

  const peerUserId = memberUserIds.find((memberUserId) => memberUserId !== userId);
  if (!peerUserId) {
    return { outcome };
  }

  if (await isBlockedEitherWay(userId, peerUserId)) {
    return { outcome: "blocked" };
  }

  const response = await chatService.openDirectThread(userId, {
    peerUserId,
    source: {
      type: "together",
      sourceId: sessionId,
    },
  });

  return {
    outcome,
    threadId: response.thread.id,
  };
}

export async function getHistory(
  userId: string,
  limit: number,
): Promise<TogetherHistoryResponse> {
  const rows = await togetherRepo.listHistorySessions(userId, limit);
  const reveals = await togetherRepo.listRevealsForSessions(
    rows.map((row) => row.session.id),
  );
  const revealsBySessionId = groupRevealsBySessionId(reveals);

  return {
    items: rows.map((row) => ({
      sessionId: row.session.id,
      activity: row.session.activity as TogetherActivity,
      promptText: row.session.promptText,
      peer: row.peer,
      outcome: getOutcome(revealsBySessionId.get(row.session.id) ?? [], [
        userId,
        row.peer.id,
      ]),
      createdAt: row.session.createdAt.toISOString(),
    })),
  };
}

export async function canAccessSession(userId: string, sessionId: string): Promise<boolean> {
  return togetherRepo.isSessionMember(sessionId, userId);
}

async function requireSessionMembership(
  userId: string,
  sessionId: string,
): Promise<TogetherSessionRow> {
  const session = await togetherRepo.findSessionForMember(sessionId, userId);
  if (!session) {
    throw new AppError("not_found", "Together session not found", 404);
  }

  return session;
}

function toQueueEntryDto(entry: TogetherQueueRow): TogetherQueueEntryDto {
  return {
    id: entry.id,
    status: entry.status as TogetherQueueStatus,
    ...(entry.matchedSessionId ? { sessionId: entry.matchedSessionId } : {}),
    expiresAt: entry.expiresAt.toISOString(),
  };
}

function toSessionDto(session: TogetherSessionRow): TogetherSessionDto {
  return {
    id: session.id,
    activity: session.activity as TogetherActivity,
    status: session.status as TogetherSessionStatus,
    promptText: session.promptText,
    createdAt: session.createdAt.toISOString(),
  };
}

function toEventDto(event: TogetherEventRow): TogetherEventDto {
  return {
    id: event.id,
    sessionId: event.sessionId,
    fromUserId: event.fromUserId,
    clientEventId: event.clientEventId,
    type: event.type as TogetherEventDto["type"],
    payload: event.payload as JsonValue,
    createdAt: event.createdAt.toISOString(),
  };
}

function getOutcome(
  reveals: TogetherRevealRow[],
  memberUserIds: string[],
): TogetherRevealOutcome {
  const decisionsByUserId = new Map(reveals.map((reveal) => [reveal.userId, reveal.decision]));
  const decisions = memberUserIds.map((memberUserId) => decisionsByUserId.get(memberUserId));
  if (decisions.length < 2 || decisions.some((decision) => !decision)) {
    return "pending";
  }

  if (decisions.every((decision) => decision === "open")) {
    return "open_open";
  }

  if (decisions.every((decision) => decision === "skip")) {
    return "skip_skip";
  }

  return "open_skip";
}

function groupRevealsBySessionId(
  reveals: TogetherRevealRow[],
): Map<string, TogetherRevealRow[]> {
  const bySessionId = new Map<string, TogetherRevealRow[]>();
  for (const reveal of reveals) {
    const sessionReveals = bySessionId.get(reveal.sessionId) ?? [];
    sessionReveals.push(reveal);
    bySessionId.set(reveal.sessionId, sessionReveals);
  }

  return bySessionId;
}

function choosePrompt(): string {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}
