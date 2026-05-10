import { AppError } from "../common/errors";
import { TOGETHER_HEARTBEAT_TIMEOUT_MS, TOGETHER_QUEUE_TTL_MS } from "../config/constants";
import type {
  JsonValue,
  TogetherEventRow,
  TogetherQueueRow,
  TogetherRevealRow,
  TogetherSessionRow,
} from "../db/schema";
import * as chatService from "../chat/chat.service";
import { isBlockedEitherWay } from "../safety/safety.repo";
import * as togetherRepoImpl from "./together.repo";
import type {
  TogetherActivity,
  TogetherEventBody,
  TogetherEventDto,
  TogetherEventResponse,
  TogetherHistoryResponse,
  TogetherQueueBody,
  TogetherQueueEntryDto,
  TogetherQueueResponse,
  TogetherQueueStatus,
  TogetherRevealBroadcastState,
  TogetherRevealBody,
  TogetherRevealOutcome,
  TogetherRevealResult,
  TogetherRevealResponse,
  TogetherRevealStateDto,
  TogetherSessionDto,
  TogetherSessionResponse,
  TogetherSessionStatus,
  TogetherSessionUpdateResult,
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

type TogetherServiceDeps = {
  repo: typeof togetherRepoImpl;
  openDirectThread: typeof chatService.openDirectThread;
  findDirectThreadIdBySource: typeof chatService.findDirectThreadIdBySource;
  findDirectThreadIdBetween: typeof chatService.findDirectThreadIdBetween;
  isBlockedEitherWay: typeof isBlockedEitherWay;
};

const defaultDeps: TogetherServiceDeps = {
  repo: togetherRepoImpl,
  openDirectThread: chatService.openDirectThread,
  findDirectThreadIdBySource: chatService.findDirectThreadIdBySource,
  findDirectThreadIdBetween: chatService.findDirectThreadIdBetween,
  isBlockedEitherWay,
};

let deps: TogetherServiceDeps = defaultDeps;

export function __setTogetherServiceDepsForTests(
  overrides: Partial<TogetherServiceDeps>,
): () => void {
  const previous = deps;
  deps = {
    ...deps,
    ...overrides,
  };

  return () => {
    deps = previous;
  };
}

export async function enqueue(
  userId: string,
  input: TogetherQueueBody,
): Promise<TogetherQueueResponse> {
  const expiresAt = new Date(Date.now() + TOGETHER_QUEUE_TTL_MS);
  const entry = await deps.repo.enqueueAndMatch({
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
  const entry = await deps.repo.findQueueEntryForOwner(entryId, userId);
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
  const entry = await deps.repo.cancelQueueEntryForOwner(entryId, userId);
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
  return buildSessionResponse(session, userId);
}

export async function createEvent(
  userId: string,
  sessionId: string,
  input: TogetherEventBody,
): Promise<CreateEventResult> {
  const session = await requireSessionMembership(userId, sessionId);
  if (session.status !== "active") {
    throw new AppError(
      "together_session_closed",
      "Together session is closed and no longer accepts events",
      409,
    );
  }

  const result = await deps.repo.createEventIdempotent({
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
): Promise<TogetherSessionUpdateResult> {
  const session = await requireSessionMembership(userId, sessionId);
  if (session.status !== "active") {
    return {
      response: await buildSessionResponse(session, userId),
      changed: false,
    };
  }

  const finishedAt = new Date();
  const updatedSession =
    (await deps.repo.finishActiveSession(sessionId, finishedAt)) ?? session;

  return {
    response: await buildSessionResponse(updatedSession, userId),
    changed: updatedSession.status === "finished",
    reason: "completed",
    actorUserId: userId,
  };
}

export async function leaveSession(
  userId: string,
  sessionId: string,
): Promise<TogetherSessionUpdateResult> {
  const session = await requireSessionMembership(userId, sessionId);
  if (session.status !== "active") {
    return {
      response: await buildSessionResponse(session, userId),
      changed: false,
    };
  }

  const leftAt = new Date();
  await deps.repo.markSessionMemberLeft(sessionId, userId, leftAt);
  const updatedSession =
    (await deps.repo.closeActiveSession(
      sessionId,
      "abandoned",
      "participant_left",
      leftAt,
    )) ?? session;

  return {
    response: await buildSessionResponse(updatedSession, userId),
    changed: updatedSession.status === "abandoned",
    reason: "participant_left",
    actorUserId: userId,
  };
}

export async function heartbeatSession(
  userId: string,
  sessionId: string,
): Promise<TogetherSessionUpdateResult> {
  const session = await requireSessionMembership(userId, sessionId);
  if (session.status !== "active") {
    return {
      response: await buildSessionResponse(session, userId),
      changed: false,
    };
  }

  const now = new Date();
  await deps.repo.updateSessionMemberLastSeen(sessionId, userId, now);

  const stalePeerUserId = await deps.repo.findStalePeerUserId(
    sessionId,
    userId,
    new Date(now.getTime() - TOGETHER_HEARTBEAT_TIMEOUT_MS),
  );

  if (!stalePeerUserId) {
    return {
      response: await buildSessionResponse(session, userId),
      changed: false,
    };
  }

  const updatedSession =
    (await deps.repo.closeActiveSession(
      sessionId,
      "abandoned",
      "partner_disconnected",
      now,
    )) ?? session;

  return {
    response: await buildSessionResponse(updatedSession, userId),
    changed: updatedSession.status === "abandoned",
    reason: "partner_disconnected",
    actorUserId: stalePeerUserId,
  };
}

export async function reveal(
  userId: string,
  sessionId: string,
  input: TogetherRevealBody,
): Promise<TogetherRevealResult> {
  const session = await requireSessionMembership(userId, sessionId);
  if (session.status !== "finished") {
    throw new AppError(
      "together_session_closed",
      "Together session outcome is unavailable until the session is finished",
      409,
    );
  }

  await deps.repo.upsertReveal(sessionId, userId, input.decision);

  const memberUserIds = await deps.repo.listSessionMemberUserIds(sessionId);
  const peerUserId = memberUserIds.find((memberUserId) => memberUserId !== userId);
  const preliminaryState = await buildRevealStateForUser(session, userId, memberUserIds);
  if (preliminaryState.outcome === "open_open" && peerUserId) {
    await deps.openDirectThread(userId, {
      peerUserId,
      source: {
        type: "together",
        sourceId: sessionId,
      },
    });
  }

  const broadcasts = await buildRevealBroadcastStates(session, memberUserIds);
  const revealState =
    broadcasts.find((broadcast) => broadcast.userId === userId)?.revealState ??
    (await buildRevealStateForUser(session, userId, memberUserIds));

  return {
    response: toRevealResponse(revealState),
    broadcasts,
  };
}

export async function getHistory(
  userId: string,
  limit: number,
): Promise<TogetherHistoryResponse> {
  const rows = await deps.repo.listHistorySessions(userId, limit);
  const reveals = await deps.repo.listRevealsForSessions(
    rows.map((row) => row.session.id),
  );
  const revealsBySessionId = groupRevealsBySessionId(reveals);

  return {
    items: await Promise.all(
      rows.map(async (row) => {
        const revealState = await buildRevealStateForUser(
          row.session,
          userId,
          [userId, row.peer.id],
          revealsBySessionId.get(row.session.id) ?? [],
        );

        return {
          sessionId: row.session.id,
          activity: row.session.activity as TogetherActivity,
          status: row.session.status as TogetherSessionStatus,
          promptText: row.session.promptText,
          peer: row.peer,
          outcome: revealState.outcome,
          myDecision: revealState.myDecision,
          threadId: revealState.threadId,
          canOpenChat: revealState.canOpenChat,
          peerDecisionKnown: revealState.peerDecisionKnown,
          createdAt: row.session.createdAt.toISOString(),
          endedAt: row.session.finishedAt?.toISOString() ?? null,
          endedReason: row.session.endedReason ?? null,
        };
      }),
    ),
  };
}

export async function canAccessSession(userId: string, sessionId: string): Promise<boolean> {
  return deps.repo.isSessionMember(sessionId, userId);
}

async function requireSessionMembership(
  userId: string,
  sessionId: string,
): Promise<TogetherSessionRow> {
  const session = await deps.repo.findSessionForMember(sessionId, userId);
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
    endedAt: session.finishedAt?.toISOString() ?? null,
    endedReason: session.endedReason ?? null,
    deadlineAt: session.deadlineAt?.toISOString() ?? null,
  };
}

async function buildSessionResponse(
  session: TogetherSessionRow,
  userId: string,
): Promise<TogetherSessionResponse> {
  const [participants, stateVersion] = await Promise.all([
    deps.repo.listSessionParticipants(session.id),
    deps.repo.countSessionEvents(session.id),
  ]);
  const revealState = await buildRevealStateForUser(
    session,
    userId,
    participants.map((participant) => participant.id),
  );

  return {
    session: toSessionDto(session),
    participants,
    stateVersion,
    revealState,
  };
}

async function buildRevealBroadcastStates(
  session: TogetherSessionRow,
  memberUserIds: string[],
): Promise<TogetherRevealBroadcastState[]> {
  return Promise.all(
    memberUserIds.map(async (memberUserId) => ({
      userId: memberUserId,
      revealState: await buildRevealStateForUser(session, memberUserId, memberUserIds),
    })),
  );
}

async function buildRevealStateForUser(
  session: TogetherSessionRow,
  userId: string,
  memberUserIds: string[],
  reveals?: TogetherRevealRow[],
): Promise<TogetherRevealStateDto> {
  const sessionReveals = reveals ?? (await deps.repo.listSessionReveals(session.id));
  const decisionsByUserId = new Map(
    sessionReveals.map((reveal) => [
      reveal.userId,
      reveal.decision as TogetherRevealStateDto["myDecision"],
    ]),
  );
  const peerUserId = memberUserIds.find((memberUserId) => memberUserId !== userId);
  const myDecision = decisionsByUserId.get(userId) ?? null;
  const peerDecisionKnown = Boolean(peerUserId && decisionsByUserId.has(peerUserId));
  const blocked = session.status === "finished" && peerUserId
    ? await deps.isBlockedEitherWay(userId, peerUserId)
    : false;
  const outcome = blocked ? "blocked" : getOutcome(sessionReveals, memberUserIds);
  const canOpenChat = session.status === "finished" && !blocked;
  let threadId: string | null = null;

  if (outcome === "open_open" && peerUserId) {
    threadId = await deps.findDirectThreadIdBySource({
      type: "together",
      sourceId: session.id,
    });

    if (!threadId) {
      threadId = await deps.findDirectThreadIdBetween(userId, peerUserId);
    }
  }

  return {
    myDecision,
    outcome,
    threadId,
    canOpenChat,
    peerDecisionKnown,
  };
}

function toRevealResponse(revealState: TogetherRevealStateDto): TogetherRevealResponse {
  return {
    outcome: revealState.outcome,
    ...(revealState.threadId ? { threadId: revealState.threadId } : {}),
    revealState,
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
