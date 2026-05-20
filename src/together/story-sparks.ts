import type { JsonValue, TogetherEventRow } from "../db/schema";

export const STORY_SPARKS_PACK_ID = "first_sparks_v1";
export const STORY_SPARKS_VERSION = 1;
export const STORY_SPARKS_ROUND_IDS = ["place", "detail", "twist", "ending"] as const;

export type StorySparksLanguage = "ru" | "en" | "hr";
export type StorySparksRoundId = (typeof STORY_SPARKS_ROUND_IDS)[number];
export type StorySparksTranslation = Record<StorySparksLanguage, string>;

export type StorySparksCardDto = {
  id: string;
  round: StorySparksRoundId;
  title: StorySparksTranslation;
  subtitle?: StorySparksTranslation;
  emoji: string;
  toneTags?: string[];
};

export type StorySparksRoundDto = {
  id: StorySparksRoundId;
  title: StorySparksTranslation;
  cards: StorySparksCardDto[];
};

export type StorySparksPackDto = {
  packId: string;
  version: number;
  rounds: StorySparksRoundDto[];
};

export type StoryChoicePayload = {
  roundId: StorySparksRoundId;
  cardId: string;
  packId: string;
  clientRoundIndex: number;
};

export type StorySparksArtifactChoiceDto = StoryChoicePayload & {
  fromUserId: string;
  card: StorySparksCardDto;
  createdAt: string;
};

export type StorySparksArtifactRoundDto = {
  roundId: StorySparksRoundId;
  title: StorySparksTranslation;
  choices: StorySparksArtifactChoiceDto[];
};

export type StorySparksArtifactDto = {
  packId: string;
  version: number;
  title: StorySparksTranslation;
  summary: StorySparksTranslation;
  rounds: StorySparksArtifactRoundDto[];
};

