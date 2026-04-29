import {
  type Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  where,
} from "firebase/firestore";
import { auth } from "@/config/firebaseConfig";
import { getRuntimeLocale, translate } from "@/i18n/translations";
import {
  getPlayDrawChallengeById,
  getPlayDrawChallengeForSeed,
  type PlayDrawChallenge,
} from "@/services/playChallenges";

export type PlayActivity = "draw" | "chain_draw" | "daily_prompt" | "color_mood";
export type ReleasePlayActivity = "draw" | "color_mood";
export type PlayActivityLabelTone = "action" | "history" | "neutral";
export type PlayDailyPrompt = {
  id: string;
  text: string;
};
export type PlaySessionPrompt = PlayDailyPrompt | PlayDrawChallenge;
export type PlayColorMoodPhase = "picking" | "finished";
export type PlayColorMoodOption = {
  id: string;
  label: string;
  hex: string;
};

export const CHAIN_DRAW_TURN_DURATION_SEC = 30;
export const CHAIN_DRAW_MAX_TURNS = 10;
export const COLOR_MOOD_SELECTION_COUNT = 3;
export const PLAY_QUEUE_TTL_MS = 90 * 1000;
const PLAY_QUEUE_CANDIDATE_LIMIT = 20;
const RELEASE_IDENTITY_FALLBACK = "profile.amoriaUser";
const LEGACY_NICKNAME_RE = /^nick\.[a-z]+(\.[a-z]+)?\.\d{3}$/;
const DAILY_PROMPT_DEFS = [
  { id: "dream_city", en: "Dream city", ru: "Город мечты" },
  { id: "symbol_of_joy", en: "Symbol of joy", ru: "Символ радости" },
  { id: "night_light", en: "Night light", ru: "Ночной свет" },
  { id: "return_place", en: "A place you want to return to", ru: "Место, куда хочется вернуться" },
  { id: "perfect_evening", en: "Perfect evening", ru: "Идеальный вечер" },
  { id: "lucky_sign", en: "Lucky sign", ru: "Знак удачи" },
  { id: "summer_memory", en: "Summer memory", ru: "Воспоминание о лете" },
  { id: "quiet_world", en: "Quiet world", ru: "Тихий мир" },
  { id: "imagined_home", en: "A home that never existed", ru: "Дом, которого не было" },
  { id: "bridge_between_two", en: "Bridge between two people", ru: "Мост между двумя людьми" },
  { id: "sky_after_rain", en: "Sky after rain", ru: "Небо после дождя" },
  { id: "color_of_hope", en: "Color of hope", ru: "Цвет надежды" },
] as const;
const COLOR_MOOD_OPTION_DEFS = [
  { id: "soft_pink", en: "Soft pink", ru: "Мягкий розовый", hex: "#FF8FB1" },
  { id: "peach", en: "Peach", ru: "Персиковый", hex: "#FFB48A" },
  { id: "golden", en: "Golden", ru: "Золотистый", hex: "#F4C86A" },
  { id: "lavender", en: "Lavender", ru: "Лавандовый", hex: "#C8A9FF" },
  { id: "deep_violet", en: "Deep violet", ru: "Глубокий фиолетовый", hex: "#7350B8" },
  { id: "night_blue", en: "Night blue", ru: "Ночной синий", hex: "#395DB9" },
  { id: "powder", en: "Powder", ru: "Пудровый", hex: "#F1C9D8" },
  { id: "warm_orange", en: "Warm orange", ru: "Тёплый оранжевый", hex: "#FF9150" },
  { id: "soft_coral", en: "Soft coral", ru: "Нежный коралл", hex: "#FF7D78" },
  { id: "light_lilac", en: "Light lilac", ru: "Светлый сиреневый", hex: "#DAC8FF" },
  { id: "star_indigo", en: "Star indigo", ru: "Звёздный индиго", hex: "#4E61D3" },
  { id: "morning_cream", en: "Morning cream", ru: "Утренний кремовый", hex: "#F8E9CC" },
] as const;
const COLOR_MOOD_OPTIONS_BY_HEX = new Map(
  COLOR_MOOD_OPTION_DEFS.map((option) => [option.hex.toLowerCase(), option])
);

export type PlayQueueStatus = "waiting" | "matched" | "cancelled" | "expired";
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
  expiresAt: number;
  status: PlayQueueStatus;
  nickname?: string;
  displayName?: string;
  leaseVersion?: number;
  sessionId?: string;
  matchedAt?: number;
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
  paletteChoices?: Record<string, string[]>;
  paletteCompletedAt?: number;
  combinedPalette?: string[];
  colorMoodPhase?: PlayColorMoodPhase;
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
  combinedPalette?: string[];
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

export type SubmitColorMoodChoicesResult = {
  state: "waiting" | "finished" | "ignored";
  combinedPalette?: string[];
};

export type PlayLobbyModeCardCopy = {
  title: string;
  description: string;
  details: string;
};

export type PlayMatchModeCopy = {
  eyebrow: string;
  preparingBody: string;
  searchingBody: string;
  delayedBody: string;
  foundBody: string;
  caption: string;
};

export type PlayModeContextSurface = "result" | "detail" | "history";

export type PlayModeContextCardCopy = {
  title: string;
  body: string;
  facts: string[];
  tagLabel?: string;
  tagValue?: string;
  emptyTitle?: string;
  emptyBody?: string;
};

export type PlayCanvasModeCopy = {
  eyebrow: string;
  title: string;
  body: string;
  helperText: string;
};

export type PlayResultModeCopy = {
  heroTitle: string;
  heroBody: string;
};

export type PlayReplayCopy = {
  title: string;
  body: string;
  emptyTitle: string;
  emptyBody: string;
};

type PlayCopyParams = Record<string, string>;

function fillCopy(template: string, params?: PlayCopyParams) {
  if (!params) return template;
  let output = template;
  for (const [name, nextValue] of Object.entries(params)) {
    output = output.replaceAll(`{${name}}`, String(nextValue));
  }
  return output;
}

function playText(key: string, fallback: string, params?: PlayCopyParams) {
  const value = translate(getRuntimeLocale(), key, params);
  if (value !== key) return value;
  return fillCopy(fallback, params);
}

function releaseCopy(en: string, ru: string, params?: PlayCopyParams) {
  return fillCopy(getRuntimeLocale() === "ru" ? ru : en, params);
}

export function isPlayActivity(value: unknown): value is PlayActivity {
  return (
    value === "draw" ||
    value === "chain_draw" ||
    value === "daily_prompt" ||
    value === "color_mood"
  );
}

export function isReleasePlayActivity(value: unknown): value is ReleasePlayActivity {
  return value === "draw" || value === "color_mood";
}

