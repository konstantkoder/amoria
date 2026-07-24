import type { SharedCanvasStroke } from "@/components/play/SharedCanvasWebView";
import type { SharedCanvasTool } from "@/components/play/SharedCanvasWebView";
import type {
  TogetherEventDto as ApiTogetherEventDto,
  TogetherParticipantDto,
  TogetherSessionDto,
  TogetherSessionResponse,
} from "@/services/api/types";

export type TogetherStrokePoint = {
  x: number;
  y: number;
  t?: number;
  p?: number;
};

export type TogetherStroke = {
  id: string;
  tool?: SharedCanvasTool;
  color: string;
  width: number;
  points: TogetherStrokePoint[];
};

export type TogetherStrokeBatchPayload = {
  id?: string;
  uid?: string;
  strokes?: TogetherStroke[];
};

export type TogetherEventDto = Partial<ApiTogetherEventDto>;

export type CachedTogetherSession = {
  session: TogetherSessionDto;
  participants: TogetherParticipantDto[];
  identityRevealed: boolean;
  stateVersion: number;
  revealState?: TogetherSessionResponse["revealState"];
};

const sessions = new Map<string, CachedTogetherSession>();
const strokesBySessionId = new Map<string, SharedCanvasStroke[]>();
const eventIdsBySessionId = new Map<string, Set<string>>();

export function rememberTogetherSession(response: TogetherSessionResponse): void {
  sessions.set(response.session.id, response);
}

export function getRememberedTogetherSession(
  sessionId: string
): CachedTogetherSession | null {
  return sessions.get(sessionId) ?? null;
}

export function getTogetherStrokes(sessionId: string): SharedCanvasStroke[] {
  return strokesBySessionId.get(sessionId) ?? [];
}

export function rememberTogetherEvent(sessionId: string, event: TogetherEventDto): SharedCanvasStroke[] {
  if (event.type !== "stroke_batch") {
    return getTogetherStrokes(sessionId);
  }

  const eventKey = getTogetherEventKey(event);
  if (eventKey) {
    let seen = eventIdsBySessionId.get(sessionId);
    if (!seen) {
      seen = new Set();
      eventIdsBySessionId.set(sessionId, seen);
    }
    if (seen.has(eventKey)) {
      return getTogetherStrokes(sessionId);
    }
    seen.add(eventKey);
  }

  const nextStrokes = strokesFromTogetherEvent(event);
  if (!nextStrokes.length) {
    return getTogetherStrokes(sessionId);
  }

  const merged = [...getTogetherStrokes(sessionId), ...nextStrokes];
  strokesBySessionId.set(sessionId, merged);
  return merged;
}

export function buildTogetherStrokesFromEvents(
  events: TogetherEventDto[]
): SharedCanvasStroke[] {
  const seenEvents = new Set<string>();
  const strokes: SharedCanvasStroke[] = [];

  for (const event of events) {
    if (event.type !== "stroke_batch") continue;
    const eventKey = getTogetherEventKey(event);
    if (eventKey) {
      if (seenEvents.has(eventKey)) continue;
      seenEvents.add(eventKey);
    }

    strokes.push(...strokesFromTogetherEvent(event));
  }

  return strokes;
}

export function replaceTogetherStrokesFromEvents(
  sessionId: string,
  events: TogetherEventDto[]
): SharedCanvasStroke[] {
  const strokes = buildTogetherStrokesFromEvents(events);
  const eventIds = new Set(
    events
      .filter((event) => event.type === "stroke_batch")
      .map(getTogetherEventKey)
      .filter((eventKey): eventKey is string => Boolean(eventKey))
  );

  strokesBySessionId.set(sessionId, strokes);
  if (eventIds.size > 0) {
    eventIdsBySessionId.set(sessionId, eventIds);
  } else {
    eventIdsBySessionId.delete(sessionId);
  }

  return strokes;
}

export function rememberLocalTogetherStrokes(
  sessionId: string,
  uid: string,
  clientEventId: string,
  strokes: SharedCanvasStroke[]
): SharedCanvasStroke[] {
  return rememberTogetherEvent(sessionId, {
    id: clientEventId,
    clientEventId,
    sessionId,
    fromUserId: uid,
    type: "stroke_batch",
    payload: {
      uid,
      strokes: strokes.map((stroke) => ({
        id: stroke.id,
        tool: stroke.tool ?? "draw",
        color: stroke.color,
        width: stroke.width,
        points: stroke.points.map((point, index) => ({
          x: clampNormalized(point.x),
          y: clampNormalized(point.y),
          t: index,
        })),
      })),
    },
  });
}

export function getTogetherPeer(
  response: CachedTogetherSession | null,
  userId: string
): TogetherParticipantDto | null {
  return response?.participants.find((participant) => participant.id !== userId) ?? null;
}

export function normalizeStrokeBatchPayload(payload: unknown): {
  uid: string;
  strokes: TogetherStroke[];
} {
  const value =
    payload && typeof payload === "object"
      ? (payload as Partial<TogetherStrokeBatchPayload>)
      : {};
  const rawStrokes = Array.isArray(value.strokes) ? value.strokes : [];

  return {
    uid: String(value.uid ?? "").trim(),
    strokes: rawStrokes
      .map(normalizeStroke)
      .filter((stroke): stroke is TogetherStroke => Boolean(stroke)),
  };
}

function getTogetherEventKey(event: TogetherEventDto): string {
  return String(event.clientEventId || event.id || "").trim();
}

function strokesFromTogetherEvent(event: TogetherEventDto): SharedCanvasStroke[] {
  const payload = normalizeStrokeBatchPayload(event.payload);
  if (!payload.strokes.length) {
    return [];
  }

  const fromUserId = String(event.fromUserId || payload.uid || "").trim();
  return payload.strokes.map((stroke) => ({
    id: stroke.id,
    uid: fromUserId,
    tool: stroke.tool ?? "draw",
    color: stroke.color,
    width: stroke.width,
    points: stroke.points.map((point) => ({
      x: clampNormalized(point.x),
      y: clampNormalized(point.y),
    })),
  }));
}

function normalizeStroke(value: unknown): TogetherStroke | null {
  if (!value || typeof value !== "object") return null;
  const stroke = value as Partial<TogetherStroke>;
  const id = String(stroke.id ?? "").trim();
  const color = String(stroke.color ?? "#F97393").trim() || "#F97393";
  const width = Number(stroke.width ?? 6);
  const tool = normalizeTool(stroke.tool);
  const points = Array.isArray(stroke.points)
    ? stroke.points.map(normalizePoint).filter((point): point is TogetherStrokePoint => Boolean(point))
    : [];

  if (!id || !points.length) return null;
  return {
    id,
    tool,
    color,
    width: Number.isFinite(width) && width > 0 ? width : 6,
    points,
  };
}

function normalizeTool(value: unknown): SharedCanvasTool {
  return value === "erase" ? "erase" : "draw";
}

function normalizePoint(value: unknown): TogetherStrokePoint | null {
  if (!value || typeof value !== "object") return null;
  const point = value as Partial<TogetherStrokePoint>;
  return {
    x: clampNormalized(Number(point.x)),
    y: clampNormalized(Number(point.y)),
    ...(point.t != null && Number.isFinite(Number(point.t)) ? { t: Number(point.t) } : {}),
    ...(point.p != null && Number.isFinite(Number(point.p)) ? { p: Number(point.p) } : {}),
  };
}

function clampNormalized(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