const STORY_SPARKS_PACK: StorySparksPackDto = {
  packId: STORY_SPARKS_PACK_ID,
  version: STORY_SPARKS_VERSION,
  rounds: [
    {
      id: "place",
      title: {
        ru: "Место",
        en: "Place",
        hr: "Mjesto",
      },
      cards: [
        {
          id: "night_train",
          round: "place",
          title: {
            ru: "Ночной поезд",
            en: "Night train",
            hr: "Noćni vlak",
          },
          subtitle: {
            ru: "Окно, темнота и тихий стук колёс.",
            en: "A window, the dark, and a quiet rhythm on the rails.",
            hr: "Prozor, tama i tihi ritam kotača.",
          },
          emoji: "🚆",
          toneTags: ["quiet", "travel"],
        },
        {
          id: "small_cafe",
          round: "place",
          title: {
            ru: "Маленькое кафе",
            en: "Small cafe",
            hr: "Mali kafić",
          },
          subtitle: {
            ru: "Тёплый свет, два стула и запах кофе.",
            en: "Warm light, two chairs, and the smell of coffee.",
            hr: "Toplo svjetlo, dvije stolice i miris kave.",
          },
          emoji: "☕",
          toneTags: ["warm", "city"],
        },
        {
          id: "rooftop_after_rain",
          round: "place",
          title: {
            ru: "Крыша после дождя",
            en: "Rooftop after rain",
            hr: "Krov poslije kiše",
          },
          subtitle: {
            ru: "Город блестит, а воздух стал тише.",
            en: "The city shines, and the air has gone quiet.",
            hr: "Grad se sjaji, a zrak je postao tiši.",
          },
          emoji: "🌧️",
          toneTags: ["fresh", "city"],
        },
      ],
    },
    {
      id: "detail",
      title: {
        ru: "Деталь",
        en: "Detail",
        hr: "Detalj",
      },
      cards: [
        {
          id: "lost_key",
          round: "detail",
          title: {
            ru: "Потерянный ключ",
            en: "Lost key",
            hr: "Izgubljeni ključ",
          },
          subtitle: {
            ru: "Он явно открывает что-то важное.",
            en: "It clearly opens something important.",
            hr: "Očito otvara nešto važno.",
          },
          emoji: "🗝️",
          toneTags: ["mystery"],
        },
        {
          id: "old_camera",
          round: "detail",
          title: {
            ru: "Старый фотоаппарат",
            en: "Old camera",
            hr: "Stari fotoaparat",
          },
          subtitle: {
            ru: "Внутри ещё остался один кадр.",
            en: "There is still one frame left inside.",
            hr: "Unutra je ostao još jedan kadar.",
          },
          emoji: "📷",
          toneTags: ["memory"],
        },
        {
          id: "unsigned_note",
          round: "detail",
          title: {
            ru: "Записка без имени",
            en: "Unsigned note",
            hr: "Poruka bez imena",
          },
          subtitle: {
            ru: "Короткая фраза, но слишком точная.",
            en: "A short line, but much too precise.",
            hr: "Kratka rečenica, ali previše točna.",
          },
          emoji: "✉️",
          toneTags: ["mystery"],
        },
      ],
    },
    {
      id: "twist",
      title: {
        ru: "Поворот",
        en: "Twist",
        hr: "Preokret",
      },
      cards: [
        {
          id: "lights_went_out",
          round: "twist",
          title: {
            ru: "Внезапно погас свет",
            en: "The lights suddenly went out",
            hr: "Svjetla su se iznenada ugasila",
          },
          subtitle: {
            ru: "И в темноте стало слышно больше.",
            en: "And in the dark, there was more to hear.",
            hr: "I u mraku se moglo čuti više.",
          },
          emoji: "💡",
          toneTags: ["suspense"],
        },
        {
          id: "recognized_melody",
          round: "twist",
          title: {
            ru: "Кто-то узнал мелодию",
            en: "Someone recognized the melody",
            hr: "Netko je prepoznao melodiju",
          },
          subtitle: {
            ru: "Она уже звучала в важный момент.",
            en: "It had played during an important moment before.",
            hr: "Već je svirala u jednom važnom trenutku.",
          },
          emoji: "🎶",
          toneTags: ["memory"],
        },
        {
          id: "door_opened_itself",
          round: "twist",
          title: {
            ru: "Дверь открылась сама",
            en: "The door opened by itself",
            hr: "Vrata su se sama otvorila",
          },
          subtitle: {
            ru: "Никто не стоял по другую сторону.",
            en: "No one was standing on the other side.",
            hr: "S druge strane nije stajao nitko.",
          },
          emoji: "🚪",
          toneTags: ["mystery"],
        },
      ],
    },
    {
      id: "ending",
      title: {
        ru: "Финал",
        en: "Ending",
        hr: "Završetak",
      },
      cards: [
        {
          id: "meet_again",
          round: "ending",
          title: {
            ru: "Они решили встретиться снова",
            en: "They decided to meet again",
            hr: "Odlučili su se ponovno sresti",
          },
          subtitle: {
            ru: "Не всё нужно объяснять сразу.",
            en: "Not everything needs to be explained at once.",
            hr: "Ne mora se sve objasniti odmah.",
          },
          emoji: "🌙",
          toneTags: ["warm"],
        },
        {
          id: "all_a_joke",
          round: "ending",
          title: {
            ru: "Всё оказалось шуткой",
            en: "It all turned out to be a joke",
            hr: "Sve je ispalo kao šala",
          },
          subtitle: {
            ru: "Но смеялись они уже вместе.",
            en: "But by then they were laughing together.",
            hr: "Ali tada su se već smijali zajedno.",
          },
          emoji: "🙂",
          toneTags: ["playful"],
        },
        {
          id: "story_began",
          round: "ending",
          title: {
            ru: "История только началась",
            en: "The story had only begun",
            hr: "Priča je tek počela",
          },
          subtitle: {
            ru: "Последняя строка стала первой.",
            en: "The last line became the first one.",
            hr: "Posljednji redak postao je prvi.",
          },
          emoji: "✨",
          toneTags: ["open"],
        },
      ],
    },
  ],
};

