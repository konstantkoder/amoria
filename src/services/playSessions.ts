import {
  type Firestore,
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { makeNickname } from "@/services/rooms";

export type PlayActivity = "draw" | "chain_draw" | "daily_prompt";
export type PlayActivityLabelTone = "action" | "history" | "neutral";
export type PlayDailyPrompt = {
  id: string;
  text: string;
};

export const CHAIN_DRAW_TURN_DURATION_SEC = 30;
export const CHAIN_DRAW_MAX_TURNS = 10;
const DAILY_PROMPT_POOL: PlayDailyPrompt[] = [
  { id: "dream_city", text: "Город мечты" },
  { id: "symbol_of_joy", text: "Символ радости" },
  { id: "night_light", text: "Ночной свет" },
  { id: "return_place", text: "Место, куда хочется вернуться" },
  { id: "perfect_evening", text: "Идеальный вечер" },
  { id: "lucky_sign", text: "Знак удачи" },
  { id: "summer_memory", text: "Воспоминание о лете" },
  { id: "quiet_world", text: "Тихий мир" },
  { id: "imagined_home", text: "Дом, которого не было" },
  { id: "bridge_between_two", text: "Мост между двумя людьми" },
  { id: "sky_after_rain", text: "Небо после дождя" },
  { id: "color_of_hope", text: "Цвет надежды" },
];

export type PlayQueueStatus = "waiting" | "matched" | "cancelled";
export type PlaySessionStatus = "matching" | "active" | "finished" | "revealed";
export type PlayRevealDecision = "open" | "skip";
export type PlayRevealOutcome =
  | "open_open"
  | "open_skip"
  | "skip_skip"
  | "waiting";

export type PlayRevealCopy = {
  shortLabel: string;
  description: string;
};

export type PlayQueueDoc = {
  uid: string;
  activity: PlayActivity;
  createdAt: number;
  updatedAt: number;
  status: PlayQueueStatus;
  nickname?: string;
  sessionId?: string;
};

export type PlaySessionDoc = {
  id: string;
  activity: PlayActivity;
  status: PlaySessionStatus;
  createdAt: number;
  startedAt: number;
  endedAt?: number;
  promptId?: string;
  promptText?: string;
  participantIds: string[];
  participantNicknames: Record<string, string>;
  turnOrder?: string[];
  currentTurnUid?: string;
  turnIndex?: number;
  turnDurationSec?: number;
  maxTurns?: number;
  turnStartedAt?: number;
  revealDecisions?: Record<string, PlayRevealDecision>;
  resultStrokeCount?: number;
};

export type PlayHistoryItem = {
  id: string;
  sessionId: string;
  activity: PlayActivity;
  promptId?: string;
  promptText?: string;
  peer: {
    uid: string;
    nickname: string;
  };
  sortAt: number;
  strokeCount?: number;
  revealOutcome: PlayRevealOutcome;
};

export type PlayStrokePoint = {
  x: number;
  y: number;
  t: number;
  p?: number;
};

export type PlayStroke = {
  id: string;
  color: string;
  width: number;
  points: PlayStrokePoint[];
};

export type PlayStrokeBatch = {
  id: string;
  uid: string;
  kind: "stroke_batch";
  createdAt: number;
  strokes: PlayStroke[];
};

export type PlayChainTurnState = {
  turnOrder: string[];
  currentTurnUid: string;
  turnIndex: number;
  turnDurationSec: number;
  maxTurns: number;
  turnStartedAt: number;
};

export type AdvanceChainDrawTurnResult = {
  state: "advanced" | "finished" | "stale" | "ignored";
  turnIndex?: number;
  currentTurnUid?: string;
};

export function isPlayActivity(value: unknown): value is PlayActivity {
  return value === "draw" || value === "chain_draw" || value === "daily_prompt";
}

function normalizePlayActivity(value: unknown): PlayActivity {
  switch (value) {
    case "chain_draw":
      return "chain_draw";
    case "daily_prompt":
      return "daily_prompt";
    default:
      return "draw";
  }
}

function normalizePositiveNumber(value: unknown, fallback: number) {
  const next = Number(value);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.floor(next);
}

function normalizeTurnIndex(value: unknown) {
  const next = Number(value);
  if (!Number.isFinite(next) || next < 0) return 0;
  return Math.floor(next);
}

function normalizeTurnOrder(value: unknown, participantIds: string[]) {
  const fallback = participantIds.filter(Boolean);
  if (!Array.isArray(value)) return fallback;

  const deduped = value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

  return deduped.length ? deduped : fallback;
}

function normalizePromptString(value: unknown) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function getUtcDaySeed(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000
  );
}

