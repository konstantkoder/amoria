import {
  type Firestore,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";
import { makeNickname } from "@/services/rooms";
import type { PlayActivity } from "@/services/playSessions";

function normalizeArtworkActivity(value: unknown): PlayActivity {
  switch (value) {
    case "chain_draw":
      return "chain_draw";
    case "daily_prompt":
      return "daily_prompt";
    case "color_mood":
      return "color_mood";
    default:
      return "draw";
  }
}

export type DmSource = "play" | "announcement";

export type DmThreadDoc = {
  id: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  source?: DmSource;
  sourceSessionId?: string;
  createdAt: number;
  updatedAt: number;
  lastMessageText?: string;
  lastMessageAt?: number;
  artworkSummary?: {
    activity: PlayActivity;
    strokeCount?: number;
  };
};

export type DmMessageDoc = {
  id: string;
  clientId: string;
  from: string;
  to: string;
  text: string;
  createdAt: number;
  pending?: boolean;
};

export type DmChatRouteParams = {
  threadId: string;
  peerId: string;
  peerName?: string;
  backTarget?: "history" | "connections" | "inbox" | "sessionDetail";
  backSessionId?: string;
};

function asDmThreadDoc(id: string, raw: unknown): DmThreadDoc {
  const data = (raw ?? {}) as Partial<DmThreadDoc>;
  return {
    id,
    memberIds: Array.isArray(data.memberIds)
      ? data.memberIds.map((value) => String(value))
      : [],
    memberNames:
      data.memberNames && typeof data.memberNames === "object"
        ? Object.fromEntries(
            Object.entries(data.memberNames).map(([key, value]) => [
              key,
              String(value ?? ""),
            ])
          )
        : {},
    ...(data.source === "play" || data.source === "announcement"
      ? { source: data.source }
      : {}),
    ...(data.sourceSessionId ? { sourceSessionId: String(data.sourceSessionId) } : {}),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? data.createdAt ?? 0),
    ...(data.lastMessageText ? { lastMessageText: String(data.lastMessageText) } : {}),
    ...(data.lastMessageAt != null ? { lastMessageAt: Number(data.lastMessageAt) } : {}),
    ...(data.artworkSummary &&
    typeof data.artworkSummary === "object" &&
    data.artworkSummary.activity
      ? {
          artworkSummary: {
            activity: normalizeArtworkActivity(data.artworkSummary.activity),
            ...(data.artworkSummary.strokeCount != null
              ? { strokeCount: Number(data.artworkSummary.strokeCount) }
              : {}),
          },
        }
      : {}),
  };
}

function asDmMessageDoc(id: string, raw: unknown, pending: boolean): DmMessageDoc {
  const data = (raw ?? {}) as Partial<DmMessageDoc>;
  return {
    id,
    clientId: String(data.clientId ?? id),
    from: String(data.from ?? ""),
    to: String(data.to ?? ""),
    text: String(data.text ?? ""),
    createdAt: Number(data.createdAt ?? 0),
    pending,
  };
}

export function buildDmThreadId(uidA: string, uidB: string): string {
  return [String(uidA ?? ""), String(uidB ?? "")].sort().join("__");
}

export function buildDmChatRouteParams(params: DmChatRouteParams): DmChatRouteParams {
  return {
    threadId: String(params.threadId ?? ""),
    peerId: String(params.peerId ?? ""),
    ...(params.peerName?.trim() ? { peerName: params.peerName.trim() } : {}),
    ...(params.backTarget ? { backTarget: params.backTarget } : {}),
    ...(params.backTarget === "sessionDetail" && params.backSessionId
      ? { backSessionId: String(params.backSessionId) }
      : {}),
  };
}

export function findDmThreadBySourceSessionId(
  threads: DmThreadDoc[],
  sessionId: string
): DmThreadDoc | null {
  if (!sessionId) return null;
  return threads.find((thread) => thread.sourceSessionId === sessionId) ?? null;
}

