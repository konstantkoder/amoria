import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";

import { auth, db } from "@/config/firebaseConfig";
import { isTogetherQaDemoEnabled } from "@/dev/runtimeFlags";
import { buildDmThreadId } from "@/services/dm";
import {
  NEARBY_ANNOUNCEMENTS_STORAGE_KEY,
  NEARBY_ANNOUNCEMENT_RESPONSES_STORAGE_KEY,
  type NearbyAnnouncement,
} from "@/services/nearbyAnnouncements";
import {
  getPlayDailyPromptForTimestamp,
  type PlayActivity,
  type PlayStroke,
} from "@/services/playSessions";
import { makeNickname } from "@/services/rooms";

export type DemoSeedResult = {
  prepared: string[];
  cleared: string[];
  warnings: string[];
};

export type TogetherCoreLoopDemo = {
  summary: DemoSeedResult;
  sessionId: string | null;
  threadId: string | null;
  peerUid: string | null;
  peerName: string | null;
};

export type TogetherLiveQaSession = {
  sessionId: string | null;
  peerUid: string | null;
  peerName: string | null;
  warnings: string[];
};

type DemoThreadSeed = {
  threadId: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  source: "play";
  sourceSessionId: string;
  artworkSummary: {
    activity: PlayActivity;
    strokeCount?: number;
  };
  createdAt: number;
  messages: Array<{
    id: string;
    from: string;
    to: string;
    text: string;
    createdAt: number;
  }>;
};

type DemoSessionSeed = {
  sessionId: string;
  peerUid: string;
  peerName: string;
  activity: PlayActivity;
  createdAt: number;
  startedAt: number;
  endedAt: number;
  strokeCount: number;
  promptId: string;
  promptText: string;
};

type DemoIds = {
  peerUid: string;
  sessionId: string;
  threadId: string;
  threadMessageIds: string[];
  eventIds: string[];
  legacyAnnouncementThreadId: string;
  legacyAnnouncementMessageIds: string[];
};

type LiveQaIds = {
  peerUid: string;
  sessionId: string;
  threadId: string;
};

const DEMO_ANNOUNCEMENT_PREFIX = "dev_demo_single_device_announcement_";
const DEMO_RESPONSE_PREFIX = DEMO_ANNOUNCEMENT_PREFIX;
const DEMO_SESSION_PREFIX = "dev_demo_single_device_session_";
const DEMO_LIVE_SESSION_PREFIX = "dev_demo_single_device_live_session_";
const DEMO_PEER_NAME = "Ник";

function buildDemoIds(uid: string): DemoIds {
  const stableUid = String(uid ?? "").trim();
  const peerUid = `dev_demo_peer_story_${stableUid}`;
  const legacyAnnouncementPeerUid = `dev_demo_peer_announcement_${stableUid}`;

  return {
    peerUid,
    sessionId: `${DEMO_SESSION_PREFIX}shared_story_${stableUid}`,
    threadId: buildDmThreadId(stableUid, peerUid),
    threadMessageIds: [
      "dev_demo_story_msg_1",
      "dev_demo_story_msg_2",
      "dev_demo_story_msg_3",
    ],
    eventIds: ["dev_demo_story_event_1", "dev_demo_story_event_2"],
    legacyAnnouncementThreadId: buildDmThreadId(stableUid, legacyAnnouncementPeerUid),
    legacyAnnouncementMessageIds: [
      "dev_demo_announcement_msg_1",
      "dev_demo_announcement_msg_2",
    ],
  };
}

function buildLiveQaIds(uid: string): LiveQaIds {
  const stableUid = String(uid ?? "").trim();
  const peerUid = `dev_demo_peer_live_${stableUid}`;

  return {
    peerUid,
    sessionId: `${DEMO_LIVE_SESSION_PREFIX}draw_${stableUid}`,
    threadId: buildDmThreadId(stableUid, peerUid),
  };
}

function sortAnnouncements(items: NearbyAnnouncement[]) {
  return [...items].sort((left, right) => {
    const byCreatedAt = right.createdAt - left.createdAt;
    if (byCreatedAt !== 0) return byCreatedAt;
    return left.id.localeCompare(right.id);
  });
}

async function readStoredAnnouncements(): Promise<NearbyAnnouncement[]> {
  try {
    const raw = await AsyncStorage.getItem(NEARBY_ANNOUNCEMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as NearbyAnnouncement[]) : [];
  } catch {
    return [];
  }
}

async function writeStoredAnnouncements(items: NearbyAnnouncement[]) {
  await AsyncStorage.setItem(
    NEARBY_ANNOUNCEMENTS_STORAGE_KEY,
    JSON.stringify(sortAnnouncements(items))
  );
}