const CARD_BY_ID = new Map<string, StorySparksCardDto>(
  STORY_SPARKS_PACK.rounds.flatMap((round) => round.cards.map((card) => [card.id, card])),
);

const ROUND_BY_ID = new Map<StorySparksRoundId, StorySparksRoundDto>(
  STORY_SPARKS_PACK.rounds.map((round) => [round.id, round]),
);

export function getStorySparksPackDto(): StorySparksPackDto {
  return STORY_SPARKS_PACK;
}

export function isStorySparksRoundId(value: unknown): value is StorySparksRoundId {
  return STORY_SPARKS_ROUND_IDS.includes(value as StorySparksRoundId);
}

export function getStorySparksCard(cardId: string): StorySparksCardDto | null {
  return CARD_BY_ID.get(cardId) ?? null;
}

export function readStoryChoicePayload(payload: JsonValue): StoryChoicePayload | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const raw = payload as Record<string, JsonValue>;
  const roundId = typeof raw.roundId === "string" ? raw.roundId.trim() : "";
  const cardId = typeof raw.cardId === "string" ? raw.cardId.trim() : "";
  const packId = typeof raw.packId === "string" ? raw.packId.trim() : "";
  const clientRoundIndex =
    typeof raw.clientRoundIndex === "number"
      ? raw.clientRoundIndex
      : typeof raw.clientRoundIndex === "string"
        ? Number(raw.clientRoundIndex)
        : Number.NaN;

  if (!isStorySparksRoundId(roundId) || !cardId || !packId) {
    return null;
  }

  if (!Number.isInteger(clientRoundIndex) || clientRoundIndex < 0) {
    return null;
  }

  return {
    roundId,
    cardId,
    packId,
    clientRoundIndex,
  };
}

export function validateStoryChoicePayload(payload: JsonValue): {
  choice?: StoryChoicePayload;
  details?: Record<string, string>;
} {
  const choice = readStoryChoicePayload(payload);
  if (!choice) {
    return {
      details: {
        payload: "Expected story choice payload with roundId, cardId, packId, and clientRoundIndex",
      },
    };
  }

  if (choice.packId !== STORY_SPARKS_PACK_ID) {
    return { details: { packId: "unknown_story_pack" } };
  }

  const expectedRoundIndex = STORY_SPARKS_ROUND_IDS.indexOf(choice.roundId);
  if (choice.clientRoundIndex !== expectedRoundIndex) {
    return { details: { clientRoundIndex: "round_index_mismatch" } };
  }

  const card = getStorySparksCard(choice.cardId);
  if (!card) {
    return { details: { cardId: "unknown_story_card" } };
  }

  if (card.round !== choice.roundId) {
    return { details: { cardId: "card_round_mismatch" } };
  }

  return { choice };
}

export function isSameStoryChoice(leftPayload: JsonValue, right: StoryChoicePayload): boolean {
  const left = readStoryChoicePayload(leftPayload);
  return Boolean(
    left &&
      left.roundId === right.roundId &&
      left.cardId === right.cardId &&
      left.packId === right.packId &&
      left.clientRoundIndex === right.clientRoundIndex,
  );
}