export async function ensureDmThread(
  db: Firestore,
  uidA: string,
  uidB: string,
  meta: {
    memberNames?: Record<string, string>;
    source: DmSource;
    sourceSessionId?: string;
    artworkSummary?: {
      activity: PlayActivity;
      strokeCount?: number;
    };
  }
): Promise<string> {
  const threadId = buildDmThreadId(uidA, uidB);
  const threadRef = doc(db, "dmThreads", threadId);

  await runTransaction(db, async (tx) => {
    const now = Date.now();
    const snapshot = await tx.get(threadRef);
    const existing = snapshot.exists() ? asDmThreadDoc(snapshot.id, snapshot.data()) : null;
    const memberIds = [uidA, uidB].sort();
    const nextMemberNames: Record<string, string> = {
      ...(existing?.memberNames ?? {}),
      [uidA]:
        meta.memberNames?.[uidA]?.trim() ||
        existing?.memberNames?.[uidA]?.trim() ||
        makeNickname(uidA),
      [uidB]:
        meta.memberNames?.[uidB]?.trim() ||
        existing?.memberNames?.[uidB]?.trim() ||
        makeNickname(uidB),
    };

    tx.set(
      threadRef,
      {
        id: threadId,
        memberIds,
        memberNames: nextMemberNames,
        source: meta.source,
        ...(meta.sourceSessionId ? { sourceSessionId: meta.sourceSessionId } : {}),
        ...(meta.artworkSummary
          ? {
              artworkSummary: {
                activity: meta.artworkSummary.activity,
                ...(meta.artworkSummary.strokeCount != null
                  ? { strokeCount: meta.artworkSummary.strokeCount }
                  : {}),
              },
            }
          : {}),
        createdAt: existing?.createdAt || now,
        updatedAt: existing?.updatedAt || now,
      },
      { merge: true }
    );
  });

  return threadId;
}

export function subscribeDmThreads(
  db: Firestore,
  uid: string,
  onData: (data: DmThreadDoc[]) => void,
  onError?: (error: Error) => void
) {
  const threadsQuery = query(
    collection(db, "dmThreads"),
    where("memberIds", "array-contains", uid)
  );

  return onSnapshot(
    threadsQuery,
    (snapshot) => {
      const byId = new Map<string, DmThreadDoc>();
      for (const item of snapshot.docs) {
        const thread = asDmThreadDoc(item.id, item.data());
        byId.set(thread.id, thread);
      }

      onData(
        Array.from(byId.values()).sort((a, b) => {
          const aTime = a.lastMessageAt ?? a.updatedAt ?? a.createdAt;
          const bTime = b.lastMessageAt ?? b.updatedAt ?? b.createdAt;
          return bTime - aTime;
        })
      );
    },
    (error) => {
      onError?.(error);
      onData([]);
    }
  );
}

export function subscribeDmMessages(
  db: Firestore,
  threadId: string,
  onData: (data: DmMessageDoc[]) => void,
  onError?: (error: Error) => void
) {
  const messagesQuery = query(
    collection(db, "dmThreads", threadId, "messages"),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    messagesQuery,
    (snapshot) => {
      const byClientId = new Map<string, DmMessageDoc>();
      for (const item of snapshot.docs) {
        const message = asDmMessageDoc(item.id, item.data(), item.metadata.hasPendingWrites);
        byClientId.set(message.clientId || message.id, message);
      }

      onData(
        Array.from(byClientId.values()).sort(
          (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)
        )
      );
    },
    (error) => {
      onError?.(error);
      onData([]);
    }
  );
}

export function mapDmThreadToPeer(thread: DmThreadDoc, myUid: string) {
  const peerUid = thread.memberIds.find((memberId) => memberId !== myUid) ?? "";
  if (!peerUid) return null;

  return {
    uid: peerUid,
    name: thread.memberNames[peerUid] ?? makeNickname(peerUid),
  };
}

export async function sendDmMessage(
  db: Firestore,
  threadId: string,
  from: string,
  to: string,
  text: string,
  clientId: string
): Promise<string> {
  const value = String(text ?? "").trim();
  if (!value) return "";

  const stableClientId = String(clientId || "").trim();
  if (!stableClientId) return "";

  const now = Date.now();
  const threadRef = doc(db, "dmThreads", threadId);
  const msgRef = doc(collection(db, "dmThreads", threadId, "messages"), stableClientId);

  await runTransaction(db, async (tx) => {
    const threadSnapshot = await tx.get(threadRef);
    const existing = threadSnapshot.exists()
      ? asDmThreadDoc(threadSnapshot.id, threadSnapshot.data())
      : null;
    const memberIds = [from, to].sort();

    tx.set(
      threadRef,
      {
        id: threadId,
        memberIds,
        memberNames: {
          ...(existing?.memberNames ?? {}),
          [from]: existing?.memberNames?.[from] || makeNickname(from),
          [to]: existing?.memberNames?.[to] || makeNickname(to),
        },
        source: existing?.source ?? "play",
        ...(existing?.sourceSessionId ? { sourceSessionId: existing.sourceSessionId } : {}),
        ...(existing?.artworkSummary ? { artworkSummary: existing.artworkSummary } : {}),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        lastMessageText: value,
        lastMessageAt: now,
      },
      { merge: true }
    );

    tx.set(
      msgRef,
      {
        clientId: stableClientId,
        from,
        to,
        text: value,
        createdAt: now,
        createdAtServer: serverTimestamp(),
      },
      { merge: true }
    );
  });

  return msgRef.id;
}