async function readResponseMap(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(NEARBY_ANNOUNCEMENT_RESPONSES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, number>)
      : {};
  } catch {
    return {};
  }
}

async function writeResponseMap(map: Record<string, number>) {
  await AsyncStorage.setItem(
    NEARBY_ANNOUNCEMENT_RESPONSES_STORAGE_KEY,
    JSON.stringify(map)
  );
}

async function clearLegacyDemoAnnouncements() {
  const existing = await readStoredAnnouncements();
  const filtered = existing.filter(
    (item) => !String(item?.id ?? "").startsWith(DEMO_ANNOUNCEMENT_PREFIX)
  );
  await writeStoredAnnouncements(filtered);

  const responseMap = await readResponseMap();
  const nextResponseMap = Object.fromEntries(
    Object.entries(responseMap).filter(
      ([key]) => !String(key ?? "").includes(DEMO_RESPONSE_PREFIX)
    )
  ) as Record<string, number>;
  await writeResponseMap(nextResponseMap);
}

function buildStoryStrokes(): Array<{ uid: "local" | "peer"; strokes: PlayStroke[] }> {
  return [
    {
      uid: "local",
      strokes: [
        {
          id: "dev_demo_story_stroke_1",
          color: "#F97393",
          width: 7,
          points: [
            { x: 42, y: 92, t: 1 },
            { x: 78, y: 66, t: 2 },
            { x: 118, y: 72, t: 3 },
            { x: 164, y: 118, t: 4 },
          ],
        },
        {
          id: "dev_demo_story_stroke_2",
          color: "#FFD166",
          width: 5,
          points: [
            { x: 80, y: 150, t: 5 },
            { x: 116, y: 136, t: 6 },
            { x: 154, y: 145, t: 7 },
          ],
        },
      ],
    },
    {
      uid: "peer",
      strokes: [
        {
          id: "dev_demo_story_stroke_3",
          color: "#60A5FA",
          width: 6,
          points: [
            { x: 174, y: 82, t: 8 },
            { x: 212, y: 108, t: 9 },
            { x: 248, y: 98, t: 10 },
            { x: 282, y: 124, t: 11 },
          ],
        },
        {
          id: "dev_demo_story_stroke_4",
          color: "#34D399",
          width: 4,
          points: [
            { x: 146, y: 182, t: 12 },
            { x: 184, y: 194, t: 13 },
            { x: 224, y: 176, t: 14 },
          ],
        },
      ],
    },
  ];
}

function buildDemoSessionSeed(uid: string, currentName: string, now: number, ids: DemoIds) {
  const prompt =
    getPlayDailyPromptForTimestamp(now) ?? {
      id: "ideal_evening",
      text: "Идеальный вечер",
    };

  const seed: DemoSessionSeed = {
    sessionId: ids.sessionId,
    peerUid: ids.peerUid,
    peerName: DEMO_PEER_NAME,
    activity: "daily_prompt",
    createdAt: now - 34 * 60 * 1000,
    startedAt: now - 29 * 60 * 1000,
    endedAt: now - 22 * 60 * 1000,
    strokeCount: 4,
    promptId: prompt.id,
    promptText: prompt.text,
  };

  const threadSeed: DemoThreadSeed = {
    threadId: ids.threadId,
    memberIds: [uid, ids.peerUid],
    memberNames: {
      [uid]: currentName,
      [ids.peerUid]: seed.peerName,
    },
    source: "play",
    sourceSessionId: seed.sessionId,
    artworkSummary: {
      activity: seed.activity,
      strokeCount: seed.strokeCount,
    },
    createdAt: seed.endedAt,
    messages: [
      {
        id: ids.threadMessageIds[0],
        from: ids.peerUid,
        to: uid,
        text: `Удивительно, как тема «${seed.promptText}» у нас сразу стала общей.`,
        createdAt: now - 14 * 60 * 1000,
      },
      {
        id: ids.threadMessageIds[1],
        from: uid,
        to: ids.peerUid,
        text: "Да. И хорошо, что этот момент остался и в истории, и здесь в разговоре.",
        createdAt: now - 10 * 60 * 1000,
      },
      {
        id: ids.threadMessageIds[2],
        from: ids.peerUid,
        to: uid,
        text: "Тогда вернёмся к replay позже, а продолжим уже отсюда.",
        createdAt: now - 6 * 60 * 1000,
      },
    ],
  };

  return { seed, threadSeed };
}