export function getPlayDailyPromptPool() {
  return DAILY_PROMPT_POOL;
}

export function getPlayDailyPromptById(promptId: string): PlayDailyPrompt | null {
  const stablePromptId = normalizePromptString(promptId);
  if (!stablePromptId) return null;
  return DAILY_PROMPT_POOL.find((item) => item.id === stablePromptId) ?? null;
}

export function getPlayDailyPromptForTimestamp(timestamp: number): PlayDailyPrompt | null {
  const daySeed = getUtcDaySeed(timestamp);
  if (daySeed == null || !DAILY_PROMPT_POOL.length) return null;

  const index =
    ((daySeed % DAILY_PROMPT_POOL.length) + DAILY_PROMPT_POOL.length) %
    DAILY_PROMPT_POOL.length;
  return DAILY_PROMPT_POOL[index] ?? DAILY_PROMPT_POOL[0] ?? null;
}

function resolvePlayPromptFromParts(
  activity: string,
  promptId: unknown,
  promptText: unknown,
  fallbackAt?: number
): PlayDailyPrompt | null {
  if (activity !== "daily_prompt") return null;

  const stablePromptId = normalizePromptString(promptId);
  const stablePromptText = normalizePromptString(promptText);
  const promptById = stablePromptId ? getPlayDailyPromptById(stablePromptId) : null;

  if (promptById) {
    return stablePromptText ? { ...promptById, text: stablePromptText } : promptById;
  }

  if (stablePromptText) {
    return {
      id: stablePromptId || "daily_prompt",
      text: stablePromptText,
    };
  }

  if (fallbackAt != null) {
    return getPlayDailyPromptForTimestamp(fallbackAt);
  }

  return null;
}

export function getPlaySessionPrompt(
  session:
    | Pick<PlaySessionDoc, "activity" | "promptId" | "promptText" | "createdAt" | "startedAt">
    | null
    | undefined
): PlayDailyPrompt | null {
  if (!session) return null;
  const fallbackAt =
    session.startedAt > 0
      ? session.startedAt
      : session.createdAt > 0
        ? session.createdAt
        : undefined;

  return resolvePlayPromptFromParts(
    session.activity,
    session.promptId,
    session.promptText,
    fallbackAt
  );
}

function buildInitialChainDrawState(
  participantIds: string[],
  startedAt: number
): PlayChainTurnState | null {
  const turnOrder = normalizeTurnOrder(participantIds, participantIds);
  if (!turnOrder.length) return null;

  return {
    turnOrder,
    currentTurnUid: turnOrder[0],
    turnIndex: 0,
    turnDurationSec: CHAIN_DRAW_TURN_DURATION_SEC,
    maxTurns: CHAIN_DRAW_MAX_TURNS,
    turnStartedAt: startedAt,
  };
}

export function getPlayActivityLabel(
  activity: string,
  tone: PlayActivityLabelTone = "neutral"
) {
  switch (activity) {
    case "draw":
      if (tone === "action") return "Нарисовать вместе";
      if (tone === "history") return "Нарисовали вместе";
      return "Свободный общий рисунок";
    case "chain_draw":
      return "Рисунок по очереди";
    case "daily_prompt":
      return "Общая тема дня";
    default:
      return "Совместная сессия";
  }
}

export function getPlayActivityStoryText(activity: string, promptText?: string) {
  switch (activity) {
    case "draw":
      return "Совместный рисунок, который сохранился в вашей общей истории.";
    case "chain_draw":
      return "Общий рисунок, который вы собирали по очереди и сохранили в вашей общей истории.";
    case "daily_prompt":
      return promptText?.trim()
        ? `Один рисунок на двоих по теме «${promptText.trim()}».`
        : "Один рисунок на двоих по общей теме дня.";
    default:
      return "Совместная история";
  }
}