function normalizePlayActivity(value: unknown): PlayActivity {
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

function createNoCurrentUserError() {
  const error = new Error("No authenticated user for play queue");
  (error as Error & { code?: string }).code = "auth/no-current-user";
  return error;
}

function requireCurrentUserForPlayQueue(uid?: string) {
  const currentUid = auth?.currentUser?.uid ?? "";
  if (!currentUid || (uid && currentUid !== uid)) {
    throw createNoCurrentUserError();
  }
}

function normalizeColorMoodChoiceHex(value: unknown) {
  const stableValue = normalizePromptString(value).toLowerCase();
  return COLOR_MOOD_OPTIONS_BY_HEX.get(stableValue)?.hex ?? "";
}

function normalizeColorMoodPalette(value: unknown, maxItems = COLOR_MOOD_SELECTION_COUNT) {
  if (!Array.isArray(value)) return [];

  const normalized = value
    .map((item) => normalizeColorMoodChoiceHex(item))
    .filter(Boolean)
    .filter((item, index, list) => list.indexOf(item) === index);

  return normalized.slice(0, maxItems);
}

function normalizeColorMoodChoices(value: unknown) {
  if (!value || typeof value !== "object") return {};

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([uid, rawChoices]) => [String(uid), normalizeColorMoodPalette(rawChoices)] as const)
      .filter((entry) => entry[1].length > 0)
  );
}

function normalizeColorMoodPhase(value: unknown): PlayColorMoodPhase {
  return value === "finished" ? "finished" : "picking";
}

function getUtcDaySeed(timestamp: number) {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  return Math.floor(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000
  );
}

export function getPlayDailyPromptPool() {
  return DAILY_PROMPT_DEFS.map((item) => ({
    id: item.id,
    text: releaseCopy(item.en, item.ru),
  }));
}

export function getPlayColorMoodOptions() {
  return COLOR_MOOD_OPTION_DEFS.map((item) => ({
    id: item.id,
    label: releaseCopy(item.en, item.ru),
    hex: item.hex,
  }));
}

export function getPlayColorMoodOption(hex: string): PlayColorMoodOption | null {
  const stableHex = normalizeColorMoodChoiceHex(hex);
  if (!stableHex) return null;
  const option = COLOR_MOOD_OPTIONS_BY_HEX.get(stableHex.toLowerCase()) ?? null;
  if (!option) return null;
  return {
    id: option.id,
    label: releaseCopy(option.en, option.ru),
    hex: option.hex,
  };
}

function buildCombinedColorMoodPalette(
  paletteChoices: Record<string, string[]>,
  participantIds: string[]
) {
  const ordered = participantIds.flatMap((participantId) => paletteChoices[participantId] ?? []);
  return ordered.filter((hex, index, list) => list.indexOf(hex) === index);
}

export function getPlayColorMoodCombinedPalette(
  session:
    | Pick<PlaySessionDoc, "activity" | "participantIds" | "paletteChoices" | "combinedPalette">
    | null
    | undefined
) {
  if (!session || session.activity !== "color_mood") return [];
  const combinedPalette = normalizeColorMoodPalette(
    session.combinedPalette,
    COLOR_MOOD_OPTION_DEFS.length
  );
  if (combinedPalette.length) return combinedPalette;
  return buildCombinedColorMoodPalette(
    normalizeColorMoodChoices(session.paletteChoices),
    session.participantIds ?? []
  );
}

export function getPlayColorMoodChoices(
  session:
    | Pick<PlaySessionDoc, "activity" | "paletteChoices">
    | null
    | undefined,
  uid: string
) {
  if (!session || session.activity !== "color_mood") return [];
  return normalizeColorMoodChoices(session.paletteChoices)[uid] ?? [];
}

export function getPlayColorMoodPhase(
  session:
    | Pick<PlaySessionDoc, "activity" | "status" | "colorMoodPhase">
    | null
    | undefined
) {
  if (!session || session.activity !== "color_mood") return "picking" satisfies PlayColorMoodPhase;
  if (session.status === "finished" || session.status === "revealed") {
    return "finished" satisfies PlayColorMoodPhase;
  }
  return normalizeColorMoodPhase(session.colorMoodPhase);
}

export function playActivityUsesReplay(activity: string) {
  return activity !== "color_mood";
}

export function getPlayDailyPromptById(promptId: string): PlayDailyPrompt | null {
  const stablePromptId = normalizePromptString(promptId);
  if (!stablePromptId) return null;
  const prompt = DAILY_PROMPT_DEFS.find((item) => item.id === stablePromptId) ?? null;
  if (!prompt) return null;
  return {
    id: prompt.id,
    text: releaseCopy(prompt.en, prompt.ru),
  };
}

export function getPlayDailyPromptForTimestamp(timestamp: number): PlayDailyPrompt | null {
  const daySeed = getUtcDaySeed(timestamp);
  if (daySeed == null || !DAILY_PROMPT_DEFS.length) return null;

  const index =
    ((daySeed % DAILY_PROMPT_DEFS.length) + DAILY_PROMPT_DEFS.length) %
    DAILY_PROMPT_DEFS.length;
  const prompt = DAILY_PROMPT_DEFS[index] ?? DAILY_PROMPT_DEFS[0] ?? null;
  if (!prompt) return null;
  return {
    id: prompt.id,
    text: releaseCopy(prompt.en, prompt.ru),
  };
}

function resolvePlayPromptFromParts(
  activity: string,
  promptId: unknown,
  promptText: unknown,
  fallbackAt?: number
): PlaySessionPrompt | null {
  if (activity !== "daily_prompt" && activity !== "draw") return null;

  const stablePromptId = normalizePromptString(promptId);
  const stablePromptText = normalizePromptString(promptText);
  const promptById = stablePromptId
    ? activity === "draw"
      ? getPlayDrawChallengeById(stablePromptId)
      : getPlayDailyPromptById(stablePromptId)
    : null;

  if (promptById) {
    return promptById;
  }

  if (stablePromptText) {
    return {
      id: stablePromptId || activity,
      text: stablePromptText,
    };
  }

  if (activity === "daily_prompt" && fallbackAt != null) {
    return getPlayDailyPromptForTimestamp(fallbackAt);
  }

  return null;
}

export function getPlaySessionPrompt(
  session:
    | Pick<PlaySessionDoc, "activity" | "promptId" | "promptText" | "createdAt" | "startedAt">
    | null
    | undefined
): PlaySessionPrompt | null {
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
      if (tone === "action") {
        return releaseCopy("Start shared drawing", "Начать общий рисунок");
      }
      return releaseCopy("Shared drawing", "Общий рисунок");
    case "chain_draw":
    case "daily_prompt":
      return releaseCopy("Shared drawing", "Общий рисунок");
    case "color_mood":
      if (tone === "action") {
        return releaseCopy("Start color mood together", "Начать палитру вместе");
      }
      return releaseCopy("Shared palette", "Общая палитра");
    default:
      return releaseCopy("Shared session", "Совместная сессия");
  }
}