async function writeDemoThread(seed: DemoThreadSeed) {
  if (!db) return { messagesReady: false };

  const latestMessage =
    [...seed.messages].sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
  await setDoc(
    doc(db, "dmThreads", seed.threadId),
    {
      id: seed.threadId,
      memberIds: [...seed.memberIds].sort(),
      memberNames: seed.memberNames,
      source: seed.source,
      sourceSessionId: seed.sourceSessionId,
      artworkSummary: seed.artworkSummary,
      createdAt: seed.createdAt,
      updatedAt: latestMessage?.createdAt ?? seed.createdAt,
      ...(latestMessage
        ? {
            lastMessageText: latestMessage.text,
            lastMessageAt: latestMessage.createdAt,
          }
        : {}),
    },
    { merge: true }
  );

  const results = await Promise.allSettled(
    seed.messages.map((message) =>
      setDoc(
        doc(db, "dmThreads", seed.threadId, "messages", message.id),
        {
          clientId: message.id,
          from: message.from,
          to: message.to,
          text: message.text,
          createdAt: message.createdAt,
        },
        { merge: true }
      )
    )
  );

  return {
    messagesReady: results.every((item) => item.status === "fulfilled"),
  };
}

async function writeDemoSession(params: {
  uid: string;
  currentName: string;
  eventIds: string[];
  seed: DemoSessionSeed;
}) {
  if (!db) return { replayReady: false };

  const { currentName, eventIds, seed, uid } = params;
  const strokeGroups = buildStoryStrokes();

  await setDoc(
    doc(db, "playSessions", seed.sessionId),
    {
      id: seed.sessionId,
      activity: seed.activity,
      status: "revealed",
      createdAt: seed.createdAt,
      startedAt: seed.startedAt,
      endedAt: seed.endedAt,
      promptId: seed.promptId,
      promptText: seed.promptText,
      participantIds: [uid, seed.peerUid],
      participantNicknames: {
        [uid]: currentName,
        [seed.peerUid]: seed.peerName,
      },
      revealDecisions: {
        [uid]: "open",
        [seed.peerUid]: "open",
      },
      resultStrokeCount: seed.strokeCount,
    },
    { merge: true }
  );

  const results = await Promise.allSettled(
    strokeGroups.map((group, index) =>
      setDoc(
        doc(db, "playSessions", seed.sessionId, "events", eventIds[index]),
        {
          id: eventIds[index],
          uid: group.uid === "local" ? uid : seed.peerUid,
          kind: "stroke_batch",
          createdAt: seed.startedAt + (index + 1) * 90_000,
          strokes: group.strokes,
        },
        { merge: true }
      )
    )
  );

  return {
    replayReady: results.every((item) => item.status === "fulfilled"),
  };
}

async function clearCurrentUserDemoDocs(uid: string) {
  if (!db || !uid) return;

  const ids = buildDemoIds(uid);
  const deletions = [
    ...ids.legacyAnnouncementMessageIds.map((messageId) =>
      deleteDoc(
        doc(db, "dmThreads", ids.legacyAnnouncementThreadId, "messages", messageId)
      )
    ),
    ...ids.threadMessageIds.map((messageId) =>
      deleteDoc(doc(db, "dmThreads", ids.threadId, "messages", messageId))
    ),
    ...ids.eventIds.map((eventId) =>
      deleteDoc(doc(db, "playSessions", ids.sessionId, "events", eventId))
    ),
    deleteDoc(doc(db, "dmThreads", ids.legacyAnnouncementThreadId)),
    deleteDoc(doc(db, "dmThreads", ids.threadId)),
    deleteDoc(doc(db, "playSessions", ids.sessionId)),
  ];

  await Promise.allSettled(deletions);
}

async function clearTogetherLiveQaDocs(uid: string) {
  if (!db || !uid) return;

  const ids = buildLiveQaIds(uid);
  const [eventSnapshot, messageSnapshot] = await Promise.all([
    getDocs(collection(db, "playSessions", ids.sessionId, "events")),
    getDocs(collection(db, "dmThreads", ids.threadId, "messages")),
  ]);

  const deletions = [
    ...eventSnapshot.docs.map((item) => deleteDoc(item.ref)),
    ...messageSnapshot.docs.map((item) => deleteDoc(item.ref)),
    deleteDoc(doc(db, "dmThreads", ids.threadId)),
    deleteDoc(doc(db, "playSessions", ids.sessionId)),
  ];

  const results = await Promise.allSettled(deletions);
  if (results.some((item) => item.status === "rejected")) {
    throw new Error("Failed to clear live Together QA leftovers.");
  }
}

