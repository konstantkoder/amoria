import { AppError, validationError } from "../common/errors";
import {
  PROFILE_GENDERS,
  TOGETHER_HEARTBEAT_TIMEOUT_MS,
  TOGETHER_QUEUE_TTL_MS,
  TOGETHER_RADIUS_KM_VALUES,
  TOGETHER_ARTIFACT_PURGE_DELAY_MS,
} from "../config/constants";
import type {
  JsonValue,
  ProfileGender,
  TogetherEventRow,
  TogetherQueueRow,
  TogetherRevealRow,
  TogetherSessionRow,
} from "../db/schema";
import * as chatService from "../chat/chat.service";
import { isBlockedEitherWay } from "../safety/safety.repo";
import {
  DEFAULT_PREFERRED_AGE_RANGE,
  normalizePreferredAgeRange,
  requireAdultAgeFromBirthDate,
} from "../users/age";
import * as togetherRepoImpl from "./together.repo";
import type {
  TogetherActivity,
  TogetherEventBody,
  TogetherEventDto,
  TogetherEventResponse,
  TogetherHistoryResponse,
  TogetherQueueBody,
  TogetherQueueCancelBody,
  TogetherQueueEntryDto,
  TogetherQueueCancelSource,
  TogetherQueueResponse,
  TogetherQueueStatus,
  TogetherRevealBroadcastState,
  TogetherRevealBody,
  TogetherRevealOutcome,
  TogetherRevealResult,
  TogetherRevealResponse,
  TogetherRevealStateDto,
  TogetherSessionDto,
  TogetherSessionEventsResponse,
  TogetherSessionResponse,
  TogetherSessionStatus,
  TogetherSessionUpdateResult,
} from "./together.types";
import {
  buildStorySparksArtifact,
  getStorySparksPackDto,
  isSameStoryChoice,
  validateStoryChoicePayload,
  type StoryChoicePayload,
} from "./story-sparks";
import * as turnBasedService from "./together-turn-based.service";

const PROMPTS = {
  draw: [
    {
      key: "draw.tinyPlace",
      text: "Draw a tiny place you would both want to visit.",
    },
    {
      key: "draw.firstMeeting",
      text: "Draw two characters meeting for the first time.",
    },
    {
      key: "draw.dreamRoom",
      text: "Draw a shared dream room.",
    },
  ],
  story_sparks: [
    {
      key: "storySparks.tinyStory",
      text: "Build a tiny story together, one card at a time.",
    },
    {
      key: "storySparks.fourSparks",
      text: "Choose four sparks and turn them into a shared mini-story.",
    },
    {
      key: "storySparks.placeDetailTwistEnding",
      text: "Create a small story from a place, detail, twist, and ending.",
    },
  ],
} as const satisfies Record<TogetherActivity, readonly { key: string; text: string }[]>;

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
  const location = normalizeQueueLocation(input);
  const userAgeProfile = await deps.repo.findUserAgeProfile(userId);
  const userAge = requireAdultAgeFromBirthDate(userAgeProfile?.birthDate);
  const gender = requireProfileGender(userAgeProfile?.gender);
  const preferredGenders = requirePreferredGenders(userAgeProfile?.preferredGenders);
  const storedPreference = userAgeProfile
    ? {
        min: userAgeProfile.preferredAgeMin ?? DEFAULT_PREFERRED_AGE_RANGE.min,
        max: userAgeProfile.preferredAgeMax ?? DEFAULT_PREFERRED_AGE_RANGE.max,
      }
    : DEFAULT_PREFERRED_AGE_RANGE;
  const preferredAgeRange = normalizePreferredAgeRange(
    input.preferredAgeRange,
    storedPreference,
  );

  if (input.preferredAgeRange) {
    await deps.repo.updateUserAgePreference(userId, preferredAgeRange);
  }

  const entry = await deps.repo.enqueueAndMatch({
    userId,
    activity: input.activity,
    expiresAt,
    promptText: choosePrompt(input.activity).text,
    userAge,
    preferredAgeMin: preferredAgeRange.min,
    preferredAgeMax: preferredAgeRange.max,
    gender,
    preferredGenders,
    ...location,
  });

  return {
    entry: toQueueEntryDto(entry),
  };
}