export function getChainDrawTurnState(
  session: Pick<
    PlaySessionDoc,
    | "activity"
    | "participantIds"
    | "startedAt"
    | "turnOrder"
    | "currentTurnUid"
    | "turnIndex"
    | "turnDurationSec"
    | "maxTurns"
    | "turnStartedAt"
  >
): PlayChainTurnState | null {
  if (session.activity !== "chain_draw") return null;

  const turnOrder = normalizeTurnOrder(session.turnOrder, session.participantIds);
  if (!turnOrder.length) return null;

  const turnIndex = normalizeTurnIndex(session.turnIndex);
  const turnDurationSec = normalizePositiveNumber(
    session.turnDurationSec,
    CHAIN_DRAW_TURN_DURATION_SEC
  );
  const maxTurns = normalizePositiveNumber(session.maxTurns, CHAIN_DRAW_MAX_TURNS);
  const currentTurnUid =
    session.currentTurnUid && turnOrder.includes(session.currentTurnUid)
      ? session.currentTurnUid
      : turnOrder[turnIndex % turnOrder.length] ?? turnOrder[0];

  return {
    turnOrder,
    currentTurnUid,
    turnIndex,
    turnDurationSec,
    maxTurns,
    turnStartedAt: normalizePositiveNumber(session.turnStartedAt, session.startedAt),
  };
}

function buildChainDrawPatch(turn: PlayChainTurnState) {
  return {
    turnOrder: turn.turnOrder,
    currentTurnUid: turn.currentTurnUid,
    turnIndex: turn.turnIndex,
    turnDurationSec: turn.turnDurationSec,
    maxTurns: turn.maxTurns,
    turnStartedAt: turn.turnStartedAt,
  };
}

function asPlayQueueDoc(id: string, raw: unknown): PlayQueueDoc {
  const data = (raw ?? {}) as Partial<PlayQueueDoc>;
  const nickname =
    typeof data.nickname === "string" && data.nickname.trim()
      ? data.nickname.trim()
      : typeof (raw as { displayName?: unknown })?.displayName === "string" &&
          String((raw as { displayName?: unknown }).displayName).trim()
        ? String((raw as { displayName?: unknown }).displayName).trim()
        : "";
  return {
    uid: String(data.uid ?? id),
    activity: normalizePlayActivity(data.activity),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
    status: (data.status ?? "waiting") as PlayQueueStatus,
    ...(nickname ? { nickname } : {}),
    ...(data.sessionId ? { sessionId: String(data.sessionId) } : {}),
  };
}

function resolveQueueNickname(queue: Pick<PlayQueueDoc, "uid" | "nickname">) {
  const nickname = queue.nickname?.trim();
  if (nickname) return nickname;
  return makeNickname(queue.uid || "peer");
}

function asPlaySessionDoc(id: string, raw: unknown): PlaySessionDoc {
  const data = (raw ?? {}) as Partial<PlaySessionDoc>;
  const promptId = normalizePromptString(data.promptId);
  const promptText = normalizePromptString(data.promptText);
  return {
    id,
    activity: normalizePlayActivity(data.activity),
    status: (data.status ?? "matching") as PlaySessionStatus,
    createdAt: Number(data.createdAt ?? 0),
    startedAt: Number(data.startedAt ?? data.createdAt ?? 0),
    ...(data.endedAt != null ? { endedAt: Number(data.endedAt) } : {}),
    ...(promptId ? { promptId } : {}),
    ...(promptText ? { promptText } : {}),
    participantIds: Array.isArray(data.participantIds)
      ? data.participantIds.map((value) => String(value))
      : [],
    participantNicknames:
      data.participantNicknames && typeof data.participantNicknames === "object"
        ? Object.fromEntries(
            Object.entries(data.participantNicknames).map(([key, value]) => [
              key,
              String(value ?? ""),
            ])
          )
        : {},
    ...(Array.isArray(data.turnOrder)
      ? {
          turnOrder: data.turnOrder.map((value) => String(value ?? "")).filter(Boolean),
        }
      : {}),
    ...(data.currentTurnUid ? { currentTurnUid: String(data.currentTurnUid) } : {}),
    ...(data.turnIndex != null ? { turnIndex: normalizeTurnIndex(data.turnIndex) } : {}),
    ...(data.turnDurationSec != null
      ? {
          turnDurationSec: normalizePositiveNumber(
            data.turnDurationSec,
            CHAIN_DRAW_TURN_DURATION_SEC
          ),
        }
      : {}),
    ...(data.maxTurns != null
      ? { maxTurns: normalizePositiveNumber(data.maxTurns, CHAIN_DRAW_MAX_TURNS) }
      : {}),
    ...(data.turnStartedAt != null
      ? { turnStartedAt: Number(data.turnStartedAt) }
      : {}),
    ...(data.revealDecisions && typeof data.revealDecisions === "object"
      ? {
          revealDecisions: Object.fromEntries(
            Object.entries(data.revealDecisions).map(([key, value]) => [
              key,
              value === "open" ? "open" : "skip",
            ])
          ) as Record<string, PlayRevealDecision>,
        }
      : {}),
    ...(data.resultStrokeCount != null
      ? { resultStrokeCount: Number(data.resultStrokeCount) }
      : {}),
  };
}