async function prepareTogetherCoreLoopSeed(): Promise<DemoSeedResult> {
  const result: DemoSeedResult = {
    prepared: [],
    cleared: [],
    warnings: [],
  };

  if (!isTogetherQaDemoEnabled()) {
    result.warnings.push(
      "Together QA demo is disabled outside development and internal QA builds."
    );
    return result;
  }

  await clearLegacyDemoAnnouncements();
  result.cleared.push("legacy Nearby demo leftovers cleared");

  const uid = auth?.currentUser?.uid ?? "";
  if (!uid) {
    result.warnings.push(
      "Sign in on this device before opening the Together QA demo."
    );
    return result;
  }

  if (!db) {
    result.warnings.push(
      "Firebase is not available in this build, so the Together QA demo cannot prepare Result, History, Connections, Inbox, or DM."
    );
    return result;
  }

  const currentName =
    auth?.currentUser?.displayName?.trim() || makeNickname(uid) || "You";
  const now = Date.now();
  const ids = buildDemoIds(uid);

  await clearCurrentUserDemoDocs(uid);
  result.cleared.push("previous Together QA demo cleared");

  const { seed, threadSeed } = buildDemoSessionSeed(uid, currentName, now, ids);
  const sessionWrite = await writeDemoSession({
    uid,
    currentName,
    eventIds: ids.eventIds,
    seed,
  });
  const threadWrite = await writeDemoThread(threadSeed);

  result.prepared.push(`demo result ready with ${seed.peerName}`);
  result.prepared.push("shared story visible in History");
  result.prepared.push("connection card visible in Connections");
  result.prepared.push("inbox thread and DM continuation visible in Inbox");

  if (!sessionWrite.replayReady) {
    result.warnings.push(
      "The shared replay was only partially written. Result, History, Connections, Inbox, and DM should still be available."
    );
  }

  if (!threadWrite.messagesReady) {
    result.warnings.push(
      "The DM thread was created, but one or more seeded messages did not finish writing."
    );
  }

  return result;
}

export async function prepareTogetherCoreLoopDemo(): Promise<TogetherCoreLoopDemo> {
  const summary = await prepareTogetherCoreLoopSeed();
  const uid = auth?.currentUser?.uid ?? "";

  if (!isTogetherQaDemoEnabled() || !uid || !db) {
    return {
      summary,
      sessionId: null,
      threadId: null,
      peerUid: null,
      peerName: null,
    };
  }

  const ids = buildDemoIds(uid);

  return {
    summary,
    sessionId: ids.sessionId,
    threadId: ids.threadId,
    peerUid: ids.peerUid,
    peerName: DEMO_PEER_NAME,
  };
}

export async function prepareTogetherLiveQaSession(): Promise<TogetherLiveQaSession> {
  const warnings: string[] = [];

  if (!isTogetherQaDemoEnabled()) {
    warnings.push(
      "Together live QA is disabled outside development and internal QA builds."
    );
    return {
      sessionId: null,
      peerUid: null,
      peerName: null,
      warnings,
    };
  }

  const uid = auth?.currentUser?.uid ?? "";
  if (!uid) {
    warnings.push(
      "Sign in on this device before opening the live Together QA session."
    );
    return {
      sessionId: null,
      peerUid: null,
      peerName: null,
      warnings,
    };
  }

  if (!db) {
    warnings.push(
      "Firebase is not available in this build, so the live Together QA session cannot be created."
    );
    return {
      sessionId: null,
      peerUid: null,
      peerName: null,
      warnings,
    };
  }

  const ids = buildLiveQaIds(uid);
  const currentName =
    auth?.currentUser?.displayName?.trim() || makeNickname(uid) || "You";
  const now = Date.now();

  try {
    await clearTogetherLiveQaDocs(uid);
    await setDoc(doc(db, "playSessions", ids.sessionId), {
      id: ids.sessionId,
      activity: "draw",
      status: "active",
      createdAt: now,
      startedAt: now,
      participantIds: [uid, ids.peerUid],
      participantNicknames: {
        [uid]: currentName,
        [ids.peerUid]: DEMO_PEER_NAME,
      },
      qaSolo: true,
      qaPeerUid: ids.peerUid,
    });
  } catch {
    warnings.push(
      "We couldn't prepare a fresh live Together QA session on this device."
    );
    return {
      sessionId: null,
      peerUid: null,
      peerName: null,
      warnings,
    };
  }

  return {
    sessionId: ids.sessionId,
    peerUid: ids.peerUid,
    peerName: DEMO_PEER_NAME,
    warnings,
  };
}
