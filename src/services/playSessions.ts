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
import { getRuntimeLocale, translate } from "@/i18n/translations";
import { makeNickname } from "@/services/rooms";

export type PlayActivity = "draw" | "chain_draw" | "daily_prompt" | "color_mood";
export type PlayActivityLabelTone = "action" | "history" | "neutral";
export type PlayDailyPrompt = {
  id: string;
  text: string;
};
export type PlayColorMoodPhase = "picking" | "finished";
export type PlayColorMoodOption = {
  id: string;
  label: string;
  hex: string;
};

export const CHAIN_DRAW_TURN_DURATION_SEC = 30;
export const CHAIN_DRAW_MAX_TURNS = 10;
export const COLOR_MOOD_SELECTION_COUNT = 3;
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
const COLOR_MOOD_OPTIONS: PlayColorMoodOption[] = [
  { id: "soft_pink", label: "Мягкий розовый", hex: "#FF8FB1" },
  { id: "peach", label: "Персиковый", hex: "#FFB48A" },
  { id: "golden", label: "Золотистый", hex: "#F4C86A" },
  { id: "lavender", label: "Лавандовый", hex: "#C8A9FF" },
  { id: "deep_violet", label: "Глубокий фиолетовый", hex: "#7350B8" },
  { id: "night_blue", label: "Ночной синий", hex: "#395DB9" },
  { id: "powder", label: "Пудровый", hex: "#F1C9D8" },
  { id: "warm_orange", label: "Тёплый оранжевый", hex: "#FF9150" },
  { id: "soft_coral", label: "Нежный коралл", hex: "#FF7D78" },
  { id: "light_lilac", label: "Светлый сиреневый", hex: "#DAC8FF" },
  { id: "star_indigo", label: "Звёздный индиго", hex: "#4E61D3" },
  { id: "morning_cream", label: "Утренний кремовый", hex: "#F8E9CC" },
];
const COLOR_MOOD_OPTIONS_BY_HEX = new Map(
  COLOR_MOOD_OPTIONS.map((option) => [option.hex.toLowerCase(), option])
);

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
  routeText: string;
};

export type PlayReplayCopy = {
  title: string;
  body: string;
  emptyTitle: string;
  emptyBody: string;
};

type PlayCopyParams = Record<string, string>;

function playText(key: string, fallback: string, params?: PlayCopyParams) {
  const value = translate(getRuntimeLocale(), key, params);
  if (value !== key) return value;
  if (!params) return fallback;

  let output = fallback;
  for (const [name, nextValue] of Object.entries(params)) {
    output = output.replaceAll(`{${name}}`, String(nextValue));
  }
  return output;
}

export function isPlayActivity(value: unknown): value is PlayActivity {
  return (
    value === "draw" ||
    value === "chain_draw" ||
    value === "daily_prompt" ||
    value === "color_mood"
  );
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
  return DAILY_PROMPT_POOL;
}

export function getPlayColorMoodOptions() {
  return COLOR_MOOD_OPTIONS;
}

export function getPlayColorMoodOption(hex: string): PlayColorMoodOption | null {
  const stableHex = normalizeColorMoodChoiceHex(hex);
  if (!stableHex) return null;
  return COLOR_MOOD_OPTIONS_BY_HEX.get(stableHex.toLowerCase()) ?? null;
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
    COLOR_MOOD_OPTIONS.length
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
      if (tone === "action") {
        return playText("play.activity.draw.action", "Draw together");
      }
      if (tone === "history") {
        return playText("play.activity.draw.history", "Drew together");
      }
      return playText("play.activity.draw.neutral", "Free shared drawing");
    case "chain_draw":
      return playText("play.activity.chainDraw", "Turn-based drawing");
    case "daily_prompt":
      return playText("play.activity.dailyPrompt", "Shared prompt of the day");
    case "color_mood":
      if (tone === "action") {
        return playText("play.activity.colorMood.action", "Build a palette together");
      }
      return playText("play.activity.colorMood.neutral", "Mood palette");
    default:
      return playText("play.activity.session", "Shared session");
  }
}

