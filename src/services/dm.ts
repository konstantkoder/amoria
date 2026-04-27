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
import type { PlayActivity } from "@/services/playSessions";

const DM_FALLBACK_NAME = "profile.amoriaUser";
const LEGACY_NICKNAME_RE = /^nick\.[a-z]+(\.[a-z]+)?\.\d{3}$/;

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

export type DmSource = "play" | "announcement" | "nearby";
export type DmArtworkSummary = {
  activity: PlayActivity;
  strokeCount?: number;
};
export type DmSourceContext = {
  source: DmSource;
  sourceSessionId?: string;
  artworkSummary?: DmArtworkSummary;
};

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
  artworkSummary?: DmArtworkSummary;
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

type DmChatBackRouteParams =
  | {
      backTarget?: "history" | "inbox";
      backSessionId?: never;
    }
  | {
      backTarget: "sessionDetail";
      backSessionId: string;
    };

export type DmChatRouteParams = {
  threadId: string;
  peerId: string;
  peerName?: string;
  sourceContext?: DmSourceContext;
} & DmChatBackRouteParams;

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
    ...(data.source === "play" || data.source === "announcement" || data.source === "nearby"
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

function normalizeMemberName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name) return "";
  if (name === "common.user" || name === "common.anonymous" || name === DM_FALLBACK_NAME) {
    return "";
  }
  if (LEGACY_NICKNAME_RE.test(name)) return "";
  return name;
}

function resolveMemberName(preferred: unknown, existing: unknown) {
  return normalizeMemberName(preferred) || normalizeMemberName(existing) || DM_FALLBACK_NAME;
}

export function buildDmThreadId(uidA: string, uidB: string): string {
  return [String(uidA ?? ""), String(uidB ?? "")].sort().join("__");
}

export function buildDmChatRouteParams(params: DmChatRouteParams): DmChatRouteParams {
  const baseParams = {
    threadId: String(params.threadId ?? ""),
    peerId: String(params.peerId ?? ""),
    ...(params.peerName?.trim() ? { peerName: params.peerName.trim() } : {}),
    ...(params.sourceContext?.source === "play" ||
    params.sourceContext?.source === "announcement" ||
    params.sourceContext?.source === "nearby"
      ? {
          sourceContext: {
            source: params.sourceContext.source,
            ...(params.sourceContext.sourceSessionId
              ? { sourceSessionId: String(params.sourceContext.sourceSessionId) }
              : {}),
            ...(params.sourceContext.artworkSummary?.activity
              ? {
                  artworkSummary: {
                    activity: normalizeArtworkActivity(params.sourceContext.artworkSummary.activity),
                    ...(params.sourceContext.artworkSummary.strokeCount != null
                      ? {
                          strokeCount: Number(
                            params.sourceContext.artworkSummary.strokeCount
                          ),
                        }
                      : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
  };

  if (params.backTarget === "sessionDetail") {
    return {
      ...baseParams,
      backTarget: "sessionDetail",
      backSessionId: String(params.backSessionId),
    };
  }

  return params.backTarget
    ? {
        ...baseParams,
        backTarget: params.backTarget,
      }
    : baseParams;
}

export async function ensureDmThread(
  db: Firestore,
  uidA: string,
  uidB: string,
  meta: {
    memberNames?: Record<string, string>;
  } & DmSourceContext
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
      [uidA]: resolveMemberName(meta.memberNames?.[uidA], existing?.memberNames?.[uidA]),
      [uidB]: resolveMemberName(meta.memberNames?.[uidB], existing?.memberNames?.[uidB]),
    };
    const nextSource = existing?.source ?? meta.source;
    const nextSourceSessionId =
      existing?.sourceSessionId?.trim() || meta.sourceSessionId?.trim() || "";
    const nextArtworkSummary =
      existing?.artworkSummary ??
      (meta.artworkSummary
        ? {
            activity: normalizeArtworkActivity(meta.artworkSummary.activity),
            ...(meta.artworkSummary.strokeCount != null
              ? { strokeCount: Number(meta.artworkSummary.strokeCount) }
              : {}),
          }
        : undefined);

    tx.set(
      threadRef,
      {
        id: threadId,
        memberIds,
        memberNames: nextMemberNames,
        source: nextSource,
        ...(nextSourceSessionId ? { sourceSessionId: nextSourceSessionId } : {}),
        ...(nextArtworkSummary ? { artworkSummary: nextArtworkSummary } : {}),
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
    name: normalizeMemberName(thread.memberNames[peerUid]) || DM_FALLBACK_NAME,
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
          [from]: resolveMemberName(existing?.memberNames?.[from], ""),
          [to]: resolveMemberName(existing?.memberNames?.[to], ""),
        },
        ...(existing?.source ? { source: existing.source } : {}),
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