function normalizeQueueLocation(
  input: TogetherQueueBody,
): {
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  locationUpdatedAt: Date | null;
} {
  const location = input.location;
  if (!location) {
    throw validationError("Together location is required", { location: "required" });
  }

  const radiusKm = location.radiusKm;
  if (radiusKm !== null && !TOGETHER_RADIUS_KM_VALUES.includes(radiusKm)) {
    throw validationError("Together radius is invalid", { "location.radiusKm": "invalid" });
  }

  const latitude = location.latitude ?? null;
  const longitude = location.longitude ?? null;
  if (!isFiniteCoordinate(latitude, -90, 90)) {
    throw validationError("Latitude is required for Together matching", {
      "location.latitude": "required",
    });
  }

  if (!isFiniteCoordinate(longitude, -180, 180)) {
    throw validationError("Longitude is required for Together matching", {
      "location.longitude": "required",
    });
  }

  return {
    latitude,
    longitude,
    radiusKm,
    locationUpdatedAt: new Date(),
  };
}

function isFiniteCoordinate(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function requireProfileGender(value: string | null | undefined): ProfileGender {
  const gender = toProfileGender(value);
  if (!gender) {
    throw validationError("Gender is required before Together matching", { gender: "required" });
  }
  return gender;
}

function requirePreferredGenders(value: unknown): ProfileGender[] {
  if (!Array.isArray(value)) {
    throw validationError("Preferred genders are required before Together matching", {
      preferredGenders: "required",
    });
  }

  if (!value.every((item) => toProfileGender(item) !== null)) {
    throw validationError("Preferred genders are invalid before Together matching", {
      preferredGenders: "invalid",
    });
  }

  return value as ProfileGender[];
}

function toProfileGender(value: unknown): ProfileGender | null {
  return PROFILE_GENDERS.includes(value as ProfileGender) ? value as ProfileGender : null;
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
  input: TogetherQueueCancelBody = {},
): Promise<TogetherQueueResponse> {
  const entry = await deps.repo.cancelQueueEntryForOwner(entryId, userId, {
    cancelSource: input.cancelSource ?? "unknown",
    cancelReason: sanitizeCancelReason(input.cancelReason),
  });
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
  if (session.mode === "turn_based" && session.activity === "story_sparks") {
    const atomic = await turnBasedService.createStoryChoiceAtomic(sessionId, userId, input);
    return {
      response: { ok: true, created: atomic.created },
      event: toEventDto(atomic.event),
      created: atomic.created,
    };
  }
  if (session.mode === "turn_based") {
    await turnBasedService.validateEventTurn(sessionId, userId, input.type);
  }

  const prepared = await prepareEventForSession(session, userId, input);
  if (prepared.existingEvent) {
    return {
      response: {
        ok: true,
        created: false,
      },
      event: toEventDto(prepared.existingEvent),
      created: false,
    };
  }

  const result = await deps.repo.createEventIdempotent({
    sessionId,
    fromUserId: userId,
    clientEventId: input.clientEventId,
    type: input.type,
    payload: prepared.payload,
  });
  if (result.conflictReason === "story_round") {
    const preparedChoice = validateStoryChoicePayload(prepared.payload).choice;
    if (!preparedChoice || !isSameStoryChoice(result.event.payload, preparedChoice)) {
      throw validationError("Story Sparks round already has a choice from this user", {
        roundId: "already_chosen",
      });
    }
  }
  if (session.mode === "turn_based") {
    await turnBasedService.renewClaimAfterAcceptedStroke(
      sessionId,
      userId,
      result.created,
      input.type,
    );
  }

  return {
    response: {
      ok: true,
      created: result.created,
    },
    event: toEventDto(result.event),
    created: result.created,
  };
}

async function prepareEventForSession(
  session: TogetherSessionRow,
  userId: string,
  input: TogetherEventBody,
): Promise<{ payload: JsonValue; existingEvent?: TogetherEventRow }> {
  if (session.activity === "story_sparks") {
    if (input.type !== "story_choice") {
      throw validationError("Story Sparks sessions only accept story choices", {
        type: "unsupported_for_story_sparks",
      });
    }

    const { choice, details } = validateStoryChoicePayload(input.payload);
    if (!choice) {
      throw validationError("Invalid Story Sparks choice", details);
    }

    const existing = await deps.repo.findStoryChoiceEventForRound(
      session.id,
      userId,
      choice.roundId,
    );
    if (existing) {
      if (isSameStoryChoice(existing.payload, choice)) {
        return {
          payload: existing.payload,
          existingEvent: existing,
        };
      }

      throw validationError("Story Sparks round already has a choice from this user", {
        roundId: "already_chosen",
      });
    }

    return { payload: toStoryChoiceJson(choice) };
  }

  if (input.type === "story_choice") {
    throw validationError("Story choices are only accepted in Story Sparks sessions", {
      type: "unsupported_for_activity",
    });
  }

  if (input.type !== "stroke_batch" && input.type !== "system") {
    throw validationError("Drawing sessions only accept stroke or system events", {
      type: "unsupported_for_draw",
    });
  }

  if (input.type === "stroke_batch") {
    return { payload: validateDrawStrokeBatchPayload(input.payload) };
  }

  return { payload: input.payload };
}

type DrawStrokeTool = "draw" | "erase";

function validateDrawStrokeBatchPayload(payload: JsonValue): JsonValue {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw validationError("Invalid drawing stroke batch", {
      payload: "expected_object",
    });
  }

  const value = payload as Record<string, JsonValue>;
  const rawStrokes = Array.isArray(value.strokes) ? value.strokes : null;
  if (!rawStrokes) {
    throw validationError("Invalid drawing stroke batch", {
      strokes: "expected_array",
    });
  }

  const strokes = rawStrokes.map(normalizeDrawStroke).filter(Boolean);
  const result: Record<string, JsonValue> = { strokes };
  const uid = String(value.uid ?? "").trim();
  const id = String(value.id ?? "").trim();
  if (uid) result.uid = uid;
  if (id) result.id = id;
  return result;
}