export function getPlayActivityStoryText(activity: string, promptText?: string) {
  switch (activity) {
    case "draw":
      return playText(
        "play.activityStory.draw",
        "One shared drawing on a single canvas."
      );
    case "chain_draw":
      return playText(
        "play.activityStory.chainDraw",
        "One drawing built together in short turns."
      );
    case "daily_prompt":
      return promptText?.trim()
        ? playText(
            "play.activityStory.dailyPromptWithPrompt",
            "One shared drawing around “{prompt}”.",
            { prompt: promptText.trim() }
          )
        : playText(
            "play.activityStory.dailyPrompt",
            "One shared drawing around the prompt of the day."
          );
    case "color_mood":
      return playText(
        "play.activityStory.colorMood",
        "A shared palette and the soft visual result of this session."
      );
    default:
      return playText("play.activityStory.default", "Shared story");
  }
}

export function getPlayLobbyModeCardCopy(activity: PlayActivity): PlayLobbyModeCardCopy {
  switch (activity) {
    case "draw":
      return {
        title: "Свободный общий рисунок",
        description: "Один общий холст, свободный ритм и один итог на двоих.",
        details:
          "7 минут на совместный рисунок, а после завершения вы решаете, открывать ли чат дальше.",
      };
    case "chain_draw":
      return {
        title: "Рисунок по очереди",
        description: "Вы рисуете по очереди короткими ходами и собираете один общий рисунок.",
        details: "10 ходов по 30 секунд, один холст и понятный ритм передачи хода.",
      };
    case "daily_prompt":
      return {
        title: "Общая тема дня",
        description: "Одна тема на двоих, один общий рисунок и один итог.",
        details:
          "Сегодняшняя тема откроется после матча, а дальше вы соберёте один рисунок на двоих.",
      };
    case "color_mood":
      return {
        title: "Палитра настроения",
        description:
          "Каждый выбирает цвета, а вместе вы собираете общую палитру и мягкую совместную композицию.",
        details:
          "Короткая сессия выбора, одна общая палитра и тот же итог с решением об открытии чата.",
      };
    default:
      return {
        title: "Совместная сессия",
        description: "Один общий опыт на двоих.",
        details: "После завершения история сохранится, а чат откроется только по взаимному желанию.",
      };
  }
}