export function getPlayActivityStoryText(activity: string, promptText?: string) {
  switch (activity) {
    case "draw":
      return promptText?.trim()
        ? releaseCopy(
            `You answered one shared creative challenge together: “${promptText.trim()}”.`,
            `Вы вместе ответили на один творческий вызов: «${promptText.trim()}».`
          )
        : releaseCopy(
            "One shared drawing on one canvas.",
            "Один общий рисунок на одном холсте."
          );
    case "chain_draw":
    case "daily_prompt":
      return releaseCopy(
        promptText?.trim()
          ? `One saved shared drawing around “${promptText.trim()}”.`
          : "One saved shared drawing.",
        promptText?.trim()
          ? `Один сохранённый общий рисунок вокруг «${promptText.trim()}».`
          : "Один сохранённый общий рисунок."
      );
    case "color_mood":
      return releaseCopy(
        "A short shared palette and one soft result.",
        "Короткая общая палитра и один мягкий итог."
      );
    default:
      return releaseCopy("Shared story", "Общая история");
  }
}

export function getPlayLobbyModeCardCopy(activity: PlayActivity): PlayLobbyModeCardCopy {
  switch (activity) {
    case "draw":
      return {
        title: releaseCopy("Shared drawing", "Общий рисунок"),
        description: releaseCopy(
          "One short creative challenge, one shared canvas, and the clearest path into connection.",
          "Один короткий творческий вызов, один общий холст и самый прямой путь к связи."
        ),
        details: releaseCopy(
          "This is the main Together path in release: draw the same challenge for seven minutes, then decide honestly about chat.",
          "Это главный путь релиза во «Вместе»: 7 минут вместе рисовать один вызов, а потом честно решить про чат."
        ),
      };
    case "chain_draw":
      return {
        title: releaseCopy("Drawing variation: turns", "Вариация рисунка: по очереди"),
        description: releaseCopy(
          "A stricter shared-drawing variation with short turns on the same canvas.",
          "Более строгая вариация общего рисунка с короткими ходами на одном холсте."
        ),
        details: releaseCopy(
          "It still ends in one shared drawing, one shared result, and the same honest decision about chat.",
          "Это всё равно один общий рисунок, один общий итог и то же честное решение об открытии чата."
        ),
      };
    case "daily_prompt":
      return {
        title: releaseCopy("Drawing variation: prompt", "Вариация рисунка: по теме"),
        description: releaseCopy(
          "A shared-drawing variation where one prompt sets the first direction.",
          "Вариация общего рисунка, где одна тема задаёт первое направление."
        ),
        details: releaseCopy(
          "You still make one shared drawing together and come to the same honest decision about chat.",
          "Вы всё равно делаете один общий рисунок и приходите к тому же честному решению об открытии чата."
        ),
      };
    case "color_mood":
      return {
        title: releaseCopy("Mood palette", "Палитра настроения"),
        description: releaseCopy(
          "A softer, shorter way to start together through color instead of drawing.",
          "Более мягкий и короткий способ начать вместе через цвет, а не через рисунок."
        ),
        details: releaseCopy(
          "Shorter and lighter than drawing: 3 colors each, then one shared palette and the same honest decision about chat.",
          "Короче и легче, чем рисунок: по 3 цвета с каждой стороны, потом одна общая палитра и то же честное решение об открытии чата."
        ),
      };
    default:
      return {
        title: releaseCopy("Shared session", "Совместная сессия"),
        description: releaseCopy("One shared experience for two.", "Один общий опыт на двоих."),
        details: releaseCopy(
          "After the session ends, the story stays saved and chat opens only if both of you want it.",
          "После завершения история сохранится, а чат откроется только по взаимному желанию."
        ),
      };
  }
}