function asPlayStrokeBatch(id: string, raw: unknown): PlayStrokeBatch {
  const data = (raw ?? {}) as Partial<PlayStrokeBatch>;
  return {
    id,
    uid: String(data.uid ?? ""),
    kind: "stroke_batch",
    createdAt: Number(data.createdAt ?? 0),
    strokes: Array.isArray(data.strokes)
      ? data.strokes.map((stroke) => {
          const value = (stroke ?? {}) as Partial<PlayStroke>;
          return {
            id: String(value.id ?? ""),
            color: String(value.color ?? "#000000"),
            width: Number(value.width ?? 1),
            points: Array.isArray(value.points)
              ? value.points.map((point) => {
                  const p = (point ?? {}) as Partial<PlayStrokePoint>;
                  return {
                    x: Number(p.x ?? 0),
                    y: Number(p.y ?? 0),
                    t: Number(p.t ?? 0),
                    ...(p.p != null ? { p: Number(p.p) } : {}),
                  };
                })
              : [],
          };
        })
      : [],
  };
}

export async function enqueuePlayRequest(
  db: Firestore,
  uid: string,
  activity: PlayActivity,
  nickname?: string
): Promise<void> {
  const now = Date.now();
  const ref = doc(db, "playQueue", uid);
  await setDoc(
    ref,
    {
      uid,
      activity,
      createdAt: now,
      updatedAt: now,
      status: "waiting" satisfies PlayQueueStatus,
      ...(nickname?.trim() ? { nickname: nickname.trim() } : {}),
    },
    { merge: true }
  );
}

export async function cancelPlayRequest(db: Firestore, uid: string): Promise<void> {
  const queueRef = doc(db, "playQueue", uid);
  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(queueRef);
    if (!snapshot.exists()) return;

    const current = asPlayQueueDoc(snapshot.id, snapshot.data());
    if (current.status === "matched" && current.sessionId) return;
    if (current.status === "cancelled") return;

    tx.set(
      queueRef,
      {
        uid,
        updatedAt: Date.now(),
        status: "cancelled" satisfies PlayQueueStatus,
      },
      { merge: true }
    );
  });
}

export function subscribeOwnQueueEntry(
  db: Firestore,
  uid: string,
  onData: (data: PlayQueueDoc | null) => void
) {
  return onSnapshot(doc(db, "playQueue", uid), (snapshot) => {
    if (!snapshot.exists()) {
      onData(null);
      return;
    }
    onData(asPlayQueueDoc(snapshot.id, snapshot.data()));
  });
}

