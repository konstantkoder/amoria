import AsyncStorage from "@react-native-async-storage/async-storage";
import { deleteDoc, doc, setDoc } from "firebase/firestore";

import { auth, db } from "@/config/firebaseConfig";
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

export type DemoSeedResult = {
  prepared: string[];
  cleared: string[];
  warnings: string[];
};

type DemoThreadSeed = {
  threadId: string;
  memberIds: string[];
  memberNames: Record<string, string>;
  source: "play" | "announcement";
  sourceSessionId?: string;
  artworkSummary?: {
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
};

type DemoIds = {
  announcementPeerUid: string;
  storyPeerUid: string;
  announcementIds: string[];
  announcementThreadId: string;
  storyThreadId: string;
  sessionId: string;
  threadMessageIds: string[];
  announcementMessageIds: string[];
  eventIds: string[];
};

const DEMO_ANNOUNCEMENT_PREFIX = "dev_demo_single_device_announcement_";
const DEMO_RESPONSE_PREFIX = `${DEMO_ANNOUNCEMENT_PREFIX}`;
const DEMO_SESSION_PREFIX = "dev_demo_single_device_session_";

function buildDemoIds(uid: string): DemoIds {
  const stableUid = String(uid ?? "").trim();
  const announcementPeerUid = `dev_demo_peer_announcement_${stableUid}`;
  const storyPeerUid = `dev_demo_peer_story_${stableUid}`;

  return {
    announcementPeerUid,
    storyPeerUid,
    announcementIds: [
      `${DEMO_ANNOUNCEMENT_PREFIX}respond_${stableUid}`,
      `${DEMO_ANNOUNCEMENT_PREFIX}fallback_${stableUid}`,
      `${DEMO_ANNOUNCEMENT_PREFIX}own_${stableUid}`,
    ],
    announcementThreadId: buildDmThreadId(stableUid, announcementPeerUid),
    storyThreadId: buildDmThreadId(stableUid, storyPeerUid),
    sessionId: `${DEMO_SESSION_PREFIX}shared_story_${stableUid}`,
    threadMessageIds: [
      "dev_demo_story_msg_1",
      "dev_demo_story_msg_2",
      "dev_demo_story_msg_3",
    ],
    announcementMessageIds: [
      "dev_demo_announcement_msg_1",
      "dev_demo_announcement_msg_2",
    ],
    eventIds: ["dev_demo_story_event_1", "dev_demo_story_event_2"],
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

function buildDemoAnnouncements(params: {
  uid: string;
  currentName: string;
  ids: DemoIds;
  now: number;
}): NearbyAnnouncement[] {
  const { currentName, ids, now, uid } = params;

  return [
    {
      id: ids.announcementIds[0],
      title: "Кофе после работы и короткая прогулка",
      description:
        "Буду возле центра после 19:00. Можно взять кофе, пройтись 30 минут и без неловких формальностей понять, хочется ли продолжать.",
      category: "coffee",
      placeLabel: "Centrum",
      proximityLabel: "~900 м",
      authorLabel: "Лея",
      authorUid: ids.announcementPeerUid,
      createdAt: now - 6 * 60 * 1000,
      hasPhoto: true,
    },
    {
      id: ids.announcementIds[1],
      title: "Лёгкая прогулка у реки без жёсткого плана",
      description:
        "Demo-card без прямого DM. Нужна именно для проверки fallback flow: можно сохранить интерес локально и вернуться к списку.",
      category: "walk",
      placeLabel: "Bulwary",
      proximityLabel: "сегодня",
      authorLabel: "Demo card",
      createdAt: now - 14 * 60 * 1000,
      hasPhoto: false,
    },
    {
      id: ids.announcementIds[2],
      title: "Мой тестовый анонс для single-device review",
      description:
        "Эта карточка нужна, чтобы быстро проверить own-announcement state и не трогать реальный flow публикации.",
      category: "activity",
      placeLabel: "Nearby",
      proximityLabel: "только dev",
      authorLabel: currentName,
      createdAt: now - 22 * 60 * 1000,
      hasPhoto: false,
      ...(uid ? { authorUid: uid } : {}),
    },
  ];
}

async function upsertDemoAnnouncements(announcements: NearbyAnnouncement[]) {
  const existing = await readStoredAnnouncements();
  const withoutDemo = existing.filter(
    (item) => !String(item?.id ?? "").startsWith(DEMO_ANNOUNCEMENT_PREFIX)
  );
  await writeStoredAnnouncements([...announcements, ...withoutDemo]);
}

async function clearDemoAnnouncements() {
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

function buildStoryStrokes(): Array<{ uid: string; strokes: PlayStroke[] }> {
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

async function writeDemoThread(seed: DemoThreadSeed) {
  if (!db) return false;

  const latestMessage =
    [...seed.messages].sort((left, right) => right.createdAt - left.createdAt)[0] ?? null;
  await setDoc(
    doc(db, "dmThreads", seed.threadId),
    {
      id: seed.threadId,
      memberIds: [...seed.memberIds].sort(),
      memberNames: seed.memberNames,
      source: seed.source,
      ...(seed.sourceSessionId ? { sourceSessionId: seed.sourceSessionId } : {}),
      ...(seed.artworkSummary ? { artworkSummary: seed.artworkSummary } : {}),
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

  return results.every((item) => item.status === "fulfilled");
}

async function writeDemoSession(params: {
  uid: string;
  currentName: string;
  eventIds: string[];
  seed: DemoSessionSeed;
}) {
  if (!db) return false;

  const { currentName, eventIds, seed, uid } = params;
  const prompt =
    getPlayDailyPromptForTimestamp(seed.startedAt) ?? {
      id: "ideal_evening",
      text: "Идеальный вечер",
    };
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
      promptId: prompt.id,
      promptText: prompt.text,
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
          createdAt: seed.startedAt + (index + 1) * 45_000,
          strokes: group.strokes,
        },
        { merge: true }
      )
    )
  );

  return results.every((item) => item.status === "fulfilled");
}

async function clearCurrentUserDemoDocs(uid: string) {
  if (!db || !uid) return;

  const ids = buildDemoIds(uid);
  const deletions = [
    ...ids.announcementMessageIds.map((messageId) =>
      deleteDoc(doc(db, "dmThreads", ids.announcementThreadId, "messages", messageId))
    ),
    ...ids.threadMessageIds.map((messageId) =>
      deleteDoc(doc(db, "dmThreads", ids.storyThreadId, "messages", messageId))
    ),
    ...ids.eventIds.map((eventId) =>
      deleteDoc(doc(db, "playSessions", ids.sessionId, "events", eventId))
    ),
    deleteDoc(doc(db, "dmThreads", ids.announcementThreadId)),
    deleteDoc(doc(db, "dmThreads", ids.storyThreadId)),
    deleteDoc(doc(db, "playSessions", ids.sessionId)),
  ];

  await Promise.allSettled(deletions);
}

export async function clearSingleDeviceDemo(): Promise<DemoSeedResult> {
  const result: DemoSeedResult = {
    prepared: [],
    cleared: [],
    warnings: [],
  };

  if (!__DEV__) {
    result.warnings.push("Demo seed is disabled outside __DEV__.");
    return result;
  }

  await clearDemoAnnouncements();
  result.cleared.push("announcements cleared");

  const uid = auth?.currentUser?.uid ?? "";
  if (!uid || !db) {
    result.warnings.push(
      "DM / shared story demo docs were not cleared because there is no active signed-in Firestore session."
    );
    return result;
  }

  await clearCurrentUserDemoDocs(uid);
  result.cleared.push("demo inbox / DM cleared");
  result.cleared.push("demo shared story cleared");
  return result;
}

export async function prepareSingleDeviceDemo(): Promise<DemoSeedResult> {
  const result: DemoSeedResult = {
    prepared: [],
    cleared: [],
    warnings: [],
  };

  if (!__DEV__) {
    result.warnings.push("Demo seed is disabled outside __DEV__.");
    return result;
  }

  const uid = auth?.currentUser?.uid ?? "";
  const currentName = auth?.currentUser?.displayName?.trim() || "You";
  const now = Date.now();
  const ids = buildDemoIds(uid || "guest");

  await clearDemoAnnouncements();
  await upsertDemoAnnouncements(
    buildDemoAnnouncements({
      uid,
      currentName,
      ids,
      now,
    })
  );
  result.prepared.push("announcements ready");

  if (!uid || !db) {
    result.warnings.push(
      "Inbox / DM / shared story were skipped because Firestore or an authenticated user is not available in this dev build."
    );
    result.warnings.push(
      "Nearby Now was not seeded because it depends on live location region and should stay tied to real geolocation."
    );
    return result;
  }

  await clearCurrentUserDemoDocs(uid);

  const storySessionSeed: DemoSessionSeed = {
    sessionId: ids.sessionId,
    peerUid: ids.storyPeerUid,
    peerName: "Ник",
    activity: "daily_prompt",
    createdAt: now - 95 * 60 * 1000,
    startedAt: now - 92 * 60 * 1000,
    endedAt: now - 85 * 60 * 1000,
    strokeCount: 4,
  };

  const announcementThreadOk = await writeDemoThread({
    threadId: ids.announcementThreadId,
    memberIds: [uid, ids.announcementPeerUid],
    memberNames: {
      [uid]: currentName,
      [ids.announcementPeerUid]: "Лея",
    },
    source: "announcement",
    createdAt: now - 34 * 60 * 1000,
    messages: [
      {
        id: ids.announcementMessageIds[0],
        from: ids.announcementPeerUid,
        to: uid,
        text: "Привет. Я как раз буду рядом после 19:00, так что можно спокойно продолжить здесь.",
        createdAt: now - 31 * 60 * 1000,
      },
      {
        id: ids.announcementMessageIds[1],
        from: uid,
        to: ids.announcementPeerUid,
        text: "Супер. Я открою чат позже вечером, чтобы не потеряться.",
        createdAt: now - 28 * 60 * 1000,
      },
    ],
  });

  const storyThreadOk = await writeDemoThread({
    threadId: ids.storyThreadId,
    memberIds: [uid, ids.storyPeerUid],
    memberNames: {
      [uid]: currentName,
      [ids.storyPeerUid]: storySessionSeed.peerName,
    },
    source: "play",
    sourceSessionId: storySessionSeed.sessionId,
    artworkSummary: {
      activity: storySessionSeed.activity,
      strokeCount: storySessionSeed.strokeCount,
    },
    createdAt: storySessionSeed.endedAt,
    messages: [
      {
        id: ids.threadMessageIds[0],
        from: ids.storyPeerUid,
        to: uid,
        text: "Неожиданно понравилось, как у нас собрался общий рисунок.",
        createdAt: now - 18 * 60 * 1000,
      },
      {
        id: ids.threadMessageIds[1],
        from: uid,
        to: ids.storyPeerUid,
        text: "Да, и тема получилась живой. Оставлю эту историю в деталях, чтобы потом пересмотреть replay.",
        createdAt: now - 14 * 60 * 1000,
      },
      {
        id: ids.threadMessageIds[2],
        from: ids.storyPeerUid,
        to: uid,
        text: "Тогда потом вернусь сюда же. Удобно, что чат уже привязан к общей истории.",
        createdAt: now - 9 * 60 * 1000,
      },
    ],
  });

  const sessionOk = await writeDemoSession({
    uid,
    currentName,
    eventIds: ids.eventIds,
    seed: storySessionSeed,
  });

  result.prepared.push("announcement respond -> DM ready");
  result.prepared.push("demo inbox threads ready");

  if (sessionOk) {
    result.prepared.push("shared story / history ready");
    result.prepared.push("connections card ready");
    result.prepared.push("session detail example ready");
  } else {
    result.warnings.push(
      "The shared story seed was only partially written. Inbox / DM should still be available."
    );
  }

  if (!announcementThreadOk || !storyThreadOk) {
    result.warnings.push(
      "One or more demo messages could not be written completely. The threads themselves should still exist."
    );
  }

  result.warnings.push(
    "Nearby Now was not seeded because it depends on live location region and should stay tied to real geolocation."
  );

  return result;
}