export function getPlayMatchModeCopy(activity: PlayActivity | null): PlayMatchModeCopy {
  switch (activity) {
    case "chain_draw":
      return {
        eyebrow: releaseCopy("Drawing variation: turns", "Вариация рисунка: по очереди"),
        preparingBody: releaseCopy(
          "We'll put you in line now and try to find the second person for the turn-based variation of shared drawing.",
          "Сейчас поставим тебя в очередь и попробуем быстро найти второго человека для вариации общего рисунка по очереди."
        ),
        searchingBody: releaseCopy(
          "As soon as we find the second person, we'll open one shared canvas. You will keep building one drawing together in short turns.",
          "Как только найдём второго участника, сразу откроем один общий холст. Вы будете короткими ходами продолжать один общий рисунок."
        ),
        delayedBody: releaseCopy(
          "This usually happens quickly, but sometimes the search takes a little longer. Stay here or come back and try again later.",
          "Обычно это происходит быстро, но иногда поиск занимает чуть больше времени. Оставайся здесь или вернись и попробуй снова позже."
        ),
        foundBody: releaseCopy(
          "We're connecting you to the shared canvas now. The turn-based variation will open in a couple of seconds.",
          "Подключаем вас к общему холсту. Вариация рисунка по очереди откроется через пару секунд."
        ),
        caption: releaseCopy(
          "A drawing variation with 10 turns of 30 seconds on one shared canvas.",
          "Вариация рисунка с 10 ходами по 30 секунд на одном общем холсте."
        ),
      };
    case "daily_prompt":
      return {
        eyebrow: releaseCopy("Drawing variation: prompt", "Вариация рисунка: по теме"),
        preparingBody: releaseCopy(
          "We'll put you in line now and try to find someone for the prompt-led variation of shared drawing.",
          "Сейчас поставим тебя в очередь и попробуем быстро найти человека для вариации общего рисунка с общей темой."
        ),
        searchingBody: releaseCopy(
          "As soon as we find the second person, we'll open one shared canvas and reveal the prompt that sets the first direction.",
          "Как только найдём второго участника, сразу откроем один общий холст и покажем тему, которая задаст первое направление."
        ),
        delayedBody: releaseCopy(
          "This usually happens quickly, but sometimes finding someone for this drawing variation takes a bit longer. Stay here or come back later.",
          "Обычно это происходит быстро, но иногда поиск человека для этой вариации рисунка занимает чуть больше времени. Оставайся здесь или вернись позже."
        ),
        foundBody: releaseCopy(
          "We found the second person. Opening the shared canvas and the prompt now.",
          "Человек найден. Открываем общий холст и тему. Это займёт пару секунд."
        ),
        caption: releaseCopy(
          "A drawing variation with one prompt, one shared canvas, and one result before the open decision.",
          "Вариация рисунка с одной темой, одним общим холстом и одним итогом перед решением об открытии чата."
        ),
      };
    case "color_mood":
      return {
        eyebrow: releaseCopy("Mood palette", "Палитра настроения"),
        preparingBody: releaseCopy(
          "We'll put you in line now and try to find someone for the softer color-mood variation.",
          "Сейчас поставим тебя в очередь и попробуем быстро найти человека для мягкой вариации через цвет."
        ),
        searchingBody: releaseCopy(
          "As soon as we find the second person, we'll open a short color-picking session. Each of you chooses three colors, then one shared palette appears.",
          "Как только найдём второго участника, сразу откроем короткую сессию выбора цветов. Каждый выберет три цвета, а потом появится одна общая палитра."
        ),
        delayedBody: releaseCopy(
          "This usually takes only a moment, but sometimes the mood palette needs a little more waiting. Stay here or come back later.",
          "Обычно поиск занимает немного времени, но иногда на палитру настроения нужно подождать чуть дольше. Оставайся здесь или вернись позже."
        ),
        foundBody: releaseCopy(
          "We found the second person. Opening the palette and color choices now.",
          "Человек найден. Открываем палитру настроения и выбор цветов."
        ),
        caption: releaseCopy(
          "Softer and shorter than drawing: 3 colors each, then one shared palette and the same honest decision about chat.",
          "Мягче и короче, чем рисунок: по 3 цвета с каждой стороны, потом одна общая палитра и то же честное решение об открытии чата."
        ),
      };
    case "draw":
    default:
      return {
        eyebrow: releaseCopy("Shared drawing", "Общий рисунок"),
        preparingBody: releaseCopy(
          "We'll put you in line now and try to find the second person for the main Together path: one shared drawing challenge.",
          "Сейчас поставим тебя в очередь и попробуем быстро найти второго человека для главного пути «Вместе»: одного общего творческого вызова."
        ),
        searchingBody: releaseCopy(
          "As soon as we find the second person, we'll open one shared challenge and one canvas. You will draw the same idea together from the first stroke to the result.",
          "Как только найдём второго участника, сразу откроем один общий вызов и один холст. Вы будете вместе вести одну идею от первого штриха до общего итога."
        ),
        delayedBody: releaseCopy(
          "This main path usually starts quickly, but sometimes the search takes a little longer. Stay here or come back and try again later.",
          "Обычно главный путь стартует быстро, но иногда поиск занимает чуть больше времени. Оставайся здесь или вернись и попробуй снова позже."
        ),
        foundBody: releaseCopy(
          "We found the second person. Opening your shared challenge and canvas now.",
          "Человек найден. Открываем ваш общий вызов и холст."
        ),
        caption: releaseCopy(
          "The main Together path: one creative challenge, seven minutes, one shared result, then one honest decision about chat.",
          "Главный путь «Вместе»: один творческий вызов, 7 минут, один общий итог и потом честное решение об открытии чата."
        ),
      };
  }
}

export function getPlayCanvasModeCopy(options: {
  activity: string;
  status?: string;
  promptText?: string;
  isMyTurn?: boolean;
  currentTurnName?: string;
}): PlayCanvasModeCopy {
  const { activity, currentTurnName, isMyTurn, promptText, status } = options;
  const isActive = status === "active";
  const promptValue =
    promptText?.trim() || releaseCopy("Prompt is still loading", "Тема уточняется");

  switch (activity) {
    case "chain_draw":
      return isActive
        ? {
            eyebrow: releaseCopy("Drawing variation: turns", "Вариация рисунка: по очереди"),
            title: currentTurnName || releaseCopy("Preparing the first turn", "Подключаем первый ход"),
            body: isMyTurn
              ? releaseCopy(
                  "This shared-drawing variation gives you a short 30-second turn. If you finish early, you can pass the canvas right away.",
                  "В этой вариации общего рисунка у тебя короткий ход на 30 секунд. Когда закончишь раньше, можно сразу передать холст дальше."
                )
              : releaseCopy(
                  "The other person is drawing now. You can see the same shared canvas and continue the drawing on the next turn.",
                  "Сейчас рисует второй участник. Ты видишь тот же общий холст и сможешь продолжить рисунок на следующем ходе."
                ),
            helperText: isMyTurn
              ? releaseCopy(
                  "Each turn lasts 30 seconds. If you finish early, pass it on and let the drawing keep moving.",
                  "Ход длится 30 секунд. Когда закончил раньше, передай ход и пусть рисунок продолжится дальше."
                )
              : releaseCopy(
                  "The canvas is with the other person right now. You can see the shared drawing and continue it on your next turn.",
                  "Сейчас холст у второго участника. Ты видишь общий рисунок и сможешь продолжить его на следующем ходе."
                ),
          }
        : {
            eyebrow: releaseCopy("Drawing variation: turns", "Вариация рисунка: по очереди"),
            title: releaseCopy("Preparing the turn-by-turn canvas", "Собираем пошаговый холст"),
            body: releaseCopy(
              "The shared drawing is already open. We're syncing the first turn of this drawing variation for both of you.",
              "Общий рисунок уже открыт. Синхронизируем первый ход этой вариации для вас двоих."
            ),
            helperText: releaseCopy(
              "The session is about to open and you'll start building the drawing in short turns.",
              "Сейчас сессия откроется и вы начнёте собирать рисунок короткими ходами."
            ),
          };
    case "daily_prompt":
      return isActive
        ? {
            eyebrow: releaseCopy("Drawing variation: prompt", "Вариация рисунка: по теме"),
            title: promptValue,
            body: releaseCopy(
              "One shared drawing for two around this prompt. When time ends, you'll see the result and decide whether this should move into chat.",
              "Один общий рисунок на двоих вокруг этой темы. Когда время закончится, вы увидите итог и решите, открывать ли чат дальше."
            ),
            helperText: releaseCopy(
              "You have seven minutes for one shared drawing around today's prompt. The first stroke can set the mood right away.",
              "У вас 7 минут на один общий рисунок по сегодняшней теме. Первый штрих может сразу задать общий образ."
            ),
          }
        : {
            eyebrow: releaseCopy("Drawing variation: prompt", "Вариация рисунка: по теме"),
            title: releaseCopy("Connecting the prompt and canvas", "Подключаем тему и холст"),
            body: releaseCopy(
              "The shared canvas is already open. We're syncing the prompt for both of you now.",
              "Общий холст уже открыт. Сейчас синхронизируем тему для вас двоих."
            ),
            helperText: releaseCopy(
              "The prompt will appear for both of you in a moment, and then the shared drawing can begin.",
              "Сейчас тема появится у вас обоих, и можно будет начать один общий рисунок."
            ),
          };
    case "draw":
    default:
      return isActive
        ? {
            eyebrow: releaseCopy("Shared drawing", "Общий рисунок"),
            title: promptText?.trim()
              ? promptText.trim()
              : releaseCopy("One shared creative challenge", "Один общий творческий вызов"),
            body: releaseCopy(
              "This is the main Together path: answer the same creative challenge together on one canvas. When time ends, the result becomes your shared story.",
              "Это главный путь «Вместе»: вместе ответьте на один творческий вызов на общем холсте. Когда время закончится, итог станет вашей общей историей."
            ),
            helperText: releaseCopy(
              "You have seven minutes to build one shared answer. The result stays in history and can become the reason to open chat.",
              "У вас 7 минут, чтобы собрать один общий ответ. Итог останется в истории и может стать поводом открыть чат."
            ),
          }
        : {
            eyebrow: releaseCopy("Shared drawing", "Общий рисунок"),
            title: releaseCopy("Connecting the shared canvas", "Подключаем общий холст"),
            body: releaseCopy(
              "The canvas is already open. We're syncing the main shared drawing for both of you now.",
              "Холст уже открыт. Сейчас синхронизируем главный общий рисунок для вас двоих."
            ),
            helperText: releaseCopy(
              "The shared canvas is about to appear, and then you can start drawing together.",
              "Сейчас общий холст появится и можно будет начать рисовать вместе."
            ),
          };
  }
}