export async function tryMatchWaitingPlayer(
  db: Firestore,
  uid: string,
  nickname: string,
  activity: PlayActivity
): Promise<{ sessionId: string; matched: boolean }> {
  const queueRef = doc(db, "playQueue", uid);
  const waitingQuery = query(
    collection(db, "playQueue"),
    where("activity", "==", activity),
    where("status", "==", "waiting"),
    orderBy("createdAt", "asc"),
    limit(10)
  );
  const waitingSnapshot = await getDocs(waitingQuery);
  const candidateIds = waitingSnapshot.docs
    .map((item) => item.id)
    .filter((candidateId) => candidateId !== uid);

  return runTransaction(db, async (tx) => {
    const now = Date.now();
    const ownSnapshot = await tx.get(queueRef);

    if (ownSnapshot.exists()) {
      const ownQueue = asPlayQueueDoc(ownSnapshot.id, ownSnapshot.data());
      if (ownQueue.status === "matched" && ownQueue.sessionId) {
        return { sessionId: ownQueue.sessionId, matched: true };
      }
      if (ownQueue.status === "cancelled") {
        return { sessionId: "", matched: false };
      }
    }

    let candidateData: PlayQueueDoc | null = null;

    for (const candidateId of candidateIds) {
      const candidateSnapshot = await tx.get(doc(db, "playQueue", candidateId));
      if (!candidateSnapshot.exists()) continue;

      const value = asPlayQueueDoc(candidateSnapshot.id, candidateSnapshot.data());
      if (value.uid === uid) continue;
      if (value.activity !== activity || value.status !== "waiting") continue;

      candidateData = value;
      break;
    }

    if (!candidateData) {
      const createdAt = ownSnapshot.exists()
        ? Number(ownSnapshot.data().createdAt ?? now)
        : now;

      tx.set(
        queueRef,
        {
          uid,
          activity,
          createdAt,
          updatedAt: now,
          status: "waiting" satisfies PlayQueueStatus,
          ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
        },
        { merge: true }
      );

      return { sessionId: "", matched: false };
    }

    const sessionRef = doc(collection(db, "playSessions"));
    const sessionId = sessionRef.id;
    const participantIds = [candidateData.uid, uid];
    const participantNicknames: Record<string, string> = {
      [candidateData.uid]: resolveQueueNickname(candidateData),
      [uid]: nickname.trim() || makeNickname(uid || "me"),
    };
    const chainDrawState =
      activity === "chain_draw" ? buildInitialChainDrawState(participantIds, now) : null;
    const prompt =
      activity === "daily_prompt" ? getPlayDailyPromptForTimestamp(now) : null;

    tx.set(sessionRef, {
      id: sessionId,
      activity,
      status: "active" satisfies PlaySessionStatus,
      createdAt: now,
      startedAt: now,
      ...(prompt
        ? {
            promptId: prompt.id,
            promptText: prompt.text,
          }
        : {}),
      participantIds,
      participantNicknames,
      ...(chainDrawState ? buildChainDrawPatch(chainDrawState) : {}),
    });

    tx.set(
      doc(db, "playQueue", candidateData.uid),
      {
        updatedAt: now,
        status: "matched" satisfies PlayQueueStatus,
        sessionId,
      },
      { merge: true }
    );

    tx.set(
      queueRef,
      {
        uid,
        activity,
        createdAt: ownSnapshot.exists()
          ? Number(ownSnapshot.data().createdAt ?? now)
          : now,
        updatedAt: now,
        status: "matched" satisfies PlayQueueStatus,
        sessionId,
      },
      { merge: true }
    );

    return { sessionId, matched: true };
  });
}

export function subscribePlaySession(
  db: Firestore,
  sessionId: string,
  onData: (data: PlaySessionDoc | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "playSessions", sessionId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(asPlaySessionDoc(snapshot.id, snapshot.data()));
    },
    (error) => {
      onError?.(error);
      onData(null);
    }
  );
}

export function isMutualOpenPlaySession(session: PlaySessionDoc) {
  if (!session.participantIds.length) return false;
  return session.participantIds.every(
    (participantId) => session.revealDecisions?.[participantId] === "open"
  );
}

export function resolvePlayRevealOutcome(
  session: Pick<PlaySessionDoc, "participantIds" | "revealDecisions">
): PlayRevealOutcome {
  const values = session.participantIds
    .map((participantId) => session.revealDecisions?.[participantId])
    .filter((value): value is PlayRevealDecision => value === "open" || value === "skip");

  if (values.length < session.participantIds.length) return "waiting";
  if (values.every((value) => value === "open")) return "open_open";
  if (values.every((value) => value === "skip")) return "skip_skip";
  return "open_skip";
}

export function getPlayRevealCopy(outcome: PlayRevealOutcome): PlayRevealCopy {
  switch (outcome) {
    case "open_open":
      return {
        shortLabel: "Оба открыли",
        description: "Вы оба выбрали открыть и перевели совместную сессию в личный контакт.",
      };
    case "open_skip":
      return {
        shortLabel: "Один пропустил",
        description: "Один участник выбрал открыть, а второй решил пропустить раскрытие.",
      };
    case "skip_skip":
      return {
        shortLabel: "Оба пропустили",
        description: "Вы оба решили оставить эту совместную сессию без дальнейшего раскрытия.",
      };
    default:
      return {
        shortLabel: "Ждём решение второго",
        description: "Одно решение уже есть, а второе ещё не пришло.",
      };
  }
}