export function getPlayMatchModeCopy(activity: PlayActivity | null): PlayMatchModeCopy {
  switch (activity) {
    case "chain_draw":
      return {
        eyebrow: "Рисунок по очереди",
        preparingBody:
          "Сейчас поставим тебя в очередь и попробуем быстро найти второго человека для рисунка по очереди.",
        searchingBody:
          "Как только найдём второго участника, сразу откроем один общий холст. Вы будете рисовать короткими ходами и по очереди собирать общий рисунок.",
        delayedBody:
          "Обычно это происходит быстро, но иногда поиск занимает чуть больше времени. Оставайся здесь или вернись и попробуй снова позже.",
        foundBody: "Подключаем вас к одному рисунку по очереди. Это займёт пару секунд.",
        caption: "10 ходов по 30 секунд, один общий холст и передача хода после каждого раунда.",
      };
    case "daily_prompt":
      return {
        eyebrow: "Рисунок по теме дня",
        preparingBody:
          "Сейчас поставим тебя в очередь и попробуем быстро найти человека для рисунка по общей теме.",
        searchingBody:
          "Как только найдём второго участника, сразу откроем один общий холст и покажем сегодняшнюю тему.",
        delayedBody:
          "Обычно это происходит быстро, но иногда поиск человека для общей темы занимает чуть больше времени. Оставайся здесь или вернись и попробуй позже.",
        foundBody: "Человек найден. Открываем общий холст и сегодняшнюю тему. Это займёт пару секунд.",
        caption: "Один рисунок на двоих, одна тема и один итог перед решением об открытии чата.",
      };
    case "color_mood":
      return {
        eyebrow: "Общая палитра на двоих",
        preparingBody:
          "Сейчас поставим тебя в очередь и попробуем быстро найти человека для мягкой совместной палитры.",
        searchingBody:
          "Как только найдём второго участника, сразу откроем короткую сессию выбора цветов. Каждый выберет три цвета, а потом появится общая палитра.",
        delayedBody:
          "Обычно поиск занимает немного времени, но иногда на палитру настроения нужно подождать чуть дольше. Оставайся здесь или вернись позже.",
        foundBody: "Человек найден. Открываем палитру настроения и выбор цветов.",
        caption: "Каждый выбирает 3 цвета, а итогом станет одна общая палитра пары.",
      };
    case "draw":
    default:
      return {
        eyebrow: "Свободный общий рисунок",
        preparingBody:
          "Сейчас поставим тебя в очередь и попробуем быстро найти второго человека для общего свободного рисунка.",
        searchingBody:
          "Как только найдём второго участника, сразу откроем один общий холст. Вы будете рисовать вместе в свободном ритме.",
        delayedBody:
          "Обычно это происходит быстро, но иногда поиск занимает чуть больше времени. Оставайся здесь или вернись и попробуй снова позже.",
        foundBody: "Подключаем вас к общему холсту. Это займёт пару секунд.",
        caption: "7 минут, один общий холст, свободный ритм и один итог перед решением об открытии чата.",
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
  const promptValue = promptText?.trim() || "Тема уточняется";

  switch (activity) {
    case "chain_draw":
      return isActive
        ? {
            eyebrow: "Рисунок по очереди",
            title: currentTurnName || "Подключаем первый ход",
            body: isMyTurn
              ? "У тебя короткий ход на 30 секунд. Когда закончишь раньше, можно сразу передать холст дальше."
              : "Сейчас рисует второй участник. Ты видишь общий холст и сможешь продолжить его на следующем ходе.",
            helperText: isMyTurn
              ? "Ход длится 30 секунд. Когда закончил раньше, передай ход и пусть рисунок продолжится дальше."
              : "Сейчас холст у второго участника. Ты видишь общий рисунок и сможешь продолжить его на следующем ходе.",
          }
        : {
            eyebrow: "Рисунок по очереди",
            title: "Собираем пошаговый холст",
            body: "Мы уже открыли один общий рисунок и синхронизируем первый ход для вас двоих.",
            helperText: "Сейчас сессия откроется и вы начнёте собирать рисунок короткими ходами.",
          };
    case "daily_prompt":
      return isActive
        ? {
            eyebrow: "Общая тема дня",
            title: promptValue,
            body:
              "Один рисунок на двоих по сегодняшней теме. Когда время закончится, вы увидите итог и решите, открывать ли чат дальше.",
            helperText:
              "У вас 7 минут на один общий рисунок по сегодняшней теме. Первый штрих может сразу задать общий образ.",
          }
        : {
            eyebrow: "Общая тема дня",
            title: "Подключаем тему и холст",
            body: "Мы уже открыли общий холст и сейчас синхронизируем сегодняшнюю тему для вас двоих.",
            helperText: "Сейчас тема появится у вас обоих, и можно будет начать один общий рисунок.",
          };
    case "draw":
    default:
      return isActive
        ? {
            eyebrow: "Свободный общий рисунок",
            title: "Один общий холст",
            body:
              "Рисуйте вместе в свободном ритме. Когда время закончится, вы увидите итог и решите, хотите ли продолжить общение.",
            helperText:
              "У вас 7 минут на один общий рисунок. Когда время закончится, вы сразу увидите итог и решите, хотите ли открыть чат дальше.",
          }
        : {
            eyebrow: "Свободный общий рисунок",
            title: "Подключаем общий холст",
            body: "Мы уже открыли холст и синхронизируем его для вас двоих.",
            helperText: "Сейчас общий холст появится и можно будет начать рисовать вместе.",
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
  const promptValue = options?.promptText?.trim() || "Тема уточняется";

  switch (activity) {
    case "chain_draw":
      return {
        title: playText("play.modeContext.chainDraw.title", "Turn-based drawing"),
        body:
          surface === "result"
            ? playText(
                "play.modeContext.chainDraw.body.result",
                "This result was built in short turns on one shared canvas."
              )
            : surface === "detail"
              ? playText(
                  "play.modeContext.chainDraw.body.detail",
                  "This is where your turn-based drawing stays: one canvas, short turns, and a clear handoff rhythm."
                )
              : playText(
                  "play.modeContext.chainDraw.body.history",
                  "One shared drawing you built together in short turns."
                ),
        facts: [
          playText("play.modeContext.chainDraw.factTurns", "10 turns"),
          playText("play.modeContext.chainDraw.factTurnDuration", "30 sec per turn"),
          playText("play.modeContext.chainDraw.factCanvas", "One shared canvas"),
        ],
      };
    case "daily_prompt":
      return {
        title: playText("play.modeContext.dailyPrompt.title", "Shared prompt of the day"),
        body:
          surface === "result"
            ? playText(
                "play.modeContext.dailyPrompt.body.result",
                "This result grew out of one shared prompt and one shared canvas."
              )
            : surface === "detail"
              ? playText(
                  "play.modeContext.dailyPrompt.body.detail",
                  "This is where the drawing from your shared prompt stays: one prompt, one canvas, one result."
                )
              : playText(
                  "play.modeContext.dailyPrompt.body.history",
                  "One shared drawing the two of you made around the prompt of the day."
                ),
        facts: [
          playText("play.modeContext.dailyPrompt.factDuration", "7 min"),
          playText("play.modeContext.dailyPrompt.factPrompt", "One prompt"),
          playText("play.modeContext.dailyPrompt.factDrawing", "One shared drawing"),
        ],
        tagLabel: playText("play.modeContext.topicLabel", "Topic"),
        tagValue: promptValue,
      };
    case "color_mood":
      return {
        title: playText("play.modeContext.colorMood.title", "Your shared palette"),
        body:
          surface === "result"
            ? playText(
                "play.modeContext.colorMood.body.result",
                "You each chose colors first, and the shared palette came together here."
              )
            : surface === "detail"
              ? playText(
                  "play.modeContext.colorMood.body.detail",
                  "This page keeps the shared palette and both color choices from this session."
                )
              : playText(
                  "play.modeContext.colorMood.body.history",
                  "This is where the shared colors and the result of this palette stay."
                ),
        facts: [],
        emptyTitle: playText(
          "play.modeContext.colorMood.emptyTitle",
          "The palette wasn't fully assembled"
        ),
        emptyBody:
          surface === "history"
            ? playText(
                "play.modeContext.colorMood.emptyBody.history",
                "This story was saved without the full shared palette, but the result still stayed in your archive."
              )
            : playText(
                "play.modeContext.colorMood.emptyBody.default",
                "This session ended before the full shared palette came together. The colors that were saved still remain in the story."
              ),
      };
    case "draw":
    default:
      return {
        title: playText("play.modeContext.draw.title", "Free shared drawing"),
        body:
          surface === "result"
            ? playText(
                "play.modeContext.draw.body.result",
                "This is one free shared drawing for two people: one canvas and one result."
              )
            : surface === "detail"
              ? playText(
                  "play.modeContext.draw.body.detail",
                  "This is where your free shared drawing stays: one canvas and one shared rhythm."
                )
              : playText(
                  "play.modeContext.draw.body.history",
                  "One shared canvas, a free rhythm, and the drawing that stayed in your story."
                ),
        facts: [
          playText("play.modeContext.draw.factDuration", "7 min"),
          playText("play.modeContext.draw.factCanvas", "One shared canvas"),
          playText("play.modeContext.draw.factRhythm", "Free rhythm"),
        ],
      };
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

export function getPlayResultModeCopy(
  activity: string,
  options?: {
    historyMode?: boolean;
    promptText?: string;
  }
): PlayResultModeCopy {
  const historyMode = Boolean(options?.historyMode);

  switch (activity) {
    case "chain_draw":
      return {
        heroTitle: historyMode
          ? playText("play.resultMode.chainDraw.heroTitle.history", "Your turn-based drawing")
          : playText("play.resultMode.chainDraw.heroTitle.result", "Turn-based drawing is ready"),
        heroBody: historyMode
          ? playText(
              "play.resultMode.chainDraw.heroBody.history",
              "This is where the finished turn-based drawing stays."
            )
          : playText(
              "play.resultMode.chainDraw.heroBody.result",
              "The result of the turn-based drawing that just finished."
            ),
        routeText: historyMode
          ? playText(
              "play.resultMode.chainDraw.route.history",
              "This page keeps the shared context, the replay, and the way back into personal chat."
            )
          : playText(
              "play.resultMode.chainDraw.route.result",
              "From here, the shared result either moves into a personal connection or stays as a saved story."
            ),
      };
    case "daily_prompt":
      return {
        heroTitle: historyMode
          ? playText("play.resultMode.dailyPrompt.heroTitle.history", "Your shared prompt drawing")
          : playText(
              "play.resultMode.dailyPrompt.heroTitle.result",
              "Shared prompt drawing is ready"
            ),
        heroBody: historyMode
          ? playText(
              "play.resultMode.dailyPrompt.heroBody.history",
              "This is where the finished drawing from your shared prompt stays."
            )
          : playText(
              "play.resultMode.dailyPrompt.heroBody.result",
              "The result of the drawing around your shared prompt that just finished."
            ),
        routeText: historyMode
          ? playText(
              "play.resultMode.dailyPrompt.route.history",
              "This page keeps the shared context, the replay, and the way back into personal chat."
            )
          : playText(
              "play.resultMode.dailyPrompt.route.result",
              "From here, the shared result either moves into a personal connection or stays as a saved story."
            ),
      };
    case "color_mood":
      return {
        heroTitle: historyMode
          ? playText("play.resultMode.colorMood.heroTitle.history", "Your shared palette")
          : playText("play.resultMode.colorMood.heroTitle.result", "Your shared palette is ready"),
        heroBody: historyMode
          ? playText(
              "play.resultMode.colorMood.heroBody.history",
              "This is where the finished shared palette stays."
            )
          : playText(
              "play.resultMode.colorMood.heroBody.result",
              "The result of the mood palette that just finished."
            ),
        routeText: historyMode
          ? playText(
              "play.resultMode.colorMood.route.history",
              "This page keeps the shared context, the palette, and the way back into personal chat."
            )
          : playText(
              "play.resultMode.colorMood.route.result",
              "From here, the shared result either moves into a personal connection or stays as a saved story."
            ),
      };
    case "draw":
    default:
      return {
        heroTitle: historyMode
          ? playText("play.resultMode.draw.heroTitle.history", "Your shared drawing")
          : playText("play.resultMode.draw.heroTitle.result", "Your shared drawing is ready"),
        heroBody: historyMode
          ? playText(
              "play.resultMode.draw.heroBody.history",
              "This is where the finished shared drawing stays."
            )
          : playText(
              "play.resultMode.draw.heroBody.result",
              "The result of the shared session that just finished."
            ),
        routeText: historyMode
          ? playText(
              "play.resultMode.draw.route.history",
              "This page keeps the shared context, the replay, and the way back into personal chat."
            )
          : playText(
              "play.resultMode.draw.route.result",
              "From here, the shared result either moves into a personal connection or stays as a saved story."
            ),
      };
  }
}

export function getPlayReplayCopy(activity: string): PlayReplayCopy {
  switch (activity) {
    case "chain_draw":
      return {
        title: playText("play.replay.chainDraw.title", "Replay of the turn-based drawing"),
        body: playText(
          "play.replay.chainDraw.body",
          "The turns run in their original order so you can quickly return to the rhythm of this session."
        ),
        emptyTitle: playText("play.replay.emptyTitle", "Replay is empty for now"),
        emptyBody: playText(
          "play.replay.chainDraw.emptyBody",
          "This session was saved without strokes. The result and connection status stayed, but the replay of the turn-based drawing is unavailable here."
        ),
      };
    case "daily_prompt":
      return {
        title: playText("play.replay.dailyPrompt.title", "Replay of the shared prompt drawing"),
        body: playText(
          "play.replay.dailyPrompt.body",
          "The strokes run in their original order so you can quickly return to this drawing."
        ),
        emptyTitle: playText("play.replay.emptyTitle", "Replay is empty for now"),
        emptyBody: playText(
          "play.replay.dailyPrompt.emptyBody",
          "This session was saved without strokes. The result and the prompt stayed, but the replay of the drawing is unavailable here."
        ),
      };
    case "draw":
    default:
      return {
        title: playText("play.replay.draw.title", "Replay of the shared drawing"),
        body: playText(
          "play.replay.draw.body",
          "The strokes run in their original order so you can quickly return to this shared moment."
        ),
        emptyTitle: playText("play.replay.emptyTitle", "Replay is empty for now"),
        emptyBody: playText(
          "play.replay.draw.emptyBody",
          "This session was saved without strokes. The result and connection status stayed, but the replay is unavailable here."
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
  const paletteChoices = normalizeColorMoodChoices(data.paletteChoices);
  const combinedPalette = normalizeColorMoodPalette(
    data.combinedPalette,
    COLOR_MOOD_OPTIONS.length
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
        shortLabel: playText("play.reveal.openOpen.shortLabel", "Connection is open"),
        description: playText(
          "play.reveal.openOpen.description",
          "After this shared result, both of you opened the connection and moved it into personal chat."
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
          "Both of you chose to keep this moment as a shared story and not move it into personal chat."
        ),
      };
    default:
      return {
        shortLabel: playText("play.reveal.waiting.shortLabel", "Waiting for the second answer"),
        description: playText(
          "play.reveal.waiting.description",
          "One answer is already saved. We are waiting for the second one to see whether the personal chat opens."
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
    nickname: session.participantNicknames[peerUid] ?? makeNickname(peerUid),
  };
}