export function getPlayModeContextCardCopy(
  activity: string,
  options?: {
    surface?: PlayModeContextSurface;
    promptText?: string;
  }
): PlayModeContextCardCopy {
  const surface = options?.surface ?? "history";
  const promptValue =
    options?.promptText?.trim() || releaseCopy("Prompt is still loading", "Тема уточняется");

  switch (activity) {
    case "chain_draw":
      return {
        title: releaseCopy("Shared drawing", "Общий рисунок"),
        body:
          surface === "result"
            ? releaseCopy(
                "This saved result came from one shared drawing.",
                "Этот сохранённый итог вырос из одного общего рисунка."
              )
            : surface === "detail"
              ? releaseCopy(
                  "This is where your saved shared drawing stays: one canvas and one result.",
                  "Здесь остаётся ваш сохранённый общий рисунок: один холст и один итог."
                )
              : releaseCopy(
                  "One saved shared drawing you built together.",
                  "Один сохранённый общий рисунок, который вы собрали вместе."
                ),
        facts: [
          releaseCopy("Saved story", "Сохранённая история"),
          releaseCopy("One shared canvas", "Один общий холст"),
        ],
      };
    case "daily_prompt":
      return {
        title: releaseCopy("Shared drawing", "Общий рисунок"),
        body:
          surface === "result"
            ? releaseCopy(
                "This saved result came from one shared drawing.",
                "Этот сохранённый итог вырос из одного общего рисунка."
              )
            : surface === "detail"
              ? releaseCopy(
                  "This is where your saved shared drawing stays: one canvas and one result.",
                  "Здесь остаётся ваш сохранённый общий рисунок: один холст и один итог."
                )
              : releaseCopy(
                  "One saved shared drawing the two of you made together.",
                  "Один сохранённый общий рисунок, который вы сделали вместе."
                ),
        facts: [
          releaseCopy("7 min", "7 минут"),
          releaseCopy("One shared drawing", "Один общий рисунок"),
        ],
        tagLabel: releaseCopy("Challenge", "Вызов"),
        tagValue: promptValue,
      };
    case "color_mood":
      return {
        title: releaseCopy("Your shared palette", "Ваша общая палитра"),
        body:
          surface === "result"
            ? releaseCopy(
                "You each chose colors first, and the shared palette came together here.",
                "Сначала каждый выбрал цвета, а потом здесь собралась общая палитра."
              )
            : surface === "detail"
              ? releaseCopy(
                  "This page keeps the shared palette and both color choices from this session.",
                  "Эта страница хранит общую палитру и оба выбора цветов из этой сессии."
                )
              : releaseCopy(
                  "This is where the shared colors and the result of this palette stay.",
                  "Здесь остаются общие цвета и итог этой палитры."
                ),
        facts: [],
        emptyTitle: releaseCopy(
          "The palette wasn't fully assembled",
          "Палитра не успела полностью собраться"
        ),
        emptyBody:
          surface === "history"
            ? releaseCopy(
                "This story was saved without the full shared palette, but the result still stayed in your history.",
                "Эта история сохранилась без полной общей палитры, но сам итог всё равно остался в вашей истории."
              )
            : releaseCopy(
                "This session ended before the full shared palette came together. The colors that were saved still remain in the story.",
                "Эта сессия завершилась раньше, чем успела собраться полная общая палитра. Сохранённые цвета всё равно остались в истории."
              ),
      };
    case "draw":
    default: {
      const drawPrompt = options?.promptText?.trim();
      return {
        title: releaseCopy("Shared drawing", "Общий рисунок"),
        body:
          surface === "result"
            ? releaseCopy(
                "This is the core Together path: one creative challenge, one shared canvas, and one result.",
                "Это ядро «Вместе»: один творческий вызов, один общий холст и один итог."
              )
            : surface === "detail"
              ? releaseCopy(
                  "This is where your shared drawing stays: the challenge, the result, and the story that can grow into connection.",
                  "Здесь остаётся ваш общий рисунок: вызов, итог и история, из которой может вырасти связь."
                )
              : releaseCopy(
                  "One creative challenge and the shared drawing that stayed in your story.",
                  "Один творческий вызов и общий рисунок, который остался в вашей истории."
                ),
        facts: [
          releaseCopy("7 min", "7 минут"),
          releaseCopy("One creative challenge", "Один творческий вызов"),
          releaseCopy("One shared canvas", "Один общий холст"),
        ],
        ...(drawPrompt
          ? {
              tagLabel: releaseCopy("Challenge", "Вызов"),
              tagValue: drawPrompt,
            }
          : {}),
      };
    }
  }
}

export function getPlayActivityMetricLabel(
  activity: string,
  tone: "result" | "detail" | "history" = "detail"
) {
  if (activity === "color_mood") {
    return tone === "result"
      ? playText("play.metric.colors.result", "Colors in palette")
      : playText("play.metric.colors.default", "Colors");
  }
  return playText("play.metric.strokes", "Strokes");
}