export function mapPlaySessionToHistoryItem(
  session: PlaySessionDoc,
  uid: string
): PlayHistoryItem | null {
  const peer = getPeerFromSession(session, uid);
  if (!peer) return null;
  const prompt = getPlaySessionPrompt(session);

  return {
    id: session.id,
    sessionId: session.id,
    activity: session.activity,
    ...(prompt
      ? {
          promptId: prompt.id,
          promptText: prompt.text,
        }
      : {}),
    peer,
    sortAt: session.endedAt ?? session.startedAt ?? session.createdAt,
    ...(session.resultStrokeCount != null ? { strokeCount: session.resultStrokeCount } : {}),
    revealOutcome: resolvePlayRevealOutcome(session),
  };
}

function isCompletedPlaySession(session: PlaySessionDoc) {
  return (
    session.status === "finished" ||
    session.status === "revealed" ||
    session.endedAt != null
  );
}

function getPlaySessionSortAt(session: Pick<PlaySessionDoc, "createdAt" | "startedAt" | "endedAt">) {
  return session.endedAt ?? session.startedAt ?? session.createdAt;
}

export function subscribeRecentMutualPlaySessions(
  db: Firestore,
  uid: string,
  onData: (data: PlaySessionDoc[]) => void,
  maxItems = 5,
  onError?: (error: Error) => void
) {
  const sessionsQuery = query(
    collection(db, "playSessions"),
    where("participantIds", "array-contains", uid)
  );

  return onSnapshot(
    sessionsQuery,
    (snapshot) => {
      const next = snapshot.docs
        .map((item) => asPlaySessionDoc(item.id, item.data()))
        .filter((session) => isMutualOpenPlaySession(session))
        .sort((a, b) => getPlaySessionSortAt(b) - getPlaySessionSortAt(a))
        .slice(0, maxItems);

      onData(next);
    },
    (error) => {
      onError?.(error);
      onData([]);
    }
  );
}

export function subscribeMyPlayHistory(
  db: Firestore,
  uid: string,
  onData: (data: PlayHistoryItem[]) => void,
  onError?: (error: Error) => void
) {
  const sessionsQuery = query(
    collection(db, "playSessions"),
    where("participantIds", "array-contains", uid)
  );

  return onSnapshot(
    sessionsQuery,
    (snapshot) => {
      const next = snapshot.docs
        .map((item) => asPlaySessionDoc(item.id, item.data()))
        .filter(isCompletedPlaySession)
        .map((session) => mapPlaySessionToHistoryItem(session, uid))
        .filter((item): item is PlayHistoryItem => Boolean(item))
        .sort((a, b) => b.sortAt - a.sortAt);

      onData(next);
    },
    (error) => {
      onError?.(error);
      onData([]);
    }
  );
}

export function subscribePlayEvents(
  db: Firestore,
  sessionId: string,
  onData: (data: PlayStrokeBatch[]) => void,
  onError?: (error: Error) => void
) {
  const eventsQuery = query(
    collection(db, "playSessions", sessionId, "events"),
    orderBy("createdAt", "asc"),
    limit(200)
  );

  return onSnapshot(
    eventsQuery,
    (snapshot) => {
      onData(snapshot.docs.map((item) => asPlayStrokeBatch(item.id, item.data())));
    },
    (error) => {
      onError?.(error);
      onData([]);
    }
  );
}

export async function appendStrokeBatch(
  db: Firestore,
  sessionId: string,
  uid: string,
  strokes: PlayStroke[]
): Promise<string> {
  if (!strokes.length) return "";

  const eventRef = doc(collection(db, "playSessions", sessionId, "events"));
  await setDoc(eventRef, {
    id: eventRef.id,
    uid,
    kind: "stroke_batch" as const,
    createdAt: Date.now(),
    strokes,
  });

  return eventRef.id;
}

export async function finishPlaySession(
  db: Firestore,
  sessionId: string,
  resultStrokeCount: number
): Promise<void> {
  await setDoc(
    doc(db, "playSessions", sessionId),
    {
      endedAt: Date.now(),
      resultStrokeCount,
      status: "finished" satisfies PlaySessionStatus,
    },
    { merge: true }
  );
}