function normalizeDrawStroke(value: JsonValue): JsonValue | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("Invalid drawing stroke", {
      stroke: "expected_object",
    });
  }

  const stroke = value as Record<string, JsonValue>;
  const id = String(stroke.id ?? "").trim();
  const tool = normalizeDrawStrokeTool(stroke.tool);
  const color = String(stroke.color ?? "#F97393").trim() || "#F97393";
  const width = Number(stroke.width ?? 6);
  const rawPoints = Array.isArray(stroke.points) ? stroke.points : null;

  if (!id) {
    throw validationError("Invalid drawing stroke", {
      id: "required",
    });
  }
  if (!rawPoints) {
    throw validationError("Invalid drawing stroke", {
      points: "expected_array",
    });
  }
  if (!Number.isFinite(width) || width <= 0 || width > 80) {
    throw validationError("Invalid drawing stroke", {
      width: "invalid",
    });
  }

  const points = rawPoints.map(normalizeDrawPoint);
  if (!points.length) {
    throw validationError("Invalid drawing stroke", {
      points: "required",
    });
  }

  return {
    id,
    tool,
    color,
    width,
    points,
  };
}

function normalizeDrawStrokeTool(value: JsonValue | undefined): DrawStrokeTool {
  if (value == null || value === "draw") return "draw";
  if (value === "erase") return "erase";

  throw validationError("Invalid drawing stroke tool", {
    tool: "unsupported",
  });
}

function normalizeDrawPoint(value: JsonValue): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw validationError("Invalid drawing stroke point", {
      point: "expected_object",
    });
  }

  const point = value as Record<string, JsonValue>;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw validationError("Invalid drawing stroke point", {
      point: "invalid_coordinate",
    });
  }

  const result: Record<string, JsonValue> = { x, y };
  const t = Number(point.t);
  const p = Number(point.p);
  if (Number.isFinite(t)) result.t = t;
  if (Number.isFinite(p)) result.p = p;
  return result;
}

export async function listSessionEventsForMember(
  userId: string,
  sessionId: string,
): Promise<TogetherSessionEventsResponse> {
  const events = await deps.repo.listSessionEventsForMember(userId, sessionId);
  if (!events) {
    throw new AppError("not_found", "Together session not found", 404);
  }

  return {
    items: sortEventsStable(events).map(toEventDto),
    nextCursor: null,
  };
}