export function getPlayResultModeCopy(activity: string): PlayResultModeCopy {
  switch (activity) {
    case "chain_draw":
    case "daily_prompt":
      return {
        heroTitle: releaseCopy(
          "Your shared drawing is ready",
          "Ваш общий рисунок готов"
        ),
        heroBody: releaseCopy(
          "One saved shared result on one canvas.",
          "Один сохранённый общий итог на одном холсте."
        ),
      };
    case "color_mood":
      return {
        heroTitle: releaseCopy(
          "Your shared palette is ready",
          "Ваша общая палитра готова"
        ),
        heroBody: releaseCopy(
          "The short color mood you just finished.",
          "Короткий итог палитры настроения, которую вы только что завершили."
        ),
      };
    case "draw":
    default:
      return {
        heroTitle: releaseCopy(
          "Your shared drawing is ready",
          "Ваш общий рисунок готов"
        ),
        heroBody: releaseCopy(
          "The answer you built together to one creative challenge.",
          "Ваш совместный ответ на один творческий вызов."
        ),
      };
  }
}

export function getPlayReplayCopy(activity: string): PlayReplayCopy {
  switch (activity) {
    case "chain_draw":
    case "daily_prompt":
      return {
        title: releaseCopy(
          "Replay of the shared drawing",
          "Повтор общего рисунка"
        ),
        body: releaseCopy(
          "The strokes run in their original order so you can return to the shared drawing you built together.",
          "Штрихи идут в исходном порядке, чтобы можно было вернуться к общему рисунку, который вы собрали вместе."
        ),
        emptyTitle: releaseCopy("Replay is empty for now", "Повтор пока пустой"),
        emptyBody: releaseCopy(
          "This session was saved without strokes. The result stayed, but the replay of the drawing is unavailable here.",
          "Эта сессия сохранилась без штрихов. Итог остался, но повтор рисунка здесь недоступен."
        ),
      };
    case "draw":
    default:
      return {
        title: releaseCopy(
          "Replay of the shared drawing",
          "Повтор общего рисунка"
        ),
        body: releaseCopy(
          "The strokes run in their original order so you can return to how the challenge became your shared result.",
          "Штрихи идут в исходном порядке, чтобы можно было вернуться к тому, как вызов стал вашим общим итогом."
        ),
        emptyTitle: releaseCopy("Replay is empty for now", "Повтор пока пустой"),
        emptyBody: releaseCopy(
          "This session was saved without strokes. The result and connection status stayed, but the replay is unavailable here.",
          "Эта сессия сохранилась без штрихов. Итог и статус связи остались, но повтор здесь недоступен."
        ),
      };
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
  const status =
    data.status === "matched" ||
    data.status === "cancelled" ||
    data.status === "expired"
      ? data.status
      : "waiting";
  const nickname =
    typeof data.nickname === "string" && data.nickname.trim()
      ? data.nickname.trim()
      : typeof data.displayName === "string" && data.displayName.trim()
        ? data.displayName.trim()
        : "";
  const displayName =
    typeof data.displayName === "string" && data.displayName.trim()
      ? data.displayName.trim()
      : nickname;
  const leaseVersion = Number(data.leaseVersion);
  const matchedAt = Number(data.matchedAt);
  return {
    uid: String(data.uid ?? id),
    activity: normalizePlayActivity(data.activity),
    createdAt: Number(data.createdAt ?? 0),
    updatedAt: Number(data.updatedAt ?? 0),
    expiresAt: Number(data.expiresAt ?? 0),
    status,
    ...(nickname ? { nickname } : {}),
    ...(displayName ? { displayName } : {}),
    ...(Number.isFinite(leaseVersion) && leaseVersion > 0 ? { leaseVersion } : {}),
    ...(status === "matched" && data.sessionId ? { sessionId: String(data.sessionId) } : {}),
    ...(Number.isFinite(matchedAt) && matchedAt > 0 ? { matchedAt } : {}),
  };
}

function normalizeParticipantName(value: unknown) {
  const name = String(value ?? "").trim();
  if (!name || LEGACY_NICKNAME_RE.test(name)) return "";
  return name;
}

function resolveQueueNickname(queue: Pick<PlayQueueDoc, "uid" | "nickname">) {
  const nickname = normalizeParticipantName(queue.nickname);
  if (nickname) return nickname;
  return RELEASE_IDENTITY_FALLBACK;
}

function buildQueueIdentityPatch(nickname?: string) {
  const displayName = normalizeParticipantName(nickname);
  return displayName ? { nickname: displayName, displayName } : {};
}

function buildWaitingQueuePayload(options: {
  uid: string;
  activity: ReleasePlayActivity;
  nickname?: string;
  now: number;
}) {
  const { activity, nickname, now, uid } = options;
  return {
    uid,
    activity,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + PLAY_QUEUE_TTL_MS,
    leaseVersion: now,
    status: "waiting" satisfies PlayQueueStatus,
    ...buildQueueIdentityPatch(nickname),
  };
}

function buildTerminalQueuePayload(options: {
  queue: PlayQueueDoc;
  status: Extract<PlayQueueStatus, "cancelled" | "expired">;
  now: number;
}) {
  const { now, queue, status } = options;
  return {
    uid: queue.uid,
    activity: queue.activity,
    createdAt: queue.createdAt > 0 ? queue.createdAt : now,
    updatedAt: now,
    expiresAt: queue.expiresAt > 0 ? queue.expiresAt : now,
    leaseVersion: queue.leaseVersion ?? queue.createdAt ?? now,
    status,
    ...buildQueueIdentityPatch(queue.displayName ?? queue.nickname),
  };
}

function buildMatchedQueuePayload(options: {
  queue: PlayQueueDoc;
  sessionId: string;
  now: number;
}) {
  const { now, queue, sessionId } = options;
  return {
    uid: queue.uid,
    activity: queue.activity,
    createdAt: queue.createdAt > 0 ? queue.createdAt : now,
    updatedAt: now,
    expiresAt: queue.expiresAt > 0 ? queue.expiresAt : now,
    leaseVersion: queue.leaseVersion ?? queue.createdAt ?? now,
    status: "matched" satisfies PlayQueueStatus,
    matchedAt: now,
    ...buildQueueIdentityPatch(queue.displayName ?? queue.nickname),
    sessionId,
  };
}

function isWaitingQueueEntryActive(
  queue: PlayQueueDoc,
  activity: ReleasePlayActivity,
  now: number
) {
  return (
    queue.status === "waiting" &&
    queue.activity === activity &&
    queue.expiresAt > now
  );
}

function isCompatibleQueueCandidate(
  queue: PlayQueueDoc,
  uid: string,
  activity: ReleasePlayActivity,
  now: number
) {
  return queue.uid !== uid && isWaitingQueueEntryActive(queue, activity, now);
}

function asPlaySessionDoc(id: string, raw: unknown): PlaySessionDoc {
  const data = (raw ?? {}) as Partial<PlaySessionDoc>;
  const promptId = normalizePromptString(data.promptId);
  const promptText = normalizePromptString(data.promptText);
  const paletteChoices = normalizeColorMoodChoices(data.paletteChoices);
  const combinedPalette = normalizeColorMoodPalette(
    data.combinedPalette,
    COLOR_MOOD_OPTION_DEFS.length
  );
  return {
    id,
    activity: normalizePlayActivity(data.activity),
    status: (data.status ?? "matching") as PlaySessionStatus,
    createdAt: Number(data.createdAt ?? 0),
    startedAt: Number(data.startedAt ?? data.createdAt ?? 0),
    ...(data.endedAt != null ? { endedAt: Number(data.endedAt) } : {}),
    ...(promptId ? { promptId } : {}),
    ...(promptText ? { promptText } : {}),
    ...(Object.keys(paletteChoices).length ? { paletteChoices } : {}),
    ...(data.paletteCompletedAt != null
      ? { paletteCompletedAt: Number(data.paletteCompletedAt) }
      : {}),
    ...(combinedPalette.length ? { combinedPalette } : {}),
    ...(data.colorMoodPhase ? { colorMoodPhase: normalizeColorMoodPhase(data.colorMoodPhase) } : {}),
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
  activity: ReleasePlayActivity,
  nickname?: string
): Promise<PlayQueueDoc> {
  requireCurrentUserForPlayQueue(uid);
  if (!isReleasePlayActivity(activity)) {
    const error = new Error("Invalid release activity for play queue");
    (error as Error & { code?: string }).code = "play/invalid-activity";
    throw error;
  }

  const ref = doc(db, "playQueue", uid);

  return runTransaction(db, async (tx) => {
    const now = Date.now();
    await tx.get(ref);
    const payload = buildWaitingQueuePayload({ uid, activity, nickname, now });
    tx.set(ref, payload);
    return asPlayQueueDoc(uid, payload);
  });
}

export async function cancelPlayRequest(db: Firestore, uid: string): Promise<void> {
  requireCurrentUserForPlayQueue(uid);
  const queueRef = doc(db, "playQueue", uid);
  await runTransaction(db, async (tx) => {
    const now = Date.now();
    const snapshot = await tx.get(queueRef);
    if (!snapshot.exists()) return;

    const current = asPlayQueueDoc(snapshot.id, snapshot.data());
    if (current.status === "matched" && current.sessionId) return;
    if (current.status === "cancelled") return;
    if (current.status === "expired") return;

    tx.set(
      queueRef,
      buildTerminalQueuePayload({
        queue: {
          ...current,
          uid,
        },
        status: "cancelled",
        now,
      })
    );
  });
}

export async function expirePlayRequest(db: Firestore, uid: string): Promise<void> {
  requireCurrentUserForPlayQueue(uid);
  const queueRef = doc(db, "playQueue", uid);
  await runTransaction(db, async (tx) => {
    const now = Date.now();
    const snapshot = await tx.get(queueRef);
    if (!snapshot.exists()) return;

    const current = asPlayQueueDoc(snapshot.id, snapshot.data());
    if (current.status === "matched" && current.sessionId) return;
    if (current.status === "cancelled" || current.status === "expired") return;
    if (current.expiresAt > now) return;

    tx.set(
      queueRef,
      buildTerminalQueuePayload({
        queue: {
          ...current,
          uid,
        },
        status: "expired",
        now,
      })
    );
  });
}

export function subscribeOwnQueueEntry(
  db: Firestore,
  uid: string,
  onData: (data: PlayQueueDoc | null) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, "playQueue", uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onData(null);
        return;
      }
      onData(asPlayQueueDoc(snapshot.id, snapshot.data()));
    },
    (error) => {
      onError?.(error);
      onData(null);
    }
  );
}