export async function ensureChainDrawTurnState(
  db: Firestore,
  sessionId: string
): Promise<void> {
  const sessionRef = doc(db, "playSessions", sessionId);

  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(sessionRef);
    if (!snapshot.exists()) return;

    const session = asPlaySessionDoc(snapshot.id, snapshot.data());
    if (session.activity !== "chain_draw" || session.status !== "active") return;

    const turn = getChainDrawTurnState(session);
    if (!turn) return;

    const needsRepair =
      !Array.isArray(session.turnOrder) ||
      !session.turnOrder.length ||
      session.currentTurnUid !== turn.currentTurnUid ||
      session.turnIndex == null ||
      session.turnDurationSec == null ||
      session.maxTurns == null ||
      session.turnStartedAt == null;

    if (!needsRepair) return;

    tx.set(sessionRef, buildChainDrawPatch(turn), { merge: true });
  });
}

export async function advanceChainDrawTurn(
  db: Firestore,
  sessionId: string,
  options?: {
    expectedTurnIndex?: number;
    expectedCurrentTurnUid?: string;
    resultStrokeCount?: number;
  }
): Promise<AdvanceChainDrawTurnResult> {
  const sessionRef = doc(db, "playSessions", sessionId);

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(sessionRef);
    if (!snapshot.exists()) {
      return { state: "ignored" };
    }

    const session = asPlaySessionDoc(snapshot.id, snapshot.data());
    if (session.activity !== "chain_draw" || session.status !== "active") {
      return { state: "ignored" };
    }

    const turn = getChainDrawTurnState(session);
    if (!turn) {
      return { state: "ignored" };
    }

    if (
      (options?.expectedTurnIndex != null && turn.turnIndex !== options.expectedTurnIndex) ||
      (options?.expectedCurrentTurnUid &&
        turn.currentTurnUid !== options.expectedCurrentTurnUid)
    ) {
      return {
        state: "stale",
        turnIndex: turn.turnIndex,
        currentTurnUid: turn.currentTurnUid,
      };
    }

    const now = Date.now();
    const nextTurnIndex = turn.turnIndex + 1;

    if (nextTurnIndex >= turn.maxTurns) {
      tx.set(
        sessionRef,
        {
          ...buildChainDrawPatch(turn),
          endedAt: now,
          resultStrokeCount:
            options?.resultStrokeCount ?? session.resultStrokeCount ?? 0,
          status: "finished" satisfies PlaySessionStatus,
        },
        { merge: true }
      );

      return {
        state: "finished",
        turnIndex: turn.turnIndex,
        currentTurnUid: turn.currentTurnUid,
      };
    }

    const nextTurnUid =
      turn.turnOrder[nextTurnIndex % turn.turnOrder.length] ?? turn.currentTurnUid;

    tx.set(
      sessionRef,
      buildChainDrawPatch({
        ...turn,
        currentTurnUid: nextTurnUid,
        turnIndex: nextTurnIndex,
        turnStartedAt: now,
      }),
      { merge: true }
    );

    return {
      state: "advanced",
      turnIndex: nextTurnIndex,
      currentTurnUid: nextTurnUid,
    };
  });
}

export async function submitRevealDecision(
  db: Firestore,
  sessionId: string,
  uid: string,
  decision: PlayRevealDecision
): Promise<void> {
  const sessionRef = doc(db, "playSessions", sessionId);

  await runTransaction(db, async (tx) => {
    const snapshot = await tx.get(sessionRef);
    if (!snapshot.exists()) return;

    const session = asPlaySessionDoc(snapshot.id, snapshot.data());
    const revealDecisions: Record<string, PlayRevealDecision> = {
      ...(session.revealDecisions ?? {}),
      [uid]: decision,
    };
    const allSubmitted =
      session.participantIds.length > 0 &&
      session.participantIds.every((participantId) => revealDecisions[participantId]);

    tx.set(
      sessionRef,
      {
        revealDecisions,
        status: allSubmitted
          ? ("revealed" satisfies PlaySessionStatus)
          : session.status,
      },
      { merge: true }
    );
  });
}

export function getPeerFromSession(session: PlaySessionDoc, myUid: string) {
  const peerUid = session.participantIds.find((participantId) => participantId !== myUid);
  if (!peerUid) return null;

  return {
    uid: peerUid,
    nickname: session.participantNicknames[peerUid] ?? makeNickname(peerUid),
  };
}