export async function finishSession(
  userId: string,
  sessionId: string,
): Promise<TogetherSessionUpdateResult> {
  const session = await requireSessionMembership(userId, sessionId);
  if (session.mode === "turn_based") {
    throw new AppError("together_turn_out_of_order", "Use the turn-based submission action", 409);
  }
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
  if (session.mode === "turn_based") {
    throw new AppError("together_turn_out_of_order", "Turn-based moments remain available after leaving the screen", 409);
  }
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
  if (session.mode === "turn_based") {
    throw new AppError("together_turn_out_of_order", "Use the turn-based lease action", 409);
  }
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
  if (input.decision === "continue_story" && session.activity !== "draw") {
    throw validationError("Story continuation is only available after a drawing session", {
      decision: "unsupported_for_activity",
      activity: session.activity,
    });
  }

  await deps.repo.upsertReveal(sessionId, userId, input.decision);

  const memberUserIds = await deps.repo.listSessionMemberUserIds(sessionId);
  const peerUserId = memberUserIds.find((memberUserId) => memberUserId !== userId);
  const preliminaryState = await buildRevealStateForUser(session, userId, memberUserIds);
  if (preliminaryState.outcome === "open_open" && peerUserId) {
    const existingThreadId = await deps.findDirectThreadIdBySource({
      type: "together",
      sourceId: sessionId,
    });

    if (!existingThreadId) {
      const metadata = await buildTogetherSourceMetadata(session, userId);
      await deps.openDirectThread(userId, {
        peerUserId,
        source: {
          type: "together",
          sourceId: sessionId,
          metadata,
        },
      });
    }
  } else if (preliminaryState.outcome === "continue_story") {
    const continuation = await deps.repo.createStoryContinuationSession({
      sourceSessionId: sessionId,
      memberUserIds,
      promptText: choosePrompt("story_sparks").text,
    });

    if (!continuation) {
      throw new AppError(
        "together_continuation_failed",
        "Story continuation session could not be created",
        500,
      );
    }
  }
  if (
    preliminaryState.outcome !== "pending" &&
    preliminaryState.outcome !== "continue_story"
  ) {
    await deps.repo.scheduleArtifactPurge(
      sessionId,
      new Date(Date.now() + TOGETHER_ARTIFACT_PURGE_DELAY_MS),
    );
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
        const storyArtifact =
          row.session.activity === "story_sparks"
            ? buildStorySparksArtifact(
                (await deps.repo.listSessionEventsForMember(userId, row.session.id)) ?? [],
              )
            : null;

        return {
          sessionId: row.session.id,
          activity: row.session.activity as TogetherActivity,
          status: row.session.status as TogetherSessionStatus,
          promptText: row.session.promptText,
          promptKey: promptKeyFor(row.session.activity, row.session.promptText),
          peer: row.peer,
          outcome: revealState.outcome,
          myDecision: revealState.myDecision,
          threadId: revealState.threadId,
          canOpenChat: revealState.canOpenChat,
          peerDecisionKnown: revealState.peerDecisionKnown,
          nextSessionId: revealState.nextSessionId,
          nextActivity: revealState.nextActivity,
          createdAt: row.session.createdAt.toISOString(),
          endedAt: row.session.finishedAt?.toISOString() ?? null,
          endedReason: row.session.endedReason ?? null,
          ...(storyArtifact ? { storyArtifact } : {}),
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
    createdAt: entry.createdAt.toISOString(),
    expiresAt: entry.expiresAt.toISOString(),
    ...(entry.cancelledAt ? { cancelledAt: entry.cancelledAt.toISOString() } : {}),
    ...(entry.cancelSource ? { cancelSource: entry.cancelSource as TogetherQueueCancelSource } : {}),
  };
}

function sanitizeCancelReason(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed ? trimmed.slice(0, 500) : null;
}

function toSessionDto(session: TogetherSessionRow): TogetherSessionDto {
  const dto: TogetherSessionDto = {
    id: session.id,
    mode: session.mode as "live" | "turn_based",
    activity: session.activity as TogetherActivity,
    status: session.status as TogetherSessionStatus,
    promptText: session.promptText,
    promptKey: promptKeyFor(session.activity, session.promptText),
    createdAt: session.createdAt.toISOString(),
    endedAt: session.finishedAt?.toISOString() ?? null,
    endedReason: session.endedReason ?? null,
    deadlineAt: session.deadlineAt?.toISOString() ?? null,
    sourceSessionId: session.sourceSessionId ?? null,
  };

  if (session.activity === "story_sparks") {
    dto.storyPack = getStorySparksPackDto();
  }

  return dto;
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
  const identityRevealed =
    session.mode !== "turn_based" || revealState.outcome === "open_open";
  const safeParticipants = identityRevealed
    ? participants
    : participants.map((participant) =>
        participant.id === userId
          ? participant
          : {
              id: participant.id,
              displayName: "Another participant",
              avatarUrl: null,
            },
      );

  return {
    session: toSessionDto(session),
    participants: safeParticipants,
    identityRevealed,
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
  let nextSessionId: string | null = null;
  let nextActivity: TogetherActivity | null = null;

  if (outcome === "open_open" && peerUserId) {
    threadId = await deps.findDirectThreadIdBySource({
      type: "together",
      sourceId: session.id,
    });

    if (!threadId) {
      threadId = await deps.findDirectThreadIdBetween(userId, peerUserId);
    }
  } else if (outcome === "continue_story") {
    const continuation = await deps.repo.findContinuationSessionBySource(session.id);
    if (continuation) {
      nextSessionId = continuation.id;
      nextActivity = continuation.activity as TogetherActivity;
    }
  }

  return {
    myDecision,
    outcome,
    threadId,
    canOpenChat,
    peerDecisionKnown,
    nextSessionId,
    nextActivity,
  };
}

function toRevealResponse(revealState: TogetherRevealStateDto): TogetherRevealResponse {
  return {
    outcome: revealState.outcome,
    ...(revealState.threadId ? { threadId: revealState.threadId } : {}),
    ...(revealState.nextSessionId ? { nextSessionId: revealState.nextSessionId } : {}),
    ...(revealState.nextActivity ? { nextActivity: revealState.nextActivity } : {}),
    revealState,
  };
}

async function buildTogetherSourceMetadata(
  session: TogetherSessionRow,
  userId: string,
): Promise<JsonValue> {
  const metadata: Record<string, JsonValue> = {
    activity: session.activity,
    promptText: session.promptText,
    promptKey: promptKeyFor(session.activity, session.promptText),
  };

  if (session.sourceSessionId) {
    metadata.sourceSessionId = session.sourceSessionId;
    const sourceSession = await deps.repo.findSessionForMember(session.sourceSessionId, userId);
    if (sourceSession) {
      metadata.sourceActivity = sourceSession.activity;
      metadata.sourcePromptText = sourceSession.promptText;
      metadata.sourcePromptKey = promptKeyFor(sourceSession.activity, sourceSession.promptText);
      if (sourceSession.activity === "draw") {
        const sourceEvents =
          (await deps.repo.listSessionEventsForMember(userId, sourceSession.id)) ?? [];
        metadata.drawSessionId = sourceSession.id;
        metadata.drawPromptText = sourceSession.promptText;
        metadata.drawPromptKey = promptKeyFor(sourceSession.activity, sourceSession.promptText);
        metadata.drawEventCount = sourceEvents.length;
      }
    }
  }

  if (session.activity !== "story_sparks") {
    return metadata;
  }

  const events = (await deps.repo.listSessionEventsForMember(userId, session.id)) ?? [];
  const artifact = buildStorySparksArtifact(events);
  if (!artifact) {
    return metadata;
  }

  metadata.storyTitle = artifact.title as unknown as JsonValue;
  metadata.summary = artifact.summary as unknown as JsonValue;
  metadata.selectedCards = artifact.rounds as unknown as JsonValue;
  metadata.storyArtifact = artifact as unknown as JsonValue;
  return metadata;
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

function toStoryChoiceJson(choice: StoryChoicePayload): JsonValue {
  return {
    roundId: choice.roundId,
    cardId: choice.cardId,
    packId: choice.packId,
    clientRoundIndex: choice.clientRoundIndex,
  };
}

function sortEventsStable(events: TogetherEventRow[]): TogetherEventRow[] {
  return [...events].sort((left, right) => {
    const byCreatedAt = left.createdAt.getTime() - right.createdAt.getTime();
    if (byCreatedAt !== 0) {
      return byCreatedAt;
    }

    return left.id.localeCompare(right.id);
  });
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

  if (decisions.every((decision) => decision === "continue_story")) {
    return "continue_story";
  }

  if (decisions.some((decision) => decision === "continue_story")) {
    return "mixed_intent";
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

function choosePrompt(activity: TogetherActivity): { key: string; text: string } {
  const prompts = PROMPTS[activity];
  return prompts[Math.floor(Math.random() * prompts.length)] ?? prompts[0];
}

function promptKeyFor(activity: string, promptText: string): string | null {
  if (activity !== "draw" && activity !== "story_sparks") {
    return null;
  }

  const prompt = PROMPTS[activity].find((candidate) => candidate.text === promptText);
  return prompt?.key ?? null;
}