export async function tryMatchWaitingPlayer(
  db: Firestore,
  uid: string,
  nickname: string,
  activity: ReleasePlayActivity
): Promise<{ sessionId: string; matched: boolean; expired?: boolean }> {
  requireCurrentUserForPlayQueue(uid);
  if (!isReleasePlayActivity(activity)) {
    return { sessionId: "", matched: false };
  }

  const queryNow = Date.now();
  const queueRef = doc(db, "playQueue", uid);
  const waitingQuery = query(
    collection(db, "playQueue"),
    where("activity", "==", activity),
    where("status", "==", "waiting"),
    where("expiresAt", ">", queryNow),
    orderBy("expiresAt", "asc"),
    orderBy("createdAt", "asc"),
    limit(PLAY_QUEUE_CANDIDATE_LIMIT)
  );
  const waitingSnapshot = await getDocs(waitingQuery);
  const candidateIds = waitingSnapshot.docs
    .map((item) => asPlayQueueDoc(item.id, item.data()))
    .filter((item) => isCompatibleQueueCandidate(item, uid, activity, queryNow))
    .sort((a, b) => {
      const createdDelta = a.createdAt - b.createdAt;
      if (createdDelta !== 0) return createdDelta;
      return a.uid.localeCompare(b.uid);
    })
    .map((item) => item.uid);

  return runTransaction(db, async (tx) => {
    const now = Date.now();
    const ownSnapshot = await tx.get(queueRef);

    if (!ownSnapshot.exists()) {
      return { sessionId: "", matched: false };
    }

    const ownQueue = asPlayQueueDoc(ownSnapshot.id, ownSnapshot.data());
    if (ownQueue.status === "matched" && ownQueue.sessionId) {
      return { sessionId: ownQueue.sessionId, matched: true };
    }
    if (ownQueue.status === "cancelled") {
      return { sessionId: "", matched: false };
    }
    if (ownQueue.status === "expired") {
      return { sessionId: "", matched: false, expired: true };
    }
    if (!isWaitingQueueEntryActive(ownQueue, activity, now) || ownQueue.uid !== uid) {
      if (ownQueue.status === "waiting" && ownQueue.expiresAt <= now) {
        tx.set(
          queueRef,
          buildTerminalQueuePayload({
            queue: {
              ...ownQueue,
              uid,
            },
            status: "expired",
            now,
          })
        );
        return { sessionId: "", matched: false, expired: true };
      }

      return { sessionId: "", matched: false };
    }

    let candidateData: PlayQueueDoc | null = null;

    for (const candidateId of candidateIds) {
      const candidateSnapshot = await tx.get(doc(db, "playQueue", candidateId));
      if (!candidateSnapshot.exists()) continue;

      const value = asPlayQueueDoc(candidateSnapshot.id, candidateSnapshot.data());
      if (!isCompatibleQueueCandidate(value, uid, activity, now)) continue;

      candidateData = value;
      break;
    }

    if (!candidateData) {
      return { sessionId: "", matched: false };
    }

    const sessionRef = doc(collection(db, "playSessions"));
    const sessionId = sessionRef.id;
    const participantIds = [candidateData.uid, uid];
    const participantNicknames: Record<string, string> = {
      [candidateData.uid]: resolveQueueNickname(candidateData),
      [uid]: normalizeParticipantName(nickname) || RELEASE_IDENTITY_FALLBACK,
    };
    const prompt = activity === "draw" ? getPlayDrawChallengeForSeed(sessionId) : null;
    const colorMoodPatch =
      activity === "color_mood"
        ? {
            colorMoodPhase: "picking" satisfies PlayColorMoodPhase,
          }
        : null;

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
      ...(colorMoodPatch ?? {}),
      participantIds,
      participantNicknames,
    });

    tx.set(
      doc(db, "playQueue", candidateData.uid),
      buildMatchedQueuePayload({
        queue: candidateData,
        sessionId,
        now,
      })
    );

    tx.set(
      queueRef,
      buildMatchedQueuePayload({
        queue: {
          ...ownQueue,
          uid,
          displayName: normalizeParticipantName(nickname) || ownQueue.displayName,
          nickname: normalizeParticipantName(nickname) || ownQueue.nickname,
        },
        sessionId,
        now,
      })
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

export async function getPlaySessionById(
  db: Firestore,
  sessionId: string
): Promise<PlaySessionDoc | null> {
  const stableSessionId = String(sessionId ?? "").trim();
  if (!stableSessionId) return null;

  const snapshot = await getDoc(doc(db, "playSessions", stableSessionId));
  if (!snapshot.exists()) return null;
  return asPlaySessionDoc(snapshot.id, snapshot.data());
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
        shortLabel: playText("play.reveal.openOpen.shortLabel", "Connection is open"),
        description: playText(
          "play.reveal.openOpen.description",
          "After this shared result, both of you opened the connection and moved it into chat."
        ),
      };
    case "open_skip":
      return {
        shortLabel: playText("play.reveal.openSkip.shortLabel", "Stayed a story"),
        description: playText(
          "play.reveal.openSkip.description",
          "One person was ready to open the connection, but this moment still remained only a shared story."
        ),
      };
    case "skip_skip":
      return {
        shortLabel: playText("play.reveal.skipSkip.shortLabel", "Story is saved"),
        description: playText(
          "play.reveal.skipSkip.description",
          "Both of you chose to keep this moment as a shared story and not move it into chat."
        ),
      };
    default:
      return {
        shortLabel: playText("play.reveal.waiting.shortLabel", "Waiting for the second answer"),
        description: playText(
          "play.reveal.waiting.description",
          "One answer is already saved. We are waiting for the second one to see whether chat opens."
        ),
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
  const combinedPalette = getPlayColorMoodCombinedPalette(session);

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
    ...(combinedPalette.length ? { combinedPalette } : {}),
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

export async function submitColorMoodChoices(
  db: Firestore,
  sessionId: string,
  uid: string,
  choices: string[]
): Promise<SubmitColorMoodChoicesResult> {
  const sessionRef = doc(db, "playSessions", sessionId);
  const normalizedChoices = normalizeColorMoodPalette(choices);
  if (normalizedChoices.length !== COLOR_MOOD_SELECTION_COUNT) {
    return { state: "ignored" };
  }

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(sessionRef);
    if (!snapshot.exists()) {
      return { state: "ignored" };
    }

    const session = asPlaySessionDoc(snapshot.id, snapshot.data());
    if (session.activity !== "color_mood") {
      return { state: "ignored" };
    }
    if (session.status !== "active") {
      const combinedPalette = getPlayColorMoodCombinedPalette(session);
      return {
        state: getPlayColorMoodPhase(session) === "finished" ? "finished" : "ignored",
        ...(combinedPalette.length ? { combinedPalette } : {}),
      };
    }

    const currentChoices = normalizeColorMoodChoices(session.paletteChoices);
    const ownSavedChoices = currentChoices[uid] ?? [];
    if (ownSavedChoices.length === COLOR_MOOD_SELECTION_COUNT) {
      const combinedPalette = getPlayColorMoodCombinedPalette(session);
      return {
        state: getPlayColorMoodPhase(session) === "finished" ? "finished" : "waiting",
        ...(combinedPalette.length ? { combinedPalette } : {}),
      };
    }

    const nextChoices = {
      ...currentChoices,
      [uid]: normalizedChoices,
    };
    const allSubmitted =
      session.participantIds.length > 0 &&
      session.participantIds.every(
        (participantId) =>
          (nextChoices[participantId] ?? []).length === COLOR_MOOD_SELECTION_COUNT
      );
    const combinedPalette = allSubmitted
      ? buildCombinedColorMoodPalette(nextChoices, session.participantIds)
      : [];
    const now = Date.now();

    tx.set(
      sessionRef,
      {
        paletteChoices: nextChoices,
        colorMoodPhase: allSubmitted
          ? ("finished" satisfies PlayColorMoodPhase)
          : ("picking" satisfies PlayColorMoodPhase),
        ...(allSubmitted
          ? {
              combinedPalette,
              paletteCompletedAt: now,
              endedAt: now,
              status: "finished" satisfies PlaySessionStatus,
            }
          : {}),
      },
      { merge: true }
    );

    return {
      state: allSubmitted ? "finished" : "waiting",
      ...(combinedPalette.length ? { combinedPalette } : {}),
    };
  });
}

export async function finalizeColorMoodSession(
  db: Firestore,
  sessionId: string
): Promise<string[]> {
  const sessionRef = doc(db, "playSessions", sessionId);

  return runTransaction(db, async (tx) => {
    const snapshot = await tx.get(sessionRef);
    if (!snapshot.exists()) return [];

    const session = asPlaySessionDoc(snapshot.id, snapshot.data());
    if (session.activity !== "color_mood") {
      return [];
    }

    const combinedPalette = getPlayColorMoodCombinedPalette(session);
    const now = Date.now();

    tx.set(
      sessionRef,
      {
        colorMoodPhase: "finished" satisfies PlayColorMoodPhase,
        ...(combinedPalette.length ? { combinedPalette } : {}),
        ...(combinedPalette.length ? { paletteCompletedAt: now } : {}),
        endedAt: session.endedAt ?? now,
        status:
          session.status === "revealed"
            ? ("revealed" satisfies PlaySessionStatus)
            : ("finished" satisfies PlaySessionStatus),
      },
      { merge: true }
    );

    return combinedPalette;
  });
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
        status: allSubmitted ? ("revealed" satisfies PlaySessionStatus) : session.status,
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
    nickname: normalizeParticipantName(session.participantNicknames[peerUid]) || RELEASE_IDENTITY_FALLBACK,
  };
}