export function buildStorySparksArtifact(
  events: Pick<
    TogetherEventRow,
    "fromUserId" | "type" | "payload" | "clientEventId" | "createdAt"
  >[],
): StorySparksArtifactDto | null {
  const choicesByRound = new Map<StorySparksRoundId, StorySparksArtifactChoiceDto[]>();
  const seenChoiceKeys = new Set<string>();

  for (const event of events) {
    if (event.type !== "story_choice") {
      continue;
    }

    const choice = readStoryChoicePayload(event.payload);
    if (!choice || choice.packId !== STORY_SPARKS_PACK_ID) {
      continue;
    }

    const card = getStorySparksCard(choice.cardId);
    if (!card || card.round !== choice.roundId) {
      continue;
    }

    const key = `${event.fromUserId}:${choice.roundId}`;
    if (seenChoiceKeys.has(key)) {
      continue;
    }
    seenChoiceKeys.add(key);

    const roundChoices = choicesByRound.get(choice.roundId) ?? [];
    roundChoices.push({
      ...choice,
      fromUserId: event.fromUserId,
      card,
      createdAt: event.createdAt.toISOString(),
    });
    choicesByRound.set(choice.roundId, roundChoices);
  }

  const rounds = STORY_SPARKS_PACK.rounds.map((round) => ({
    roundId: round.id,
    title: round.title,
    choices: [...(choicesByRound.get(round.id) ?? [])].sort((left, right) => {
      const byCreatedAt = Date.parse(left.createdAt) - Date.parse(right.createdAt);
      if (Number.isFinite(byCreatedAt) && byCreatedAt !== 0) {
        return byCreatedAt;
      }

      return left.fromUserId.localeCompare(right.fromUserId);
    }),
  }));

  if (!rounds.some((round) => round.choices.length > 0)) {
    return null;
  }

  return {
    packId: STORY_SPARKS_PACK_ID,
    version: STORY_SPARKS_VERSION,
    title: buildArtifactTitle(rounds),
    summary: buildArtifactSummary(rounds),
    rounds,
  };
}

function buildArtifactTitle(rounds: StorySparksArtifactRoundDto[]): StorySparksTranslation {
  const place = firstChoiceTitle(rounds, "place");
  return {
    ru: place.ru ? `История: ${place.ru}` : "История на двоих",
    en: place.en ? `Story: ${place.en}` : "Story Sparks",
    hr: place.hr ? `Priča: ${place.hr}` : "Iskre priče",
  };
}

function buildArtifactSummary(rounds: StorySparksArtifactRoundDto[]): StorySparksTranslation {
  return {
    ru: `Место: ${roundChoiceList(rounds, "place", "ru")}. Деталь: ${roundChoiceList(rounds, "detail", "ru")}. Поворот: ${roundChoiceList(rounds, "twist", "ru")}. Финал: ${roundChoiceList(rounds, "ending", "ru")}.`,
    en: `Place: ${roundChoiceList(rounds, "place", "en")}. Detail: ${roundChoiceList(rounds, "detail", "en")}. Twist: ${roundChoiceList(rounds, "twist", "en")}. Ending: ${roundChoiceList(rounds, "ending", "en")}.`,
    hr: `Mjesto: ${roundChoiceList(rounds, "place", "hr")}. Detalj: ${roundChoiceList(rounds, "detail", "hr")}. Preokret: ${roundChoiceList(rounds, "twist", "hr")}. Završetak: ${roundChoiceList(rounds, "ending", "hr")}.`,
  };
}

function firstChoiceTitle(
  rounds: StorySparksArtifactRoundDto[],
  roundId: StorySparksRoundId,
): StorySparksTranslation {
  const cardTitle = rounds.find((round) => round.roundId === roundId)?.choices[0]?.card.title;
  return cardTitle ?? { ru: "", en: "", hr: "" };
}

function roundChoiceList(
  rounds: StorySparksArtifactRoundDto[],
  roundId: StorySparksRoundId,
  language: StorySparksLanguage,
): string {
  const round = rounds.find((item) => item.roundId === roundId);
  const titles = [...new Set(round?.choices.map((choice) => choice.card.title[language]) ?? [])];
  if (titles.length === 0) {
    return language === "ru" ? "ещё не выбрано" : language === "hr" ? "još nije odabrano" : "not chosen yet";
  }

  return titles.join(" + ");
}
