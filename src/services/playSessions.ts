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

export type PlayActivity = "draw";

export type PlayQueueStatus = "waiting" | "matched" | "cancelled";
export type PlaySessionStatus = "matching" | "active" | "finished" | "revealed";
export type PlayRevealDecision = "open" | "skip";

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
  participantIds: string[];
  participantNicknames: Record<string, string>;
  revealDecisions?: Record<string, PlayRevealDecision>;
  resultStrokeCount?: number;
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
    activity: (data.activity ?? "draw") as PlayActivity,
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
  return {
    id,
    activity: (data.activity ?? "draw") as PlayActivity,
    status: (data.status ?? "matching") as PlaySessionStatus,
    createdAt: Number(data.createdAt ?? 0),
    startedAt: Number(data.startedAt ?? data.createdAt ?? 0),
    ...(data.endedAt != null ? { endedAt: Number(data.endedAt) } : {}),
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
  await setDoc(
    doc(db, "playQueue", uid),
    {
      uid,
      updatedAt: Date.now(),
      status: "cancelled" satisfies PlayQueueStatus,
    },
    { merge: true }
  );
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

    tx.set(sessionRef, {
      id: sessionId,
      activity,
      status: "active" satisfies PlaySessionStatus,
      createdAt: now,
      startedAt: now,
      participantIds,
      participantNicknames,
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
  onData: (data: PlaySessionDoc | null) => void
) {
  return onSnapshot(doc(db, "playSessions", sessionId), (snapshot) => {
    if (!snapshot.exists()) {
      onData(null);
      return;
    }
    onData(asPlaySessionDoc(snapshot.id, snapshot.data()));
  });
}

export function subscribePlayEvents(
  db: Firestore,
  sessionId: string,
  onData: (data: PlayStrokeBatch[]) => void
) {
  const eventsQuery = query(
    collection(db, "playSessions", sessionId, "events"),
    orderBy("createdAt", "asc"),
    limit(200)
  );

  return onSnapshot(eventsQuery, (snapshot) => {
    onData(snapshot.docs.map((item) => asPlayStrokeBatch(item.id, item.data())));
  });
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
